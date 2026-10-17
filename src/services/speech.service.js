// Enhanced polyfills for Azure Speech SDK in Node.js environment
if (typeof window === 'undefined') {
  global.window = {
    navigator: {
      userAgent: 'Node.js',
      platform: 'node',
      mediaDevices: {
        getUserMedia: () => Promise.resolve({
          getAudioTracks: () => [],
          getTracks: () => [],
          stop: () => {}
        }),
        getSupportedConstraints: () => ({
          audio: true,
          video: false,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: true,
          sampleSize: true,
          channelCount: true
        }),
        enumerateDevices: () => Promise.resolve([
          {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default - Microphone',
            groupId: 'default'
          }
        ])
      }
    },
    document: {
      createElement: (tagName) => {
        const element = {
          addEventListener: () => {},
          removeEventListener: () => {},
          setAttribute: () => {},
          getAttribute: () => null,
          style: {},
          tagName: tagName.toUpperCase(),
          nodeType: 1,
          nodeName: tagName.toUpperCase(),
          appendChild: () => {},
          removeChild: () => {},
          insertBefore: () => {},
          cloneNode: () => element,
          hasAttribute: () => false,
          removeAttribute: () => {},
          click: () => {},
          focus: () => {},
          blur: () => {}
        };

        if (tagName.toLowerCase() === 'audio') {
          Object.assign(element, {
            play: () => Promise.resolve(),
            pause: () => {},
            load: () => {},
            canPlayType: () => 'probably',
            volume: 1,
            muted: false,
            paused: true,
            ended: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            defaultPlaybackRate: 1,
            readyState: 4,
            networkState: 1,
            autoplay: false,
            loop: false,
            controls: false,
            crossOrigin: null,
            preload: 'metadata',
            src: '',
            currentSrc: ''
          });
        }

        return element;
      },
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      },
      head: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      }
    },
    location: {
      href: 'file:///',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'file://'
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (callback) => global.setTimeout(callback, 16),
    cancelAnimationFrame: global.clearTimeout,
    console: global.console || {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    },
    AudioContext: class AudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    webkitAudioContext: class webkitAudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    URL: class URL {
      constructor(url) {
        this.href = url;
        this.protocol = 'https:';
        this.host = 'localhost';
        this.hostname = 'localhost';
        this.port = '';
        this.pathname = '/';
        this.search = '';
        this.hash = '';
        this.origin = 'https://localhost';
      }
      toString() {
        return this.href;
      }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() {
        return new Blob();
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() {
        return new File([], this.name);
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    }
  };
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.AudioContext = global.window.AudioContext;
  global.webkitAudioContext = global.window.webkitAudioContext;
  global.URL = global.window.URL;
  global.Blob = global.window.Blob;
  global.File = global.window.File;

  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      clearMarks: () => {},
      clearMeasures: () => {},
      getEntriesByName: () => [],
      getEntriesByType: () => []
    };
  }

  if (!global.crypto) {
    global.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    };
  }
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');
const WhisperWorkerService = require('./whisper-worker.service');
const DashScopeWorkerService = require('./dashscope-worker.service');

/**
 * Environment for spawning Python/Whisper child processes.
 *
 * On non-UTF-8 Windows locales (zh-CN, ja-JP, ko-KR, …) Python defaults its
 * stdio encoding to the legacy ANSI code page (GBK/CP936 on zh-CN). Whisper's
 * argparse help text and some transcript output contain characters that code
 * page cannot represent, so the process dies with:
 *
 *   UnicodeEncodeError: 'gbk' codec can't encode character '\xbf'
 *
 * That failure is fatal for two things: the CLI probe (`--help`) never prints
 * `usage:`, so the mic button stays hidden; and real transcription can crash
 * mid-run. Forcing UTF-8 for the child makes both work regardless of the
 * system locale.
 *
 * PYTHONUTF8=1 covers Python 3.7+ (including the `-X utf8` behaviour) while
 * PYTHONIOENCODING is kept for older interpreters and for tools that read it
 * directly.
 */
function pythonChildEnv(extra = {}) {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    ...extra
  };
}

let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logger.warn('Azure Speech SDK unavailable', { error: error.message });
}

let recorder = null;
try {
  recorder = require('node-record-lpcm16');
} catch (error) {
  logger.warn('Local audio recorder dependency unavailable', { error: error.message });
}

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.pushStream = null;
    this.recording = null;
    this.available = false;
    this.provider = 'disabled';
    this.runtimeSettings = {};
    this.segmentTimer = null;
    this.audioProgram = null;
    this.whisperCommand = null;
    this.whisperWorker = new WhisperWorkerService();
    this.dashscopeWorker = new DashScopeWorkerService();
    this.isProcessingAudio = false;

    // Two independent capture channels so the interviewer's voice (system
    // audio / loopback) and the candidate's voice (microphone) never share a
    // VAD state machine or a segment buffer. Mixing them into one stream is
    // what made the app unable to tell who was speaking.
    this.channels = {
      mic: this._createChannelState('mic', 'me'),
      system: this._createChannelState('system', 'interviewer')
    };
    this._resetVadState();

    this._wireDashScopeEvents();

    this.initializeClient();
  }

  /**
   * Bridge DashScope worker events onto the service's own event stream.
   *
   * DashScope decides sentence boundaries server-side, so unlike the Whisper
   * path there is no local VAD involved: a `final` event IS a finished
   * utterance and can be forwarded straight to the app with its speaker label.
   */
  _wireDashScopeEvents() {
    this.dashscopeWorker.on('final', (channelId, text) => {
      const ch = this.channels && this.channels[channelId];
      if (!ch) return;
      const clean = (text || '').trim();
      if (!clean) return;
      logger.info('DashScope final sentence', {
        channel: channelId,
        speaker: ch.label,
        textLength: clean.length,
        text: clean.slice(0, 300)
      });
      this.emit('transcription', clean, { channel: ch.id, speaker: ch.label });
    });

    this.dashscopeWorker.on('partial', (channelId, text) => {
      const clean = (text || '').trim();
      if (!clean) return;
      // Surfaced as interim text so the overlay can show "listening…" while
      // the sentence is still being spoken.
      this.emit('interim-transcription', clean);
    });

    this.dashscopeWorker.on('opened', (channelId) => {
      logger.info('DashScope channel opened', { channel: channelId });
    });

    this.dashscopeWorker.on('closed', (channelId) => {
      logger.info('DashScope channel closed', { channel: channelId });
    });

    this.dashscopeWorker.on('error', (error) => {
      logger.warn('DashScope worker error', { error: error.message });
      this.emit('error', `Speech recognition error: ${error.message}`);
    });
  }

  /**
   * Per-channel VAD + segmentation state.
   *
   * Each channel runs its own voice-activity detector and its own transcription
   * queue, so a long question from the interviewer and a short remark from the
   * candidate can be in flight at the same time without corrupting each other.
   *
   * @param {string} id    'mic' | 'system'
   * @param {string} label 'me' | 'interviewer' — the speaker this channel carries
   */
  _createChannelState(id, label) {
    return {
      id,
      label,
      segmentBuffers: [],
      segmentBytes: 0,
      vadSpeaking: false,
      vadSpeechMs: 0,
      vadSilenceMs: 0,
      vadNoiseFloor: 0,
      vadNoiseInit: false,
      vadPreRoll: [],
      vadPreRollMs: 0,
      vadLastChunkAt: 0,
      transcriptionInFlight: false,
      pendingFlush: false,
      pendingFinal: false,
      manualStopRequested: false,
      capturing: false
    };
  }

  /** True when the given channel should be capturing audio right now. */
  isChannelActive(channelId) {
    const ch = this.channels && this.channels[channelId];
    return !!(ch && ch.capturing);
  }

  /**
   * Stop the system-audio channel and flush whatever it already captured.
   *
   * Called when the renderer reports it could not obtain loopback audio, so the
   * interviewer channel does not sit "active" forever waiting for chunks.
   */
  disableSystemAudioChannel(reason = 'unavailable') {
    const ch = this.channels && this.channels.system;
    if (!ch || !ch.capturing) {
      return;
    }
    logger.warn('Disabling system-audio channel', { reason });
    ch.capturing = false;
    this.emit('status', 'System audio unavailable; using microphone only');
    if (ch.segmentBytes) {
      this._flushWhisperSegment({ final: true, channel: ch }).catch((error) => {
        logger.error('Final system-audio transcription failed', { error: error.message });
      });
    }
  }

  initializeClient() {
    this._cleanup();
    this.provider = 'disabled';
    this.available = false;
    this.speechConfig = null;
    this.whisperCommand = null;

    const provider = this._getConfiguredProvider();
    this.provider = provider;

    if (provider === 'azure') {
      this._initializeAzureClient();
      return;
    }

    if (provider === 'whisper') {
      this._initializeWhisperClient();
      return;
    }

    if (provider === 'dashscope') {
      this._initializeDashScopeClient();
      return;
    }

    const reason = 'Speech recognition disabled. Configure Azure or local Whisper.';
    logger.warn(reason);
    this.emit('status', reason);
  }

  _initializeAzureClient() {
    try {
      if (!sdk) {
        throw new Error('Azure Speech SDK dependency is not installed');
      }

      if (!recorder || typeof recorder.record !== 'function') {
        throw new Error('Local microphone recorder dependency is not installed');
      }

      const subscriptionKey = this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY;
      const region = this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION;

      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing Azure credentials)');
        this.emit('status', reason);
        return;
      }

      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);

      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '5000');
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '2000');

      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }

      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }

      this.available = true;
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      this.emit('status', 'Azure Speech Services ready');
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Azure speech unavailable');
    }
  }

  _initializeWhisperClient() {
    try {
      this.whisperCommand = this._resolveWhisperCommand();
      if (!this.whisperCommand) {
        const reason = 'Local Whisper unavailable. Install the Whisper CLI or set WHISPER_COMMAND.';
        logger.warn(reason);
        this.emit('status', reason);
        return;
      }

      this.available = true;
      this._configureWhisperWorker();
      logger.info('Local Whisper service initialized successfully', {
        command: [this.whisperCommand.command, ...this.whisperCommand.baseArgs].join(' '),
        model: this._getWhisperModel(),
        language: this._getWhisperLanguage()
      });
      this.emit('status', 'Local Whisper ready');
    } catch (error) {
      logger.error('Failed to initialize local Whisper client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Local Whisper unavailable');
    }
  }

  async startRecording() {
    try {
      if (!this.available) {
        const errorMsg = `Speech provider "${this.provider}" is not available`;
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }

      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      if (this.isProcessingAudio) {
        this.emit('status', 'Please wait for the current transcription to finish');
        return;
      }

      this.sessionStartTime = Date.now();
      this.retryCount = 0;

      if (this.provider === 'azure') {
        this._startAzureRecording();
        return;
      }

      if (this.provider === 'whisper') {
        this._startWhisperRecording();
        return;
      }

      if (this.provider === 'dashscope') {
        await this._startDashScopeRecording();
        return;
      }

      throw new Error(`Unsupported speech provider: ${this.provider}`);
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _startAzureRecording() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    this.isRecording = true;
    this.emit('recording-started');
    this.emit('status', 'Azure recording started');
    this._cleanup();

    try {
      this.pushStream = sdk.AudioInputStream.createPushStream();
      this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
      this._startMicrophoneCapture();
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
    } catch (error) {
      logger.error('Failed to start Azure recording session', { error: error.message });
      this.emit('error', `Audio configuration failed: ${error.message}`);
      this.isRecording = false;
      return;
    }

    this.recognizer.recognizing = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          this.emit('interim-transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognizing handler', { error: error.message });
      }
    };

    this.recognizer.recognized = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text && e.result.text.trim()) {
          this.emit('transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognized handler', { error: error.message });
      }
    };

    this.recognizer.canceled = (s, e) => {
      logger.warn('Recognition session canceled', {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails
      });

      if (e.reason === sdk.CancellationReason.Error) {
        const details = e.errorDetails || '';
        if (details.includes('1006')) {
          this.emit('error', 'Network connection failed. Please check your internet connection.');
        } else if (details.includes('InvalidServiceCredentials')) {
          this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
        } else if (details.includes('Forbidden')) {
          this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
        } else if (details.includes('AudioInputMicrophone_InitializationFailure')) {
          this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
        } else {
          this.emit('error', `Recognition error: ${details}`);
        }
      }

      this.stopRecording();
    };

    this.recognizer.sessionStarted = (s, e) => {
      logger.info('Recognition session started', { sessionId: e.sessionId });
    };

    this.recognizer.sessionStopped = () => {
      this.stopRecording();
    };

    const startTimeout = setTimeout(() => {
      logger.error('Recognition start timeout');
      this.emit('error', 'Speech recognition start timeout. Please try again.');
      this.stopRecording();
    }, 10000);

    this.recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(startTimeout);
        logger.info('Continuous Azure speech recognition started successfully');
      },
      (error) => {
        clearTimeout(startTimeout);
        logger.error('Failed to start continuous recognition', { error: error.toString() });
        this.emit('error', `Recognition startup failed: ${error}`);
        this.isRecording = false;
        this._cleanup();
      }
    );
  }

  _startWhisperRecording() {
    this._cleanup();
    this.isRecording = true;
    this._resetAllChannels();
    this.emit('recording-started');
    this.emit('status', 'Local Whisper recording started');

    if (this.whisperWorker.isConfigured()) {
      this.whisperWorker.warmup({
        model: this._getWhisperModel(),
        modelDir: this._getWhisperModelDir(),
        device: this._getWhisperDevice()
      }).then((result) => {
        logger.info('Whisper GPU warmup completed while recording', {
          model: result.model,
          device: result.device,
          gpu: result.gpu
        });
      }).catch((error) => {
        logger.warn('Whisper warmup failed; transcription will use fallback', {
          error: error.message
        });
      });
    }

    // Capture microphone audio in the renderer via the Web Audio API on Windows
    // and macOS. Windows lacks the Unix sox/rec/arecord tools node-record-lpcm16
    // needs; macOS would otherwise require a Homebrew `sox` install (not bundled)
    // and a child-process mic that the system TCC prompt can't attribute. The
    // renderer path uses getUserMedia, which macOS prompts for cleanly via the
    // app's NSMicrophoneUsageDescription. Linux keeps the native recorder path.
    this.useRendererCapture = process.platform === 'win32' || process.platform === 'darwin';

    // The microphone channel always runs: it carries the candidate's own voice.
    this.channels.mic.capturing = true;

    // The system-audio channel carries the interviewer. Only the renderer path
    // can capture it (getDisplayMedia loopback), and only when the user has
    // enabled it — capturing system audio on macOS requires an extra permission
    // and on Linux has no equivalent, so it stays opt-in.
    const systemAudioEnabled = this._isSystemAudioEnabled() && this.useRendererCapture;
    this.channels.system.capturing = systemAudioEnabled;

    if (systemAudioEnabled) {
      this.emit('status', 'Listening to microphone and system audio…');
    } else {
      this.emit('status', 'Waiting for microphone audio…');
    }

    if (this.useRendererCapture) {
      // The renderer starts sending chunks once it receives the recording-started
      // event, tagged with which channel they came from.
      if (!this._isManualCaptureMode()) {
        this._startSegmentWatchdog();
      }
      return;
    }

    this._startMicrophoneCapture();
    if (!this._isManualCaptureMode()) {
      this._startSegmentWatchdog();
    }

  }

  /**
   * Reset every channel's buffers and VAD state. Called at the start of a
   * recording session so a previous session's partial utterance cannot leak in.
   */
  _resetAllChannels() {
    if (!this.channels) return;
    for (const ch of Object.values(this.channels)) {
      if (!ch) continue;
      ch.segmentBuffers = [];
      ch.segmentBytes = 0;
      ch.transcriptionInFlight = false;
      ch.pendingFlush = false;
      ch.pendingFinal = false;
      ch.manualStopRequested = false;
      this._resetVadState(ch);
    }
  }

  /**
   * Start a DashScope cloud session.
   *
   * Unlike Whisper there is no local VAD and no segment buffering: audio is
   * piped straight to one streaming recognizer per channel, and the service
   * returns completed sentences. Keeping one recognizer per channel is what
   * preserves the interviewer/me distinction in the cloud path.
   */
  async _startDashScopeRecording() {
    this._cleanup();
    this.isRecording = true;
    this._resetAllChannels();
    this.emit('recording-started');
    this.emit('status', 'Connecting to cloud speech recognition…');

    this.useRendererCapture = process.platform === 'win32' || process.platform === 'darwin';

    // The microphone channel always runs: it carries the candidate's own voice.
    this.channels.mic.capturing = true;

    // The system-audio channel carries the interviewer. Only the renderer path
    // can capture it (getDisplayMedia loopback) and only when the user enabled
    // it, so it stays opt-in.
    const systemAudioEnabled = this._isSystemAudioEnabled() && this.useRendererCapture;
    this.channels.system.capturing = systemAudioEnabled;

    try {
      await this.dashscopeWorker.startChannel('mic');
      logger.info('DashScope microphone channel started');
    } catch (error) {
      logger.error('Failed to start DashScope microphone channel', {
        error: error.message,
        traceback: error.workerTraceback
      });
      this.isRecording = false;
      this.channels.mic.capturing = false;
      this.emit('error', `Cloud speech recognition failed to start: ${error.message}`);
      this.emit('recording-stopped');
      return;
    }

    if (systemAudioEnabled) {
      try {
        await this.dashscopeWorker.startChannel('system');
        logger.info('DashScope system-audio channel started');
        this.emit('status', 'Listening to microphone and system audio…');
      } catch (error) {
        // A failed interviewer channel must not kill the session: fall back to
        // microphone-only so the user still gets answers.
        logger.warn('Failed to start DashScope system channel; continuing with microphone only', {
          error: error.message
        });
        this.channels.system.capturing = false;
        this.emit('status', 'System audio unavailable; using microphone only');
      }
    } else {
      this.emit('status', 'Listening to microphone…');
    }
  }

  /** Flush and close every DashScope channel. */
  async _finalizeDashScopeStop() {
    const channels = ['mic', 'system'];
    for (const channelId of channels) {
      try {
        await this.dashscopeWorker.stopChannel(channelId);
      } catch (error) {
        logger.debug('DashScope channel stop failed', { channel: channelId, error: error.message });
      }
    }
    // Give the service a moment to deliver the last sentence before tearing
    // anything down — cutting too early loses the final words of a question.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    this.isProcessingAudio = false;
    this.emit('status', 'Recording stopped');
  }

  /**
   * Reset the voice-activity-detection state machine for one channel. VAD
   * replaces the old fixed-interval segmentation: instead of cutting audio
   * every N seconds (which split sentences mid-word and transcribed silent
   * windows), we accumulate audio while that speaker talks and flush a segment
   * once a natural pause is detected.
   *
   * @param {object} [channel] defaults to the microphone channel
   */
  _resetVadState(channel = null) {
    const ch = channel || (this.channels && this.channels.mic);
    if (!ch) return;
    ch.vadSpeaking = false;        // currently inside an utterance
    ch.vadSpeechMs = 0;            // accumulated voiced audio in this segment
    ch.vadSilenceMs = 0;           // trailing silence since last voiced chunk
    ch.vadNoiseFloor = 0;          // adaptive EMA of background energy
    ch.vadNoiseInit = false;       // has the noise floor been seeded
    ch.vadPreRoll = [];            // ring of recent pre-speech chunks
    ch.vadPreRollMs = 0;           // duration held in the pre-roll ring
    ch.vadLastChunkAt = 0;         // timestamp of the last ingested chunk
  }

  /**
   * Lightweight watchdog. Silence is normally detected from incoming chunks
   * (which keep flowing at low energy), but if the capture pipeline stalls
   * mid-utterance we still want to flush what we have. The watchdog also
   * enforces the max-utterance cap as a backstop.
   *
   * Runs across every active channel so a stalled system-audio stream cannot
   * hold the interviewer's question hostage.
   */
  _startSegmentWatchdog() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
    }
    this.segmentTimer = setInterval(() => {
      if (!this.isRecording || this.provider !== 'whisper') {
        return;
      }

      for (const ch of this._activeChannels()) {
        // VAD disabled (fallback): preserve the legacy fixed-window behaviour by
        // flushing once the accumulated audio reaches the configured segment size.
        if (!this._isVadEnabled()) {
          if (ch.segmentBytes && ch.vadSpeechMs >= this._getWhisperSegmentMs()) {
            this._endUtteranceFlush(ch);
          }
          continue;
        }

        // If we're mid-utterance and no audio has arrived recently, the source
        // may have stalled — flush what we captured rather than holding it.
        const sinceLastChunk = ch.vadLastChunkAt ? Date.now() - ch.vadLastChunkAt : 0;
        const stalled = ch.vadSpeaking && sinceLastChunk > 1500;
        const tooLong = ch.vadSpeaking && ch.vadSpeechMs >= this._getMaxUtteranceMs();
        if (stalled || tooLong) {
          this._endUtteranceFlush(ch);
        }
      }
    }, 500);
  }

  /** Channels that are currently capturing audio. */
  _activeChannels() {
    if (!this.channels) return [];
    return Object.values(this.channels).filter((ch) => ch && ch.capturing);
  }

  /**
   * Receive raw 16kHz mono 16-bit PCM audio from the renderer.
   *
   * Routes to the active engine. For DashScope the frame is piped straight
   * through to that channel's streaming recognizer — no local VAD, because the
   * cloud service performs its own endpointing and returns whole sentences.
   *
   * @param {Buffer|ArrayBuffer} chunk
   * @param {string} [channelId] 'mic' (default) or 'system'
   */
  handleAudioChunkFromRenderer(chunk, channelId = 'mic') {
    if (!this.isRecording) {
      return;
    }
    const ch = this.channels && this.channels[channelId];
    if (!ch || !ch.capturing) {
      return;
    }
    if (!chunk || !chunk.length) {
      return;
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    if (this.provider === 'dashscope') {
      this.dashscopeWorker.sendAudio(channelId, buffer);
      return;
    }

    if (this.provider === 'whisper') {
      this._ingestWhisperAudio(buffer, ch);
    }
  }

  /**
   * Compute the RMS energy (normalized to 0..1) of a 16-bit little-endian PCM
   * buffer. Used as the voice-activity signal.
   */
  _chunkRmsEnergy(buffer) {
    const sampleCount = Math.floor(buffer.length / 2);
    if (sampleCount === 0) {
      return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
      const sample = buffer.readInt16LE(i * 2) / 32768;
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / sampleCount);
  }

  /**
   * Single ingest path for both capture backends. Runs the VAD state machine
   * for ONE channel: accumulate audio while that speaker talks, and flush the
   * segment to Whisper once a natural pause is detected. Falls back to plain
   * buffering when VAD is disabled.
   *
   * @param {Buffer} buffer
   * @param {object} ch channel state from this.channels
   */
  _ingestWhisperAudio(buffer, ch) {
    if (!buffer || !buffer.length || !ch) {
      return;
    }

    if (this._isManualCaptureMode()) {
      ch.segmentBuffers.push(buffer);
      ch.segmentBytes += buffer.length;
      ch.vadLastChunkAt = Date.now();

      const capturedMs = ch.segmentBytes / 32;
      if (!ch.manualStopRequested && capturedMs >= this._getManualCaptureMaxMs()) {
        ch.manualStopRequested = true;
        this.emit('status', 'Maximum recording duration reached; processing audio');
        setImmediate(() => this.stopRecording());
      }
      return;
    }

    if (!this._isVadEnabled()) {
      // Legacy behaviour: the watchdog/max-utterance cap drives flushing.
      ch.segmentBuffers.push(buffer);
      ch.segmentBytes += buffer.length;
      ch.vadSpeaking = true;
      ch.vadSpeechMs += this._chunkDurationMs(buffer);
      ch.vadLastChunkAt = Date.now();
      return;
    }

    ch.vadLastChunkAt = Date.now();
    const chunkMs = this._chunkDurationMs(buffer);
    const energy = this._chunkRmsEnergy(buffer);

    const floor = this._getVadEnergyFloor(ch);
    // Seed / adapt the background noise floor while not actively speaking so
    // the threshold tracks the room rather than a hard-coded constant. Seed
    // conservatively: if the very first chunk is already loud (the user started
    // talking immediately), clamp to the configured floor so a high seed can't
    // push the enter-threshold out of reach and stall VAD for the whole session.
    if (!ch.vadNoiseInit) {
      ch.vadNoiseFloor = Math.min(energy, floor);
      ch.vadNoiseInit = true;
    }
    // Hysteresis: it takes more energy to *start* an utterance than to keep
    // one going, so a brief dip mid-sentence doesn't end it prematurely.
    const enterThreshold = Math.max(floor, ch.vadNoiseFloor * 2.5);
    const exitThreshold = Math.max(floor * 0.7, ch.vadNoiseFloor * 1.6);
    const isVoiced = ch.vadSpeaking ? energy >= exitThreshold : energy >= enterThreshold;

    if (!ch.vadSpeaking) {
      if (isVoiced) {
        // Speech onset: prepend the pre-roll so the first syllable survives.
        ch.vadSpeaking = true;
        ch.vadSpeechMs = 0;
        ch.vadSilenceMs = 0;
        for (const pre of ch.vadPreRoll) {
          ch.segmentBuffers.push(pre);
          ch.segmentBytes += pre.length;
        }
        ch.vadPreRoll = [];
        ch.vadPreRollMs = 0;
        ch.segmentBuffers.push(buffer);
        ch.segmentBytes += buffer.length;
        ch.vadSpeechMs += chunkMs;
      } else {
        // Background: adapt the noise floor and keep a short pre-roll ring.
        ch.vadNoiseFloor = ch.vadNoiseFloor * 0.95 + energy * 0.05;
        ch.vadPreRoll.push(buffer);
        ch.vadPreRollMs += chunkMs;
        const preRollLimit = this._getPreRollMs();
        while (ch.vadPreRollMs > preRollLimit && ch.vadPreRoll.length > 1) {
          const dropped = ch.vadPreRoll.shift();
          ch.vadPreRollMs -= this._chunkDurationMs(dropped);
        }
      }
      return;
    }

    // Already speaking: keep capturing (including trailing silence so word
    // endings aren't clipped) and watch for a pause that ends the utterance.
    ch.segmentBuffers.push(buffer);
    ch.segmentBytes += buffer.length;
    if (isVoiced) {
      ch.vadSpeechMs += chunkMs;
      ch.vadSilenceMs = 0;
    } else {
      ch.vadSilenceMs += chunkMs;
    }

    const pausedLongEnough = ch.vadSilenceMs >= this._getSilenceHangoverMs();
    const haveRealSpeech = ch.vadSpeechMs >= this._getMinUtteranceMs();
    const tooLong = ch.vadSpeechMs >= this._getMaxUtteranceMs();

    if ((pausedLongEnough && haveRealSpeech) || tooLong) {
      this._endUtteranceFlush(ch);
    } else if (pausedLongEnough && !haveRealSpeech) {
      // Just noise (cough/click) with no real speech — discard, don't waste a
      // Whisper spawn or risk a hallucinated transcript.
      ch.segmentBuffers = [];
      ch.segmentBytes = 0;
      ch.vadSpeaking = false;
      ch.vadSpeechMs = 0;
      ch.vadSilenceMs = 0;
    }
  }

  /** Flush the accumulated utterance for one channel and reset its VAD. */
  _endUtteranceFlush(channel = null) {
    const ch = channel || (this.channels && this.channels.mic);
    if (!ch) return;
    ch.vadSpeaking = false;
    ch.vadSpeechMs = 0;
    ch.vadSilenceMs = 0;
    ch.vadPreRoll = [];
    ch.vadPreRollMs = 0;
    this._flushWhisperSegment({ final: false, channel: ch }).catch((error) => {
      logger.error('Whisper segment transcription failed', {
        error: error.message,
        channel: ch.id
      });
    });
  }

  _chunkDurationMs(buffer) {
    // 16kHz mono 16-bit => 2 bytes/sample => 32 bytes/ms.
    return buffer.length / 32;
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    logger.info('Stopping speech recognition session', {
      provider: this.provider,
      sessionDuration: `${sessionDuration}ms`
    });

    if (this.provider === 'azure' && this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync(
          () => {
            this._finalizeStop('Recording stopped');
          },
          (error) => {
            logger.error('Error during recognition stop', { error: error.toString() });
            this._finalizeStop('Recording stopped');
          }
        );
      } catch (error) {
        logger.error('Error stopping recognizer', { error: error.message });
        this._finalizeStop('Recording stopped');
      }
      return;
    }

    if (this.provider === 'whisper') {
      this.isProcessingAudio = true;
      this.emit('recording-stopped');
      this.emit('status', 'Processing local speech…');
      this._finalizeWhisperStop({ captureAlreadyStopped: true });
      return;
    }

    if (this.provider === 'dashscope') {
      this.isProcessingAudio = true;
      this.emit('recording-stopped');
      this.emit('status', 'Finishing cloud transcription…');
      this._finalizeDashScopeStop().catch((error) => {
        logger.error('DashScope finalize failed', { error: error.message });
      });
      return;
    }

    this._finalizeStop('Recording stopped');
  }

  async _finalizeWhisperStop({ captureAlreadyStopped = false } = {}) {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    try {
      // Flush every active channel so a question still in flight when the user
      // pressed stop is not silently dropped.
      for (const ch of this._activeChannels()) {
        await this._flushWhisperSegment({ final: true, channel: ch });
      }
    } catch (error) {
      logger.error('Final Whisper transcription failed', { error: error.message });
      this.emit('error', `Whisper transcription failed: ${error.message}`);
    } finally {
      this._cleanup();
      this.isProcessingAudio = false;
      this.whisperWorker.releaseWhenIdle();
      if (!captureAlreadyStopped) {
        this.emit('recording-stopped');
      }
      this.emit('status', 'Recording stopped');
    }
  }

  _finalizeStop(statusMessage) {
    this._cleanup();
    this.emit('recording-stopped');
    this.emit('status', statusMessage);
  }

  _cleanup() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    // Close any DashScope streaming sessions so a stopped recording cannot
    // keep billing an open cloud connection.
    if (this.provider === 'dashscope' && this.dashscopeWorker) {
      for (const channelId of ['mic', 'system']) {
        if (this.channels && this.channels[channelId]) {
          this.channels[channelId].capturing = false;
        }
        this.dashscopeWorker.stopChannel(channelId).catch(() => {});
      }
    }

    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

    if (this.audioConfig) {
      try {
        if (typeof this.audioConfig.close === 'function') {
          this.audioConfig.close();
        }
      } catch (error) {
        logger.error('Error closing audio config', { error: error.message });
      }
      this.audioConfig = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    if (this.pushStream) {
      try {
        if (typeof this.pushStream.close === 'function') {
          this.pushStream.close();
        }
      } catch (error) {
        logger.error('Error closing push stream', { error: error.message });
      }
      this.pushStream = null;
    }

    this._resetAllChannels();
    this._audioDataLogged = false;
    this.useRendererCapture = false;
  }

  async recognizeFromFile(audioFilePath) {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            resolve(result.reason === sdk.ResultReason.RecognizedSpeech ? result.text : '');
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });
    }

    if (this.provider === 'whisper') {
      return this._transcribeWhisperFile(audioFilePath);
    }

    throw new Error('Speech service not initialized');
  }

  async testConnection() {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      try {
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
        recognizer.close();
        audioConfig.close();
        return { success: true, message: 'Azure connection test successful' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    if (this.provider === 'whisper') {
      if (!this.whisperCommand) {
        return { success: false, message: 'Local Whisper CLI not found' };
      }
      // Actually probe the executable to confirm it works
      const probe = spawnSync(
        this.whisperCommand.command,
        [...this.whisperCommand.baseArgs, '--help'],
        {
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
          // Same UTF-8 requirement as _probeWhisperCandidate: on a zh-CN
          // Windows the default GBK code page crashes argparse before it can
          // print help, which would report a working install as broken.
          env: pythonChildEnv()
        }
      );
      if (probe.error || probe.status !== 0) {
        const err = probe.error ? probe.error.message : `exit code ${probe.status}`;
        return {
          success: false,
          message: `Local Whisper CLI detected but probe failed: ${err}`
        };
      }
      return {
        success: true,
        message: `Local Whisper CLI works: ${this.whisperCommand.command}`
      };
    }

    if (this.provider === 'dashscope') {
      const apiKey = this._getDashScopeApiKey();
      if (!apiKey) {
        return { success: false, message: 'DashScope API key not configured (DASHSCOPE_API_KEY)' };
      }
      try {
        // Verifies key presence and that the worker's Python environment can
        // import dashscope. A live round-trip is deliberately not performed
        // here: it would consume quota and the first real question already
        // proves the connection.
        const result = await this.dashscopeWorker.verifyCredentials();
        return {
          success: result.hasKey === true,
          message: result.hasKey
            ? `Cloud speech ready (${this._getDashScopeModel()})`
            : 'DashScope API key missing'
        };
      } catch (error) {
        return { success: false, message: `DashScope worker failed: ${error.message}` };
      }
    }

    return { success: false, message: 'Speech service not initialized' };
  }

  getStatus() {
    return {
      provider: this.provider,
      isRecording: this.isRecording,
      isProcessingAudio: this.isProcessingAudio,
      isInitialized: this.provider === 'azure'
        ? !!this.speechConfig
        : (this.provider === 'dashscope' ? !!this._getDashScopeApiKey() : !!this.whisperCommand),
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      effectiveSettings: {
        speechProvider: this.provider,
        azureKey: this._getSetting('azureKey') || '',
        azureRegion: this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION || '',
        whisperCommand: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        whisperModelDir: this._getWhisperModelDir(),
        whisperModel: this._getWhisperModel(),
        whisperLanguage: this._getWhisperLanguage(),
        whisperCaptureMode: this._getWhisperCaptureMode(),
        whisperDevice: this._getWhisperDevice(),
        whisperSegmentMs: String(this._getWhisperSegmentMs()),
        // DashScope cloud ASR
        dashscopeApiKey: this._getDashScopeApiKey() ? '***configured***' : '',
        dashscopeModel: this._getDashScopeModel(),
        dashscopeBaseUrl: this._getDashScopeBaseUrl(),
        dashscopeLanguageHints: this._getDashScopeLanguageHints().join(',')
      },
      config: {
        azure: config.get('speech.azure') || {},
        whisper: config.get('speech.whisper') || {},
        dashscope: config.get('speech.dashscope') || {},
        selectedProvider: this.provider
      }
    };
  }

  isAvailable() {
    if (this.provider === 'azure') {
      return !!this.speechConfig && !!this.available;
    }

    if (this.provider === 'whisper') {
      return !!this.whisperCommand && !!this.available;
    }

    if (this.provider === 'dashscope') {
      return !!this._getDashScopeApiKey() && !!this.available;
    }

    return false;
  }

  isManualCaptureMode() {
    // DashScope endpoints sentences server-side, so there is no manual mode:
    // sentences are emitted as they complete.
    if (this.provider === 'dashscope') {
      return false;
    }
    return this.provider === 'whisper' && this._getWhisperCaptureMode() === 'manual';
  }

  shutdown() {
    this.isRecording = false;
    this.isProcessingAudio = false;
    this._cleanup();
    this.whisperWorker.close();
  }

  updateSettings(settings = {}) {
    // Keep this list in sync with every key the settings UI can change. A key
    // missing here is silently dropped, so the UI appears to save while the
    // running service keeps using the old value.
    const speechKeys = [
      'speechProvider', 'azureKey', 'azureRegion', 'whisperCommand',
      'whisperModelDir', 'whisperModel', 'whisperLanguage', 'whisperCaptureMode',
      'whisperDevice', 'whisperSegmentMs', 'whisperResponseTarget',
      // Dual-channel capture: system audio + who the app answers.
      'whisperSystemAudio', 'whisperAnswerSource',
      // DashScope cloud ASR.
      'dashscopeApiKey', 'dashscopeModel', 'dashscopeBaseUrl', 'dashscopeLanguageHints'
    ];
    let changed = false;

    for (const key of speechKeys) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        this.runtimeSettings[key] = settings[key];
        changed = true;
      }
    }

    if (changed) {
      this.initializeClient();
    }

    return this.getStatus();
  }

  _getConfiguredProvider() {
    const provider = String(this._getSetting('speechProvider') || process.env.SPEECH_PROVIDER || '').trim().toLowerCase();

    if (provider === 'azure' || provider === 'whisper' || provider === 'dashscope') {
      return provider;
    }

    // Auto-detect, most-preferred first. A cloud key that the user has
    // explicitly configured beats local Whisper: it is faster and markedly
    // better at Chinese and at Chinese/English code-switching.
    const hasDashScope = !!this._getDashScopeApiKey();
    if (hasDashScope) {
      return 'dashscope';
    }

    const hasAzure = !!((this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY) &&
      (this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION));

    if (hasAzure) {
      return 'azure';
    }

    return 'whisper';
  }

  /** DashScope (Qwen / FunASR) cloud streaming ASR credentials and tuning. */
  _getDashScopeApiKey() {
    return String(
      this._getSetting('dashscopeApiKey') || process.env.DASHSCOPE_API_KEY || ''
    ).trim();
  }

  _getDashScopeModel() {
    return String(
      this._getSetting('dashscopeModel') ||
      process.env.DASHSCOPE_ASR_MODEL ||
      config.get('speech.dashscope.model') ||
      'qwen-audio-3.0-asr-flash-streaming'
    ).trim();
  }

  _getDashScopeBaseUrl() {
    return String(
      this._getSetting('dashscopeBaseUrl') ||
      process.env.DASHSCOPE_WS_URL ||
      config.get('speech.dashscope.baseUrl') ||
      'wss://maas.qianwenaiapi.com/api-ws/v1/inference'
    ).trim();
  }

  /**
   * Language hints passed to the model.
   *
   * Declaring zh+en is what lets the model keep English technical terms
   * ("token bucket", "Redis") intact inside Chinese speech instead of
   * transliterating them.
   */
  _getDashScopeLanguageHints() {
    const raw = String(
      this._getSetting('dashscopeLanguageHints') ||
      process.env.DASHSCOPE_LANGUAGE_HINTS ||
      config.get('speech.dashscope.languageHints') ||
      'zh,en'
    ).trim();
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  _initializeDashScopeClient() {
    try {
      const apiKey = this._getDashScopeApiKey();
      if (!apiKey) {
        const reason = 'DashScope API key not configured. Set DASHSCOPE_API_KEY.';
        logger.warn(reason);
        this.emit('status', reason);
        this.available = false;
        return;
      }

      this.dashscopeWorker.configure({
        pythonPath: this._getDashScopePythonPath(),
        scriptPath: this._getWhisperWorkerScriptPath('dashscope_worker.py'),
        apiKey,
        model: this._getDashScopeModel(),
        baseUrl: this._getDashScopeBaseUrl(),
        sampleRate: 16000,
        languageHints: this._getDashScopeLanguageHints(),
        disfluencyRemoval: config.get('speech.dashscope.disfluencyRemoval')
      });

      this.available = true;
      logger.info('DashScope speech service initialized', {
        model: this._getDashScopeModel(),
        baseUrl: this._getDashScopeBaseUrl(),
        languageHints: this._getDashScopeLanguageHints(),
        systemAudio: this._isSystemAudioEnabled(),
        answerSource: this._getAnswerSource()
      });
      this.emit('status', 'DashScope cloud speech ready');
    } catch (error) {
      logger.error('Failed to initialize DashScope client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'DashScope speech unavailable');
    }
  }

  /**
   * Python interpreter used for the DashScope worker.
   *
   * Reuses the venv built for Whisper when present (it already has dashscope
   * installed by setup), otherwise falls back to a system interpreter.
   */
  _getDashScopePythonPath() {
    const configured = String(process.env.DASHSCOPE_PYTHON || '').trim();
    if (configured) {
      return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(configured);
    }

    // Prefer the same venv Whisper uses — it is the one the installer prepares.
    const whisperPython = this._getWhisperPythonPath();
    if (whisperPython && fs.existsSync(whisperPython)) {
      return whisperPython;
    }

    const candidates = process.platform === 'win32'
      ? [
          path.resolve('.venv-whisper', 'Scripts', 'python.exe'),
          path.resolve('.venv-dashscope', 'Scripts', 'python.exe')
        ]
      : [
          path.resolve('.venv-whisper', 'bin', 'python'),
          path.resolve('.venv-dashscope', 'bin', 'python')
        ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return process.platform === 'win32' ? 'python' : 'python3';
  }

  _getWhisperModel() {
    return this._getSetting('whisperModel') || process.env.WHISPER_MODEL || config.get('speech.whisper.model') || 'small';
  }

  _getWhisperModelDir() {
    const configured = this._getSetting('whisperModelDir') || process.env.WHISPER_MODEL_DIR || '';
    // Honor an absolute configured dir. Empty or relative values (the old
    // `.whisper-models` default resolved against an unstable cwd) are replaced
    // with the stable userData location the installer downloads weights into,
    // so --model_dir and download_root always agree.
    if (configured && path.isAbsolute(configured)) {
      return configured;
    }
    return this._getUserDataModelDir() || configured;
  }

  /**
   * Absolute model-weights dir under Electron userData — matches
   * WhisperInstaller.modelDir so transcription finds downloaded models.
   */
  _getUserDataModelDir() {
    try {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), '.whisper-models');
    } catch (_) {
      return '';
    }
  }

  _getWhisperLanguage() {
    return this._getSetting('whisperLanguage') || process.env.WHISPER_LANGUAGE || config.get('speech.whisper.language') || 'auto';
  }

  _getWhisperSegmentMs() {
    const rawValue = this._getSetting('whisperSegmentMs') || process.env.WHISPER_SEGMENT_MS || config.get('speech.whisper.segmentMs') || 4000;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Math.max(2000, parsed) : 4000;
  }

  _vadNumber(settingKey, envKey, configPath, fallback, min) {
    const raw = this._getSetting(settingKey) || process.env[envKey] || config.get(configPath) || fallback;
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    return typeof min === 'number' ? Math.max(min, value) : value;
  }

  _isVadEnabled() {
    const override = this._getSetting('whisperVadEnabled');
    if (override === false || override === 'false') return false;
    if (override === true || override === 'true') return true;
    if (process.env.WHISPER_VAD_ENABLED === 'false') return false;
    const configured = config.get('speech.whisper.vadEnabled');
    return configured !== false;
  }

  _getSilenceHangoverMs() {
    return this._vadNumber('whisperSilenceHangoverMs', 'WHISPER_SILENCE_HANGOVER_MS', 'speech.whisper.silenceHangoverMs', 700, 200);
  }

  _getMinUtteranceMs() {
    return this._vadNumber('whisperMinUtteranceMs', 'WHISPER_MIN_UTTERANCE_MS', 'speech.whisper.minUtteranceMs', 350, 100);
  }

  _getMaxUtteranceMs() {
    return this._vadNumber('whisperMaxUtteranceMs', 'WHISPER_MAX_UTTERANCE_MS', 'speech.whisper.maxUtteranceMs', 15000, 2000);
  }

  _getPreRollMs() {
    return this._vadNumber('whisperPreRollMs', 'WHISPER_PRE_ROLL_MS', 'speech.whisper.preRollMs', 300, 0);
  }

  _getVadEnergyFloor(channel = null) {
    // The system-audio (loopback) stream is already post-mix and typically
    // louder and cleaner than a room microphone, so it gets its own floor.
    // A shared floor made the interviewer channel either deaf or permanently
    // "speaking" depending on the call volume.
    if (channel && channel.id === 'system') {
      return this._vadNumber(
        'whisperSystemVadEnergyFloor',
        'WHISPER_SYSTEM_VAD_ENERGY_FLOOR',
        'speech.whisper.systemVadEnergyFloor',
        0.004,
        0.0002
      );
    }
    return this._vadNumber('whisperVadEnergyFloor', 'WHISPER_VAD_ENERGY_FLOOR', 'speech.whisper.vadEnergyFloor', 0.008, 0.0005);
  }

  /**
   * Whether to also capture system audio (the interviewer's voice).
   *
   * Off by default: it needs an extra screen-recording permission on macOS and
   * is unavailable on Linux, so enabling it silently would surprise users.
   */
  _isSystemAudioEnabled() {
    const override = this._getSetting('whisperSystemAudio');
    if (override === false || override === 'false') return false;
    if (override === true || override === 'true') return true;
    const env = String(process.env.WHISPER_SYSTEM_AUDIO || '').trim().toLowerCase();
    if (env === 'false' || env === '0' || env === 'off') return false;
    if (env === 'true' || env === '1' || env === 'on') return true;
    return config.get('speech.whisper.systemAudioEnabled') === true;
  }

  /**
   * Which speaker the app should answer.
   *
   *   'interviewer' (default) — only questions from the system-audio channel
   *                             reach the LLM; the candidate's own words are
   *                             kept as context so the answer doesn't fight
   *                             what they are already saying.
   *   'me'                    — only the microphone drives answers (the old
   *                             single-channel behaviour).
   *   'both'                  — either channel can trigger an answer.
   *
   * Only meaningful while system audio is enabled; with it off, 'interviewer'
   * would mean nothing ever triggers, so it degrades to 'me'.
   */
  _getAnswerSource() {
    const configured = String(
      this._getSetting('whisperAnswerSource') || process.env.WHISPER_ANSWER_SOURCE || ''
    ).trim().toLowerCase();

    if (configured === 'me' || configured === 'both' || configured === 'interviewer') {
      return configured;
    }
    const fallback = config.get('speech.whisper.answerSource');
    if (fallback === 'me' || fallback === 'both' || fallback === 'interviewer') {
      return fallback;
    }
    return 'interviewer';
  }

  /**
   * Whether the system-audio channel is actually capturing right now.
   *
   * Distinct from `_isSystemAudioEnabled()`, which only reports the configured
   * intent. The renderer can fail to obtain loopback audio (permission denied,
   * user cancelled the picker, no audio track shared), in which case the
   * channel is switched off at runtime while the config still says "on".
   */
  isSystemAudioLive() {
    const ch = this.channels && this.channels.system;
    return !!(ch && ch.capturing);
  }

  /**
   * Effective answer source, accounting for whether system audio is *actually*
   * flowing.
   *
   * This must key off the live channel state, not the config flag. If the user
   * asked for 'interviewer' but the loopback capture never started, keying off
   * the config would mean nothing ever triggers an answer — the app goes
   * completely silent with no error shown.
   */
  getEffectiveAnswerSource() {
    const source = this._getAnswerSource();
    if (source === 'interviewer' && !this.isSystemAudioLive()) {
      // No interviewer channel to listen to; fall back to the microphone so
      // the user still gets answers.
      return 'me';
    }
    return source;
  }

  /** Whether speech from `speaker` ('me' | 'interviewer') should reach the LLM. */
  shouldAnswerSpeaker(speaker) {
    const source = this.getEffectiveAnswerSource();
    if (source === 'both') return true;
    if (source === 'interviewer') return speaker === 'interviewer';
    return speaker === 'me';
  }

  _getSetting(key) {
    const value = this.runtimeSettings[key];
    return value === '' ? null : value;
  }

  _isManualCaptureMode() {
    return this._getWhisperCaptureMode() === 'manual';
  }

  _getWhisperCaptureMode() {
    const configured = String(
      this._getSetting('whisperCaptureMode') || process.env.WHISPER_CAPTURE_MODE || ''
    ).trim().toLowerCase();
    if (configured === 'manual' || configured === 'vad') {
      return configured;
    }

    // Backward compatibility for existing local configurations.
    if (process.env.WHISPER_MANUAL_CAPTURE !== undefined) {
      return process.env.WHISPER_MANUAL_CAPTURE === 'false' ? 'vad' : 'manual';
    }
    return 'vad';
  }

  _getManualCaptureMaxMs() {
    const parsed = Number(process.env.WHISPER_MANUAL_MAX_MS || 90000);
    return Number.isFinite(parsed) ? Math.max(5000, parsed) : 90000;
  }

  _getWhisperDevice() {
    return String(process.env.WHISPER_DEVICE || 'auto').trim().toLowerCase();
  }

  _getWhisperPythonPath() {
    const configuredPython = String(process.env.WHISPER_PYTHON || '').trim();
    if (configuredPython) {
      const resolvedPython = path.isAbsolute(configuredPython)
        ? path.normalize(configuredPython)
        : path.resolve(configuredPython);
      if (fs.existsSync(resolvedPython)) {
        return resolvedPython;
      }
    }

    // The userData venv is only a fallback for packaged installs that ran the
    // onboarding installer. It must not win over an explicitly configured
    // WHISPER_COMMAND, and it must actually be able to import whisper — a
    // half-built venv (interpreter present, torch DLLs broken) would otherwise
    // be selected and every transcription would fail at runtime.
    const userDataCandidate = this._getUserDataWhisperCandidate();
    if (userDataCandidate && fs.existsSync(userDataCandidate.command)) {
      if (this._canImportWhisper(userDataCandidate.command)) {
        return userDataCandidate.command;
      }
      logger.warn('Ignoring userData Whisper venv: whisper cannot be imported there', {
        python: userDataCandidate.command
      });
    }

    if (!this.whisperCommand) {
      return null;
    }

    const command = path.normalize(this.whisperCommand.command);
    const moduleIndex = this.whisperCommand.baseArgs.indexOf('-m');
    if (
      moduleIndex !== -1 &&
      this.whisperCommand.baseArgs[moduleIndex + 1] === 'whisper' &&
      fs.existsSync(command)
    ) {
      return command;
    }

    const pythonName = process.platform === 'win32' ? 'python.exe' : 'python';
    const siblingPython = path.join(path.dirname(command), pythonName);
    if (!fs.existsSync(siblingPython)) {
      return null;
    }
    // Prefer a sibling interpreter that can genuinely import whisper; fall back
    // to it anyway so the worker still starts and can report its own error
    // rather than silently disabling speech.
    if (this._canImportWhisper(siblingPython)) {
      return siblingPython;
    }
    logger.warn('Configured Whisper venv cannot import whisper; using it anyway', {
      python: siblingPython
    });
    return siblingPython;
  }

  _getWhisperWorkerScriptPath(fileName = 'whisper_worker.py') {
    const sourcePath = path.resolve(__dirname, '..', '..', 'scripts', fileName);
    return sourcePath.includes('app.asar')
      ? sourcePath.replace('app.asar', 'app.asar.unpacked')
      : sourcePath;
  }

  _configureWhisperWorker() {
    const pythonPath = this._getWhisperPythonPath();
    const scriptPath = this._getWhisperWorkerScriptPath();
    const idleUnloadMs = Math.max(10000, Number(process.env.WHISPER_GPU_IDLE_MS || 60000));
    this.whisperWorker.configure({ pythonPath, scriptPath, idleUnloadMs });

    logger.info('Whisper worker configuration', {
      configured: this.whisperWorker.isConfigured(),
      pythonPath,
      scriptPath,
      device: this._getWhisperDevice(),
      idleUnloadMs
    });
  }

  /**
   * Build a whisper candidate pointing at the app-local venv inside
   * Electron's userData directory. This is where the onboarding installer
   * creates the venv in packaged builds.
   */
  _getUserDataWhisperCandidate() {
    try {
      const { app } = require('electron');
      const userData = app.getPath('userData');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const python = path.join(userData, '.venv-whisper', binDir, `python${ext}`);
      if (fs.existsSync(python)) {
        return { command: python, baseArgs: ['-m', 'whisper'] };
      }
    } catch (_) {
      // electron may not be available in unit tests
    }
    return null;
  }

  _resolveWhisperCommand() {
    const configured = this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND;
    const candidates = [];

    if (configured) {
      candidates.push(...this._expandConfiguredWhisperCandidates(configured));
    }

    // Persistent app venv (highest priority after explicit config)
    const userDataVenv = this._getUserDataWhisperCandidate();
    if (userDataVenv) {
      candidates.push({ ...userDataVenv, source: 'app userData venv' });
    }

    // Platform-aware fallback candidates (higher priority = tried first)
    candidates.push({ command: 'whisper', baseArgs: [], source: 'system PATH' });
    if (process.platform === 'win32') {
      candidates.push({ command: 'whisper.exe', baseArgs: [], source: 'system PATH (exe)' });
      candidates.push({ command: 'py', baseArgs: ['-3', '-m', 'whisper'], source: 'py launcher' });
    }
    candidates.push({ command: 'python3', baseArgs: ['-m', 'whisper'], source: 'python3 module' });
    candidates.push({ command: 'python', baseArgs: ['-m', 'whisper'], source: 'python module' });

    for (const candidate of candidates) {
      if (!candidate || !candidate.command) {
        continue;
      }

      const resolved = this._probeWhisperCandidate(candidate);
      if (resolved) {
        logger.info('Whisper command resolved', {
          command: resolved.command,
          baseArgs: resolved.baseArgs,
          source: resolved.source || candidate.source || 'unknown'
        });
        return resolved;
      }
    }

    logger.warn('No Whisper CLI candidate succeeded after probing all fallbacks');
    return null;
  }

  /**
   * Fast, torch-free check for python `-m whisper` candidates. Importing the
   * whisper package pulls in torch/numba and can take well over 8 s on a cold
   * cache (first run after install), which made `--help` time out and the mic
   * button stay hidden until a second launch. `importlib.util.find_spec`
   * confirms the module is installed without importing it, returning in well
   * under a second. Returns the candidate on success, else null.
   */
  _probeWhisperModuleFast(candidate) {
    const mIdx = candidate.baseArgs.indexOf('-m');
    if (mIdx === -1 || candidate.baseArgs[mIdx + 1] !== 'whisper') {
      return null; // not a `-m whisper` form (e.g. a whisper binary)
    }
    const pyArgs = candidate.baseArgs.slice(0, mIdx);
    const script = 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("whisper") else 1)';
    try {
      // No shell: an absolute .exe runs directly. shell:true on Windows does
      // NOT quote args, so a spaced path like
      //   C:\Users\CANDAN SINGH\...\python.exe
      // would be split at the space and the probe would wrongly fail —
      // hiding the mic for any user whose profile name contains a space.
      const probe = spawnSync(candidate.command, [...pyArgs, '-c', script], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
        env: pythonChildEnv(),
      });
      if (!probe.error && probe.status === 0) {
        return candidate;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  /**
   * Verify a python interpreter can actually *import* whisper (not merely see
   * it on disk).
   *
   * `find_spec` only proves the package directory exists. A venv whose install
   * was interrupted, or whose torch build cannot load its native DLLs
   * (OSError WinError 1114 "DLL initialization routine failed"), passes
   * find_spec but explodes the moment whisper is imported. Selecting such an
   * interpreter silently breaks every transcription, so we pay for a real
   * import here — once, at startup — instead of failing per utterance.
   *
   * @param {string} pythonPath absolute path to a python interpreter
   * @returns {boolean} true when `import whisper` succeeds
   */
  _canImportWhisper(pythonPath) {
    if (!pythonPath || !fs.existsSync(pythonPath)) return false;
    try {
      const probe = spawnSync(pythonPath, ['-c', 'import whisper'], {
        encoding: 'utf8',
        // Importing torch on a cold cache is slow; this runs once at startup.
        timeout: 60000,
        windowsHide: true,
        env: pythonChildEnv()
      });
      if (probe.error) return false;
      if (probe.status === 0) return true;
      logger.debug('Whisper import check failed', {
        python: pythonPath,
        status: probe.status,
        output: `${probe.stdout || ''}${probe.stderr || ''}`.trim().substring(0, 300)
      });
      return false;
    } catch (e) {
      logger.debug('Whisper import check error', { python: pythonPath, error: e.message });
      return false;
    }
  }

  /**
   * Probe a single candidate: exists check → fast module check → spawn --help.
   * Returns the working candidate object, or null on failure.
   */
  _probeWhisperCandidate(candidate) {
    const cmd = candidate.command;
    const args = [...candidate.baseArgs, '--help'];

    // Fast path: skip spawnSync if the file clearly doesn't exist
    if (path.isAbsolute(cmd) || cmd.includes(path.sep) || cmd.includes('/')) {
      try {
        const normalized = path.normalize(cmd);
        if (!fs.existsSync(normalized)) {
          logger.debug('Whisper probe skipped: file does not exist', {
            command: cmd,
            normalized
          });
          return null;
        }
      } catch (e) {
        // fs.existsSync can throw on invalid paths; treat as missing
        return null;
      }
    }

    // Cheap torch-free check first so the mic appears on the first run.
    const fast = this._probeWhisperModuleFast(candidate);
    if (fast) {
      logger.debug('Whisper module confirmed via find_spec', { command: cmd });
      return fast;
    }

    let probe;
    try {
      probe = spawnSync(cmd, args, {
        encoding: 'utf8',
        // First `import whisper` (torch/numba) can be slow on a cold cache.
        timeout: 30000,
        windowsHide: true,
        // Force UTF-8 so a legacy Windows code page cannot crash argparse.
        env: pythonChildEnv(),
        // No shell — see _probeWhisperModuleFast: shell:true on Windows splits
        // spaced paths (e.g. "C:\Users\CANDAN SINGH\...") and breaks the probe.
      });
    } catch (spawnErr) {
      logger.debug('Whisper probe spawn error', {
        command: cmd,
        error: spawnErr.message
      });
      return null;
    }

    const output = `${probe.stdout || ''}\n${probe.stderr || ''}`;
    const noModule = output.includes('No module named whisper');
    const isHelpOutput = output.includes('usage:') || output.includes('whisper') || output.includes('options');

    if (!probe.error && probe.status === 0 && !noModule) {
      return candidate;
    }

    // Some whisper builds exit with non-zero on --help but still print usage
    if (!probe.error && !noModule && isHelpOutput) {
      logger.debug('Whisper probe accepted non-zero help output', {
        command: cmd,
        status: probe.status
      });
      return candidate;
    }

    logger.debug('Whisper probe failed', {
      command: cmd,
      status: probe.status,
      error: probe.error ? probe.error.message : null,
      noModule,
      isHelpOutput,
      outputPreview: output.substring(0, 200)
    });
    return null;
  }

  _expandConfiguredWhisperCandidates(rawCommand) {
    const parsed = this._parseCommand(rawCommand);
    if (!parsed) {
      return [];
    }

    const candidates = [];
    // Normalize forward slashes to platform separator before trying anything
    const normalizedCmd = path.normalize(parsed.command);

    candidates.push({
      command: normalizedCmd,
      baseArgs: parsed.baseArgs,
      source: 'configured (normalized)'
    });

    const resolvedPath = path.resolve(normalizedCmd);
    if (resolvedPath !== normalizedCmd) {
      candidates.push({
        command: resolvedPath,
        baseArgs: parsed.baseArgs,
        source: 'configured (resolved)'
      });
    }

    if (process.platform === 'win32') {
      const base = normalizedCmd;
      // Try .exe / .cmd / .bat variants when extension is missing
      if (!/\.(exe|cmd|bat)$/i.test(base)) {
        candidates.push({ command: `${base}.exe`, baseArgs: parsed.baseArgs, source: 'configured (.exe)' });
        candidates.push({ command: `${base}.cmd`, baseArgs: parsed.baseArgs, source: 'configured (.cmd)' });
        if (resolvedPath !== base) {
          candidates.push({ command: `${resolvedPath}.exe`, baseArgs: parsed.baseArgs, source: 'configured (resolved .exe)' });
        }
      }
      // Some Windows venvs create whisper-script.py alongside whisper.exe
      const scriptPath = base + '-script.py';
      candidates.push({ command: 'python', baseArgs: [scriptPath, ...parsed.baseArgs], source: 'configured (script.py)' });
      // Try using the venv's own python with -m whisper
      const venvPython = path.join(path.dirname(base), 'python.exe');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python -m whisper)' });
      }
    } else {
      // On Unix, try the directory's python3 with -m whisper if the configured path looks like a venv entry point
      const venvPython3 = path.join(path.dirname(normalizedCmd), 'python3');
      if (fs.existsSync(venvPython3)) {
        candidates.push({ command: venvPython3, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python3 -m whisper)' });
      }
      const venvPython = path.join(path.dirname(normalizedCmd), 'python');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python -m whisper)' });
      }
    }

    return candidates;
  }

  _parseCommand(rawCommand) {
    // Respect double-quoted segments so Windows userData paths like
    // "C:\Users\CANDAN SINGH\...\python.exe" survive intact.
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return null;
    }
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [trimmed];
    const normalized = parts.map((p) => p.replace(/^"|"$/g, '')).filter(Boolean);
    if (normalized.length === 0) {
      return null;
    }

    return {
      command: normalized[0],
      baseArgs: normalized.slice(1)
    };
  }

  _startMicrophoneCapture() {
    if (!recorder || typeof recorder.record !== 'function') {
      this.emit('error', 'Local microphone capture dependency is missing. Run npm install to restore speech recording support.');
      return;
    }

    // node-record-lpcm16 only ships two recorder modules: `sox` and `arecord`.
    // `recorder` is the option it actually reads (the old `recordProgram` name
    // was silently ignored, so every attempt fell back to sox). Each entry maps
    // the recorder module to the binary we must verify is on PATH.
    //   - macOS: sox (via Homebrew)
    //   - Linux: arecord (ALSA, usually preinstalled) then sox
    const candidates = process.platform === 'darwin'
      ? [{ recorder: 'sox', bin: 'sox' }]
      : [{ recorder: 'arecord', bin: 'arecord' }, { recorder: 'sox', bin: 'sox' }];
    this._startMicrophoneCaptureWithFallback(candidates);
  }

  /**
   * Whether an audio capture binary is on PATH. node-record-lpcm16 spawns
   * these directly and, when the binary is missing, emits an `error` on its
   * child process with no listener — which would otherwise crash the whole
   * app. We pre-filter to binaries that exist so the library never receives a
   * missing program.
   */
  _audioProgramExists(bin) {
    try {
      const r = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        [bin],
        { windowsHide: true, timeout: 4000 }
      );
      return r.status === 0;
    } catch (_) {
      return false;
    }
  }

  _startMicrophoneCaptureWithFallback(candidates) {
    const available = candidates.filter((c) => this._audioProgramExists(c.bin));

    if (available.length === 0) {
      const hint = process.platform === 'darwin'
        ? 'Install one with `brew install sox`.'
        : process.platform === 'linux'
          ? 'Install one with `sudo apt install alsa-utils` (arecord) or `sudo apt install sox`.'
          : 'No supported microphone capture tool was found.';
      logger.warn('No audio capture program available', {
        tried: candidates.map((c) => c.bin),
        platform: process.platform,
      });
      this.isRecording = false;
      this.emit('error', `Microphone capture needs sox or arecord, but none was found. ${hint}`);
      return;
    }

    const queue = [...available];

    const tryNextProgram = () => {
      const candidate = queue.shift();
      if (!candidate) {
        this.isRecording = false;
        this.emit('error', 'Could not start microphone capture with any available audio program');
        return;
      }

      const program = candidate.bin;
      try {
        this.recording = recorder.record({
          sampleRate: 16000,
          sampleRateHertz: 16000,
          channels: 1,
          threshold: 0,
          verbose: false,
          recorder: candidate.recorder,
          silence: '10.0s'
        });

        const stream = this.recording.stream();
        this.audioProgram = program;

        // Guard the spawned child process directly. A spawn failure (e.g. the
        // binary disappeared between our probe and the spawn, or a permission
        // error) emits `error` on the child, which node-record-lpcm16 leaves
        // unhandled — fatal without this listener.
        const child = this.recording.process;
        if (child && typeof child.on === 'function') {
          child.on('error', (error) => {
            logger.error('Audio recording process error', { error: error.message, program });
            if (this.recording) {
              try { this.recording.stop(); } catch (_) { /* ignore */ }
              this.recording = null;
            }
            if (this.isRecording) tryNextProgram();
          });
        }

        stream.on('error', (error) => {
          logger.error('Audio recording stream error', { error: error.message, program });
          if (this.recording) {
            try {
              this.recording.stop();
            } catch (stopError) {
              logger.error('Error stopping failed recording program', { error: stopError.message });
            }
            this.recording = null;
          }

          if (this.isRecording) {
            tryNextProgram();
          }
        });

        stream.on('data', (chunk) => {
          this._handleAudioChunk(chunk);
        });
      } catch (error) {
        logger.error('Failed to start microphone capture program', { program, error: error.message });
        tryNextProgram();
      }
    };

    tryNextProgram();
  }

  _handleAudioChunk(chunk) {
    if (!chunk || !chunk.length || !this.isRecording) {
      return;
    }

    if (this.provider === 'azure' && this.pushStream) {
      try {
        this.pushStream.write(chunk);
      } catch (error) {
        logger.error('Error writing audio data to Azure push stream', { error: error.message });
      }
      return;
    }

    if (this.provider === 'whisper') {
      this._ingestWhisperAudio(Buffer.from(chunk));
    }
  }

  /**
   * Transcribe one channel's accumulated utterance.
   *
   * Each channel has its own in-flight flag so a system-audio (interviewer)
   * transcription and a microphone (candidate) transcription can overlap
   * without one clobbering the other's buffer.
   *
   * @param {object} options
   * @param {boolean} options.final
   * @param {object} options.channel channel state
   */
  async _flushWhisperSegment({ final, channel }) {
    const ch = channel || (this.channels && this.channels.mic);
    if (!ch) return;

    if (ch.transcriptionInFlight) {
      // A flush was requested while a transcription is still running. Record
      // that we owe a follow-up flush for ANY request (not just a final one),
      // otherwise an utterance that ended mid-transcription stays stranded in
      // the buffer until the next utterance ends or the session stops. Track
      // final-ness separately so a queued stop still finalises correctly.
      ch.pendingFlush = true;
      if (final) {
        ch.pendingFinal = true;
      }
      return;
    }

    if (!ch.segmentBytes) {
      return;
    }

    const audioBuffer = Buffer.concat(ch.segmentBuffers, ch.segmentBytes);
    ch.segmentBuffers = [];
    ch.segmentBytes = 0;

    ch.transcriptionInFlight = true;

    try {
      const transcript = await this._transcribeWhisperBuffer(audioBuffer);
      const clean = transcript ? transcript.trim() : '';
      // Log the text itself, not just the fact that a transcription happened.
      // Without this, "no answer appeared" is indistinguishable between
      // "Whisper heard nothing", "the phrase was filtered", and "routing
      // dropped it" — which makes the whole pipeline undebuggable.
      logger.info('Whisper segment result', {
        channel: ch.id,
        speaker: ch.label,
        audioMs: Math.round(audioBuffer.length / 32),
        textLength: clean.length,
        text: clean.slice(0, 300)
      });
      if (clean && !this._isHallucinatedTranscript(clean)) {
        // The label tells the rest of the app who spoke. This is the whole
        // point of dual-channel capture: the LLM only answers the interviewer,
        // and the candidate's own words are treated as context, not a prompt.
        this.emit('transcription', clean, { channel: ch.id, speaker: ch.label });
      } else if (clean) {
        logger.info('Dropped likely Whisper silence hallucination', {
          transcript: clean,
          channel: ch.id
        });
      } else {
        logger.info('Whisper returned an empty transcript for this segment', {
          channel: ch.id,
          audioMs: Math.round(audioBuffer.length / 32)
        });
      }
    } finally {
      ch.transcriptionInFlight = false;

      if (ch.pendingFlush) {
        ch.pendingFlush = false;
        const runFinal = ch.pendingFinal;
        ch.pendingFinal = false;
        await this._flushWhisperSegment({ final: runFinal, channel: ch });
      }
    }
  }

  /**
   * Whisper reliably hallucinates a small set of stock phrases when fed near-
   * silence or non-speech audio (training-data artifacts from video captions).
   * VAD already prevents most silent flushes; this is the final guard so these
   * phantom phrases never reach the chat or the LLM.
   */
  _isHallucinatedTranscript(text) {
    const normalized = text.toLowerCase().replace(/[\s.,!?¡¿"'`]+/g, ' ').trim();
    if (!normalized) {
      return true;
    }
    const HALLUCINATIONS = new Set([
      'thank you',
      'thank you for watching',
      'thanks for watching',
      'thank you so much for watching',
      'please subscribe',
      'like and subscribe',
      'you',
      'bye',
      'bye bye',
      'okay',
      'ok',
      'so',
      'the end',
      'subtitles by the amara org community'
    ]);
    return HALLUCINATIONS.has(normalized);
  }

  async _transcribeWhisperBuffer(audioBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-'));
    const audioFilePath = path.join(tempDir, 'segment.wav');

    try {
      fs.writeFileSync(audioFilePath, this._createWavBuffer(audioBuffer));
      return await this._transcribeWhisperFile(audioFilePath);
    } finally {
      this._removeTempDir(tempDir);
    }
  }

  async _transcribeWhisperFile(audioFilePath) {
    if (!this.whisperCommand) {
      throw new Error('Local Whisper CLI not configured');
    }

    if (this.whisperWorker.isConfigured()) {
      const startedAt = Date.now();
      try {
        const result = await this.whisperWorker.transcribe(audioFilePath, {
          model: this._getWhisperModel(),
          language: this._getWhisperLanguage(),
          modelDir: this._getWhisperModelDir(),
          device: this._getWhisperDevice()
        });
        logger.info('Persistent Whisper transcription completed', {
          processingTime: Date.now() - startedAt,
          model: result.model,
          device: result.device,
          gpu: result.gpu,
          detectedLanguage: result.language
        });
        return result.text || '';
      } catch (error) {
        logger.warn('Persistent Whisper worker failed; falling back to CLI', {
          error: error.message,
          workerTraceback: error.workerTraceback
        });
      }
    }

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-out-'));
    const args = [
      ...this.whisperCommand.baseArgs,
      audioFilePath,
      '--model', this._getWhisperModel(),
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', outputDir,
      '--verbose', 'False',
      '--fp16', 'False'
    ];

    const language = this._getWhisperLanguage();
    if (language && language !== 'auto' && language !== 'detect') {
      args.push('--language', language);
    }

    if (this._getWhisperModelDir()) {
      args.push('--model_dir', this._getWhisperModelDir());
    }

    try {
      await new Promise((resolve, reject) => {
        const child = spawn(this.whisperCommand.command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          // Force UTF-8 so transcripts and progress bars cannot crash on a
          // legacy Windows code page.
          env: pythonChildEnv()
        });

        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        child.on('error', (error) => {
          reject(error);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(stderr.trim() || `Whisper exited with code ${code}`));
        });
      });

      const transcriptPath = path.join(outputDir, `${path.parse(audioFilePath).name}.txt`);
      if (!fs.existsSync(transcriptPath)) {
        return '';
      }

      return fs.readFileSync(transcriptPath, 'utf8').trim();
    } finally {
      this._removeTempDir(outputDir);
    }
  }

  _createWavBuffer(rawPcmBuffer) {
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + rawPcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(rawPcmBuffer.length, 40);

    return Buffer.concat([header, rawPcmBuffer]);
  }

  _removeTempDir(tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.error('Failed to remove Whisper temp directory', {
        tempDir,
        error: error.message
      });
    }
  }
}

module.exports = new SpeechService();
