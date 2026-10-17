#!/usr/bin/env python3
"""
DashScope (Qwen / FunASR) streaming ASR worker.

Speaks the same newline-delimited JSON protocol as whisper_worker.py so the
Node side can swap engines without touching the service layer:

  Node → worker                       worker → Node
  {"id":1,"cmd":"start",              {"event":"ready", ...}
   "channel":"mic", ...}              {"event":"opened","channel":"mic"}
  {"id":2,"cmd":"audio",              {"id":1,"ok":true}
   "channel":"mic",                   {"event":"partial","channel":"mic","text":"..."}
   "data":"<base64 pcm>"}             {"event":"final","channel":"mic","text":"..."}
  {"id":3,"cmd":"stop",               {"event":"error", ...}
   "channel":"mic"}

Two independent recognizers can run at once (one per capture channel) so the
interviewer's voice and the candidate's voice are transcribed in parallel,
each tagged with its channel. That tag is what lets the app answer only the
interviewer.

Audio frames are base64-encoded in the JSON line because the protocol is
line-oriented; a 100 ms 16 kHz mono frame is ~3.2 KB, ~4.3 KB encoded, which
is well within a comfortable line length.
"""

import base64
import json
import os
import sys
import threading
import time
import traceback

# DashScope is imported lazily so a misconfigured install still produces a
# readable error on the JSON stream instead of dying before the first write.
dashscope = None
Recognition = None
RecognitionCallback = None


def _ensure_sdk():
    global dashscope, Recognition, RecognitionCallback
    if dashscope is not None:
        return
    import dashscope as _dashscope
    from dashscope.audio.asr import Recognition as _Recognition
    from dashscope.audio.asr import RecognitionCallback as _RecognitionCallback

    dashscope = _dashscope
    Recognition = _Recognition
    RecognitionCallback = _RecognitionCallback


def emit(payload):
    """Write one JSON line to stdout. Guarded so a broken pipe never crashes."""
    try:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


class ChannelSession:
    """
    One streaming recognition session for one capture channel.

    The callback runs on the SDK's own thread; every event is pushed straight
    onto stdout so the Node side receives partials and finals in real time.
    """

    def __init__(self, channel, api_key, model, base_url, sample_rate,
                 language_hints=None, disfluency_removal=None,
                 vocabulary_id=None):
        self.channel = channel
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.sample_rate = sample_rate
        self.language_hints = language_hints or []
        self.disfluency_removal = disfluency_removal
        self.vocabulary_id = vocabulary_id
        self.recognition = None
        self.opened = False
        self.closed = False

    def start(self):
        _ensure_sdk()
        dashscope.api_key = self.api_key
        if self.base_url:
            dashscope.base_websocket_api_url = self.base_url

        outer = self

        class _Callback(RecognitionCallback):
            def on_open(self):
                outer.opened = True
                emit({"event": "opened", "channel": outer.channel})

            def on_event(self, result):
                try:
                    sentence = result.get_sentence()
                    # The SDK hands back either a dict (current sentence) or a
                    # list of them. Normalise to "latest text + is it final".
                    text = ""
                    is_final = False
                    if isinstance(sentence, dict):
                        text = sentence.get("text") or ""
                        is_final = bool(sentence.get("sentence_end"))
                    elif isinstance(sentence, list) and sentence:
                        last = sentence[-1]
                        if isinstance(last, dict):
                            text = last.get("text") or ""
                            is_final = bool(last.get("sentence_end"))

                    if not text:
                        return
                    emit({
                        "event": "final" if is_final else "partial",
                        "channel": outer.channel,
                        "text": text,
                    })
                except Exception as exc:
                    emit({"event": "error", "channel": outer.channel,
                          "error": f"callback: {exc}"})

            def on_complete(self):
                emit({"event": "completed", "channel": outer.channel})

            def on_error(self, result):
                message = getattr(result, "message", None) or str(result)
                emit({"event": "error", "channel": outer.channel, "error": message})

            def on_close(self):
                outer.closed = True
                emit({"event": "closed", "channel": outer.channel})

        kwargs = {}
        if self.disfluency_removal is not None:
            kwargs["disfluency_removal_enabled"] = bool(self.disfluency_removal)
        if self.vocabulary_id:
            kwargs["vocabulary_id"] = self.vocabulary_id

        self.recognition = Recognition(
            model=self.model,
            format="pcm",
            sample_rate=self.sample_rate,
            callback=_Callback(),
            **kwargs
        )

        start_kwargs = {}
        if self.language_hints:
            # Only some models accept hints; a rejection is non-fatal because
            # the model auto-detects otherwise.
            start_kwargs["language_hints"] = self.language_hints
        if self.disfluency_removal is not None:
            start_kwargs["disfluency_removal_enabled"] = bool(self.disfluency_removal)

        try:
            self.recognition.start(**start_kwargs)
        except TypeError:
            self.recognition.start()

    def send(self, pcm_bytes):
        if not self.recognition:
            return
        try:
            self.recognition.send_audio_frame(pcm_bytes)
        except Exception as exc:
            emit({"event": "error", "channel": self.channel,
                  "error": f"send: {exc}"})

    def stop(self):
        if not self.recognition:
            return
        try:
            self.recognition.stop()
        except Exception as exc:
            emit({"event": "error", "channel": self.channel,
                  "error": f"stop: {exc}"})


class Worker:
    def __init__(self):
        self.sessions = {}
        self.lock = threading.Lock()

    def handle(self, message):
        cmd = message.get("cmd")
        request_id = message.get("id")

        if cmd == "ping":
            emit({"id": request_id, "ok": True, "pong": True})
            return

        if cmd == "config":
            # Validate credentials up-front so a bad key surfaces immediately
            # rather than as a silent "no transcripts ever" failure.
            api_key = message.get("apiKey") or os.environ.get("DASHSCOPE_API_KEY", "")
            emit({
                "id": request_id,
                "ok": bool(api_key),
                "hasKey": bool(api_key),
                "error": None if api_key else "DASHSCOPE_API_KEY is not set",
            })
            return

        if cmd == "start":
            channel = message.get("channel", "mic")
            with self.lock:
                existing = self.sessions.pop(channel, None)
            if existing:
                try:
                    existing.stop()
                except Exception:
                    pass

            session = ChannelSession(
                channel=channel,
                api_key=message.get("apiKey") or os.environ.get("DASHSCOPE_API_KEY", ""),
                model=message.get("model"),
                base_url=message.get("baseUrl"),
                sample_rate=message.get("sampleRate", 16000),
                language_hints=message.get("languageHints"),
                disfluency_removal=message.get("disfluencyRemoval"),
                vocabulary_id=message.get("vocabularyId"),
            )
            try:
                session.start()
            except Exception as exc:
                emit({"id": request_id, "ok": False, "error": str(exc),
                      "traceback": traceback.format_exc()})
                return
            with self.lock:
                self.sessions[channel] = session
            emit({"id": request_id, "ok": True, "channel": channel})
            return

        if cmd == "audio":
            channel = message.get("channel", "mic")
            with self.lock:
                session = self.sessions.get(channel)
            if not session:
                # Audio arriving before start (or after stop) is dropped
                # silently: it is normal at session boundaries.
                return
            try:
                pcm = base64.b64decode(message.get("data", ""))
            except Exception as exc:
                emit({"event": "error", "channel": channel,
                      "error": f"decode: {exc}"})
                return
            session.send(pcm)
            return

        if cmd == "stop":
            channel = message.get("channel", "mic")
            with self.lock:
                session = self.sessions.pop(channel, None)
            if session:
                session.stop()
            emit({"id": request_id, "ok": True, "channel": channel})
            return

        if cmd == "shutdown":
            with self.lock:
                sessions = list(self.sessions.values())
                self.sessions.clear()
            for session in sessions:
                try:
                    session.stop()
                except Exception:
                    pass
            emit({"id": request_id, "ok": True})
            # Give the SDK a moment to flush the final results.
            time.sleep(0.6)
            sys.exit(0)

        emit({"id": request_id, "ok": False, "error": f"unknown cmd: {cmd}"})


def main():
    worker = Worker()
    emit({
        "event": "ready",
        "engine": "dashscope",
        "python": sys.version.split()[0],
    })

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except Exception as exc:
            emit({"event": "error", "error": f"bad json: {exc}"})
            continue
        try:
            worker.handle(message)
        except Exception as exc:
            emit({"event": "error", "error": str(exc),
                  "traceback": traceback.format_exc()})


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        emit({"event": "fatal", "error": traceback.format_exc()})
        sys.exit(1)
