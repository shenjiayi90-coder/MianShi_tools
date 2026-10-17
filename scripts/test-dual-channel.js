/**
 * Dual-channel speech tests.
 *
 * Verifies the separation logic that lets the app tell the interviewer apart
 * from the candidate:
 *   - each channel owns its own VAD/buffer state
 *   - transcripts carry a speaker label
 *   - only the configured answer source reaches the LLM
 *
 * Run: node scripts/test-dual-channel.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const speechService = require('../src/services/speech.service');

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Build a 16kHz mono PCM16 buffer at a given amplitude (0..1). */
function pcmChunk(ms, amplitude) {
  const samples = Math.round(16000 * (ms / 1000));
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    // Alternate sign so RMS is meaningful rather than a DC offset.
    const v = Math.round(Math.sin(i * 0.1) * amplitude * 32767);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  return buf;
}

function testChannelIsolation() {
  console.log('\n[1] Channel state isolation');
  const { mic, system } = speechService.channels;
  check('mic channel exists', !!mic, mic && mic.id);
  check('system channel exists', !!system, system && system.id);
  check('mic labelled "me"', mic.label === 'me', mic.label);
  check('system labelled "interviewer"', system.label === 'interviewer', system.label);
  check('separate buffer arrays', mic.segmentBuffers !== system.segmentBuffers);
  check('separate VAD state', mic.vadSpeechMs === system.vadSpeechMs && mic !== system);
  check('separate in-flight flags', mic.transcriptionInFlight !== undefined && system.transcriptionInFlight !== undefined);
}

function testIndependentVad() {
  console.log('\n[2] Independent VAD accumulation');
  const { mic, system } = speechService.channels;

  // Reset both, then feed only the system channel loud audio.
  speechService._resetAllChannels();
  mic.capturing = true;
  system.capturing = true;

  const loud = pcmChunk(400, 0.5);
  speechService._ingestWhisperAudio(loud, system);
  speechService._ingestWhisperAudio(loud, system);

  check('system channel accumulated audio', system.segmentBytes > 0, `${system.segmentBytes} bytes`);
  check('system channel is speaking', system.vadSpeaking === true);
  check('mic channel untouched', mic.segmentBytes === 0, `${mic.segmentBytes} bytes`);
  check('mic channel not speaking', mic.vadSpeaking === false);

  // Now feed the mic; the two must not share counters.
  const micBytesBefore = system.segmentBytes;
  speechService._ingestWhisperAudio(loud, mic);
  check('mic accumulated independently', mic.segmentBytes > 0, `${mic.segmentBytes} bytes`);
  check('system buffer unchanged by mic audio', system.segmentBytes === micBytesBefore,
    `${system.segmentBytes} === ${micBytesBefore}`);
}

function testSilenceDiscard() {
  console.log('\n[3] Noise-only audio is discarded per channel');
  speechService._resetAllChannels();
  const { system } = speechService.channels;
  system.capturing = true;

  // Very quiet chunks should never open an utterance.
  const quiet = pcmChunk(200, 0.0001);
  for (let i = 0; i < 6; i++) {
    speechService._ingestWhisperAudio(quiet, system);
  }
  check('quiet audio did not start an utterance', system.vadSpeaking === false);
  check('nothing buffered for transcription', system.segmentBytes === 0, `${system.segmentBytes} bytes`);
}

function testSpeakerRouting() {
  console.log('\n[4] Answer-source routing (who triggers the LLM)');

  const originalSource = process.env.WHISPER_ANSWER_SOURCE;
  const originalSystem = process.env.WHISPER_SYSTEM_AUDIO;

  // interviewer + system audio on → only the interviewer triggers an answer
  process.env.WHISPER_SYSTEM_AUDIO = 'true';
  process.env.WHISPER_ANSWER_SOURCE = 'interviewer';
  check('interviewer mode: interviewer triggers', speechService.shouldAnswerSpeaker('interviewer') === true);
  check('interviewer mode: me does NOT trigger', speechService.shouldAnswerSpeaker('me') === false);

  // me only
  process.env.WHISPER_ANSWER_SOURCE = 'me';
  check('me mode: me triggers', speechService.shouldAnswerSpeaker('me') === true);
  check('me mode: interviewer does NOT trigger', speechService.shouldAnswerSpeaker('interviewer') === false);

  // both
  process.env.WHISPER_ANSWER_SOURCE = 'both';
  check('both mode: interviewer triggers', speechService.shouldAnswerSpeaker('interviewer') === true);
  check('both mode: me triggers', speechService.shouldAnswerSpeaker('me') === true);

  // interviewer requested but the system-audio channel is NOT actually live
  // (capture failed / was never started) → must degrade to 'me' so the app
  // does not go permanently silent. This keys off the live channel state, not
  // the config flag, because the renderer can fail after config says "on".
  process.env.WHISPER_ANSWER_SOURCE = 'interviewer';
  process.env.WHISPER_SYSTEM_AUDIO = 'false';
  const { system } = speechService.channels;
  const wasCapturing = system.capturing;
  system.capturing = false;

  check('interviewer mode without a live system channel degrades to me',
    speechService.getEffectiveAnswerSource() === 'me',
    speechService.getEffectiveAnswerSource());
  check('degraded mode: me still triggers', speechService.shouldAnswerSpeaker('me') === true);
  check('degraded mode: interviewer cannot trigger (no audio source)', speechService.shouldAnswerSpeaker('interviewer') === false);

  // With the channel live, 'interviewer' must be honoured again.
  system.capturing = true;
  check('interviewer mode with a live channel is honoured',
    speechService.getEffectiveAnswerSource() === 'interviewer',
    speechService.getEffectiveAnswerSource());
  check('live mode: interviewer triggers', speechService.shouldAnswerSpeaker('interviewer') === true);
  check('live mode: me does NOT trigger', speechService.shouldAnswerSpeaker('me') === false);

  system.capturing = wasCapturing;

  // restore
  if (originalSource === undefined) delete process.env.WHISPER_ANSWER_SOURCE;
  else process.env.WHISPER_ANSWER_SOURCE = originalSource;
  if (originalSystem === undefined) delete process.env.WHISPER_SYSTEM_AUDIO;
  else process.env.WHISPER_SYSTEM_AUDIO = originalSystem;
}

function testSystemAudioConfig() {
  console.log('\n[5] System-audio enable flag');
  const original = process.env.WHISPER_SYSTEM_AUDIO;

  process.env.WHISPER_SYSTEM_AUDIO = 'true';
  check('explicit true enables', speechService._isSystemAudioEnabled() === true);

  process.env.WHISPER_SYSTEM_AUDIO = 'false';
  check('explicit false disables', speechService._isSystemAudioEnabled() === false);

  process.env.WHISPER_SYSTEM_AUDIO = '1';
  check('"1" enables', speechService._isSystemAudioEnabled() === true);

  delete process.env.WHISPER_SYSTEM_AUDIO;
  check('default is off (opt-in)', speechService._isSystemAudioEnabled() === false);

  if (original === undefined) delete process.env.WHISPER_SYSTEM_AUDIO;
  else process.env.WHISPER_SYSTEM_AUDIO = original;
}

function testDisableChannel() {
  console.log('\n[6] Renderer-reported failure disables the channel');
  speechService._resetAllChannels();
  const { system } = speechService.channels;
  system.capturing = true;

  let statusMessage = null;
  const onStatus = (s) => { statusMessage = s; };
  speechService.on('status', onStatus);

  speechService.disableSystemAudioChannel('test: permission denied');

  check('system channel no longer capturing', system.capturing === false);
  check('status message emitted', !!statusMessage, statusMessage);
  check('isChannelActive reports false', speechService.isChannelActive('system') === false);

  speechService.removeListener('status', onStatus);
}

function testSeparateVadFloors() {
  console.log('\n[7] Per-channel VAD energy floor');
  const { mic, system } = speechService.channels;
  const micFloor = speechService._getVadEnergyFloor(mic);
  const sysFloor = speechService._getVadEnergyFloor(system);
  check('mic floor resolved', micFloor > 0, String(micFloor));
  check('system floor resolved', sysFloor > 0, String(sysFloor));
  check('system floor is lower (loopback is cleaner/louder)', sysFloor <= micFloor,
    `system=${sysFloor} mic=${micFloor}`);
}

(async () => {
  console.log('Dual-channel speech tests');
  try {
    testChannelIsolation();
    testIndependentVad();
    testSilenceDiscard();
    testSpeakerRouting();
    testSystemAudioConfig();
    testDisableChannel();
    testSeparateVadFloors();
  } catch (e) {
    failures++;
    console.error('\nUNEXPECTED ERROR:', e && e.stack ? e.stack : e);
  }
  console.log(`\n${failures === 0 ? 'ALL DUAL-CHANNEL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
