/**
 * Node-side client for the DashScope (Qwen / FunASR) streaming ASR worker.
 *
 * Mirrors the shape of WhisperWorkerService so speech.service.js can treat the
 * two engines the same way, but the model is fundamentally different:
 *
 *   Whisper  — offline, one WAV file per utterance, "is this segment speech?"
 *              is decided locally by a VAD state machine.
 *   DashScope — online, a continuous PCM stream per channel, and the service
 *              itself decides sentence boundaries and returns partials.
 *
 * That difference is why this client exposes a push API (`sendAudio`) plus an
 * event stream rather than a `transcribe(file)` promise.
 *
 * Events emitted:
 *   'partial' (channel, text)  — interim text, useful for a "listening…" hint
 *   'final'   (channel, text)  — a completed sentence, the thing to answer
 *   'opened' / 'closed' (channel)
 *   'error'   (error)
 */

const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const logger = require('../core/logger').createServiceLogger('DASHSCOPE-WORKER');

const DEFAULT_TIMEOUT_MS = 30000;

class DashScopeWorkerService extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.pythonPath = null;
    this.scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'dashscope_worker.py');
    this.apiKey = '';
    this.model = 'qwen-audio-3.0-asr-flash-streaming';
    this.baseUrl = 'wss://maas.qianwenaiapi.com/api-ws/v1/inference';
    this.sampleRate = 16000;
    this.languageHints = [];
    this.disfluencyRemoval = null;
    this.vocabularyId = null;
    this.pending = new Map();
    this.sequence = 0;
    this.ready = false;
    this.closing = false;
    this.starting = null;
  }

  configure(options = {}) {
    if (options.pythonPath) this.pythonPath = options.pythonPath;
    if (options.scriptPath) this.scriptPath = options.scriptPath;
    if (options.apiKey !== undefined) this.apiKey = options.apiKey;
    if (options.model) this.model = options.model;
    if (options.baseUrl) this.baseUrl = options.baseUrl;
    if (options.sampleRate) this.sampleRate = options.sampleRate;
    if (options.languageHints) this.languageHints = options.languageHints;
    if (options.disfluencyRemoval !== undefined) this.disfluencyRemoval = options.disfluencyRemoval;
    if (options.vocabularyId !== undefined) this.vocabularyId = options.vocabularyId;
  }

  isConfigured() {
    return !!(this.pythonPath && this.scriptPath && this.apiKey);
  }

  /** Start the worker process if it is not already running. */
  async ensureStarted() {
    if (this.process && this.ready) return true;
    if (this.starting) return this.starting;

    this.starting = new Promise((resolve, reject) => {
      if (!this.isConfigured()) {
        this.starting = null;
        reject(new Error('DashScope worker is not configured (pythonPath / apiKey missing)'));
        return;
      }

      logger.info('Starting DashScope worker', {
        pythonPath: this.pythonPath,
        model: this.model,
        baseUrl: this.baseUrl
      });

      const child = spawn(this.pythonPath, ['-u', this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          // Force UTF-8 stdio: on a zh-CN Windows the default GBK code page
          // corrupts Chinese transcripts and tracebacks.
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          DASHSCOPE_API_KEY: this.apiKey
        }
      });
      this.process = child;
      this.closing = false;

      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', (line) => this._handleLine(line));

      child.stderr.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (message) {
          logger.warn('DashScope worker stderr', { message: message.substring(0, 1200) });
        }
      });

      child.on('error', (error) => {
        logger.error('DashScope worker process error', { error: error.message });
        this.ready = false;
        this._rejectAll(error);
        reject(error);
      });

      child.on('close', (code) => {
        logger.info('DashScope worker exited', { code });
        this.ready = false;
        this.process = null;
        this.starting = null;
        if (!this.closing && code !== 0) {
          this.emit('error', new Error(`DashScope worker exited with code ${code}`));
        }
        this._rejectAll(new Error(`DashScope worker exited with code ${code}`));
      });

      // The worker announces readiness on stdout; resolve on that rather than
      // on spawn, so callers never race the Python import.
      const readyTimer = setTimeout(() => {
        reject(new Error('DashScope worker did not become ready in time'));
      }, DEFAULT_TIMEOUT_MS);

      this.once('_ready', () => {
        clearTimeout(readyTimer);
        this.starting = null;
        resolve(true);
      });
    });

    return this.starting;
  }

  _handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (_) {
      logger.debug('Ignoring non-JSON worker output', { line: String(line).slice(0, 300) });
      return;
    }

    if (message.event === 'ready') {
      this.ready = true;
      logger.info('DashScope worker ready', message);
      this.emit('_ready', message);
      return;
    }

    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.ok) {
        pending.resolve(message);
      } else {
        const error = new Error(message.error || 'DashScope worker request failed');
        error.workerTraceback = message.traceback;
        pending.reject(error);
      }
      return;
    }

    switch (message.event) {
      case 'partial':
        this.emit('partial', message.channel, message.text);
        break;
      case 'final':
        this.emit('final', message.channel, message.text);
        break;
      case 'opened':
        this.emit('opened', message.channel);
        break;
      case 'closed':
        this.emit('closed', message.channel);
        break;
      case 'completed':
        this.emit('completed', message.channel);
        break;
      case 'error':
        logger.warn('DashScope worker reported an error', {
          channel: message.channel,
          error: message.error
        });
        this.emit('error', new Error(message.error || 'DashScope error'));
        break;
      default:
        logger.debug('Unhandled worker message', { event: message.event });
    }
  }

  _request(payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!this.process) {
      return Promise.reject(new Error('DashScope worker is not running'));
    }
    const id = ++this.sequence;
    const request = { ...payload, id };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DashScope worker timed out after ${timeoutMs}ms (${payload.cmd})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });

      this.process.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  /** Validate the API key by starting the worker and asking it to check config. */
  async verifyCredentials() {
    await this.ensureStarted();
    return this._request({
      cmd: 'config',
      apiKey: this.apiKey
    });
  }

  /** Open a streaming recognition session for one channel. */
  async startChannel(channel) {
    await this.ensureStarted();
    return this._request({
      cmd: 'start',
      channel,
      apiKey: this.apiKey,
      model: this.model,
      baseUrl: this.baseUrl,
      sampleRate: this.sampleRate,
      languageHints: this.languageHints,
      disfluencyRemoval: this.disfluencyRemoval,
      vocabularyId: this.vocabularyId
    }, 20000);
  }

  /**
   * Push one PCM frame. Fire-and-forget: audio is high-frequency and the
   * protocol is ordered, so awaiting each frame would add latency for no gain.
   */
  sendAudio(channel, pcmBuffer) {
    if (!this.process || !this.process.stdin.writable) return;
    const payload = {
      cmd: 'audio',
      channel,
      data: Buffer.from(pcmBuffer).toString('base64')
    };
    try {
      this.process.stdin.write(`${JSON.stringify(payload)}\n`);
    } catch (error) {
      logger.debug('Failed to write audio frame', { error: error.message, channel });
    }
  }

  /** Close one channel's session (keeps the worker alive for the next one). */
  async stopChannel(channel) {
    if (!this.process) return { ok: true, skipped: true };
    try {
      return await this._request({ cmd: 'stop', channel }, 15000);
    } catch (error) {
      logger.debug('stopChannel failed', { error: error.message, channel });
      return { ok: false, error: error.message };
    }
  }

  /** Stop the worker process entirely (e.g. on app quit). */
  async close() {
    this.closing = true;
    if (!this.process) return;
    try {
      await this._request({ cmd: 'shutdown' }, 5000);
    } catch (_) {
      // Worker may already be gone; fall through to a hard kill.
    }
    try {
      this.process.kill();
    } catch (_) { /* ignore */ }
    this.process = null;
    this.ready = false;
  }

  _rejectAll(error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

module.exports = DashScopeWorkerService;
