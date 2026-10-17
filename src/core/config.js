const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.appDataDir = path.join(os.homedir(), '.OpenCluely');
    this.loadConfiguration();
  }

  loadConfiguration() {
    this.config = {
      app: {
        name: 'OpenCluely',
        version: '1.0.0',
        processTitle: 'OpenCluely',
        dataDir: this.appDataDir,
        isDevelopment: this.env === 'development',
        isProduction: this.env === 'production'
      },
      
      window: {
        defaultWidth: 400,
        defaultHeight: 600,
        minWidth: 300,
        minHeight: 400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../../preload.js')
        }
      },

      ocr: {
        language: 'eng',
        tempDir: os.tmpdir(),
        cleanupDelay: 5000
      },

      llm: {
        // Active provider. Kept as a switch so a Gemini backend can be
        // reintroduced without touching the service layer.
        provider: process.env.LLM_PROVIDER || 'deepseek',

        // Natural language for explanations.
        //   'auto' → mirror the language of the question (default)
        //   'zh'   → always answer in Chinese, even if asked in English
        // Distinct from the coding language, which only controls code fences.
        responseLanguage: process.env.LLM_RESPONSE_LANGUAGE || 'auto',

        deepseek: {
          // `deepseek-flash` is the multimodal (text + image) model, which is
          // what screenshot analysis requires.
          model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
          baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
          fallbackModels: [],
          maxRetries: 3,
          // Reasoning models think before answering, so a request that would
          // take 4s without thinking can take 10s+ with it. 90s covers a long
          // thinking answer on a slow connection without hanging the UI.
          timeout: 90000,
          fallbackEnabled: true,
          generation: {
            temperature: 0.7,
            topP: 0.9,
            // Reasoning tokens are billed against max_tokens, so this must be
            // generous: with thinking on, a hard DSA answer can spend 2-3k
            // tokens thinking before writing a single character of output.
            maxOutputTokens: 8192
          },
          // 'none' | 'low' | 'high' | 'max'.
          //   none → no chain-of-thought; fastest (~4s) — the default here
          //   low  → balanced (~5s)
          //   high → best answers (~8-10s, provider default)
          // Thinking is disabled by default: in a live interview the answer is
          // needed immediately, and reasoning tokens also consume the
          // max_tokens budget (which can truncate or empty the visible answer).
          // Raise it via Settings or DEEPSEEK_REASONING_EFFORT when a problem
          // genuinely needs deeper analysis.
          reasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT || 'none'
        },

        // Retained for reference / future re-enable.
        gemini: {
          model: 'gemini-3.1-flash-lite',
          fallbackModels: ['gemini-2.5-flash-lite', 'gemini-3.5-flash'],
          maxRetries: 3,
          timeout: 30000,
          fallbackEnabled: true,
          enableFallbackMethod: true,
          generation: {
            temperature: 0.7,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingBudget: 0 }
          }
        }
      },

      speech: {
        provider: 'azure',
        azure: {
          language: 'en-US',
          enableDictation: true,
          enableAudioLogging: false,
          outputFormat: 'detailed'
        },
        // DashScope (Alibaba Bailian) cloud streaming ASR — Qwen / FunASR.
        // Strongest option for Chinese and for Chinese/English code-switching,
        // and far faster to first text than local Whisper.
        dashscope: {
          model: process.env.DASHSCOPE_ASR_MODEL || 'qwen-audio-3.0-asr-flash-streaming',
          baseUrl: process.env.DASHSCOPE_WS_URL || 'wss://maas.qianwenaiapi.com/api-ws/v1/inference',
          // Declaring both languages is what keeps English technical terms
          // ("token bucket", "Redis") intact inside Chinese speech.
          languageHints: process.env.DASHSCOPE_LANGUAGE_HINTS || 'zh,en',
          // Drops filler words ("嗯", "那个") from the transcript.
          disfluencyRemoval: false
        },
        whisper: {
          model: 'small',
          language: 'auto',
          // segmentMs is the legacy fixed-window size and now acts as the
          // hard upper bound for a single utterance when VAD is enabled.
          segmentMs: 4000,
          // Voice-activity-detection driven segmentation. Instead of cutting
          // audio on a blind timer (which splits sentences mid-word), we flush
          // a segment when the speaker pauses. This makes transcription align
          // with natural utterance boundaries.
          vadEnabled: true,
          // Trailing silence (ms) that ends an utterance and triggers a flush.
          silenceHangoverMs: 700,
          // Minimum accumulated speech (ms) before a pause counts as an
          // utterance — guards against coughs/clicks producing empty flushes.
          minUtteranceMs: 350,
          // Hard cap (ms): force-flush a long monologue even without a pause.
          maxUtteranceMs: 15000,
          // Pre-roll (ms) of audio kept before speech onset so the first
          // syllable isn't clipped when we start capturing.
          preRollMs: 300,
          // Absolute RMS energy floor (normalized 0..1). Energy below this is
          // always treated as silence regardless of the adaptive noise floor.
          vadEnergyFloor: 0.008,
          // The system-audio (loopback) channel carries the interviewer's voice
          // straight from the call mix — louder and cleaner than a room mic, so
          // it needs its own, lower floor.
          systemVadEnergyFloor: 0.004,
          // Capture system audio alongside the microphone so the interviewer's
          // questions can be told apart from the candidate's own speech.
          // Opt-in: needs an extra permission on macOS and is unavailable on Linux.
          systemAudioEnabled: false,
          // Who the app answers: 'interviewer' | 'me' | 'both'.
          //   interviewer — only the other party's questions trigger an answer
          //                 (their voice comes from the system-audio channel)
          //   me          — only your own voice triggers an answer
          //   both        — either one does
          answerSource: 'interviewer'
        }
      },

      session: {
        maxMemorySize: 1000,
        compressionThreshold: 500,
        clearOnRestart: false
      },

      stealth: {
        hideFromDock: true,
        noAttachConsole: true,
        disguiseProcess: true
      }
    };
  }

  get(keyPath) {
    return keyPath.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  getApiKey(service) {
    const envKey = `${service.toUpperCase()}_API_KEY`;
    return process.env[envKey];
  }

  isFeatureEnabled(feature) {
    return this.get(`features.${feature}`) !== false;
  }
}

module.exports = new ConfigManager();
