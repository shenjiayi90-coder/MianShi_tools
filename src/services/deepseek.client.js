/**
 * DeepSeek chat client (OpenAI-compatible transport).
 *
 * This module is deliberately dependency-free — it talks to the DeepSeek REST
 * API over Node's built-in `https` module so the app does not need an extra SDK
 * (and therefore no extra supply-chain surface) to reach the model.
 *
 * Two call shapes are supported:
 *   - createChatCompletion()   → one JSON response
 *   - streamChatCompletion()   → Server-Sent Events, deltas pushed to a callback
 *
 * DeepSeek's reasoning models return two parallel streams:
 *   - `reasoning_content` — the model's private thinking
 *   - `content`           — the answer the user actually wants
 * Only `content` is forwarded to the UI. `reasoning_content` is accumulated and
 * handed back for logging, because it still consumes the `max_tokens` budget
 * and is the usual cause of a truncated (or empty) answer.
 */

const https = require('https');

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_TIMEOUT_MS = 60000;

/** Error carrying the HTTP status and the provider's own error code. */
class DeepSeekApiError extends Error {
  constructor(message, { statusCode = null, type = null, body = null } = {}) {
    super(message);
    this.name = 'DeepSeekApiError';
    this.statusCode = statusCode;
    this.type = type;
    this.body = body;
  }
}

class DeepSeekClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = Number(options.timeout) || DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent || `OpenCluely/1.0 (Node.js/${process.version}; ${process.platform})`;
    // Keep-alive lets back-to-back interview questions reuse one TLS session,
    // which removes a full handshake from the critical path of every answer.
    this.agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
  }

  isConfigured() {
    return !!this.apiKey && this.apiKey !== 'your_deepseek_api_key_here';
  }

  updateApiKey(apiKey) {
    this.apiKey = apiKey || '';
  }

  /**
   * Translate the app's internal option names into the wire format.
   * `reasoningEffort: 'none'` is sent as the explicit `thinking` disable flag
   * because the provider ignores an unknown `reasoning_effort` value silently.
   */
  _buildPayload(params, stream) {
    const payload = {
      model: params.model,
      messages: params.messages,
      stream: !!stream
    };

    if (params.maxTokens != null) payload.max_tokens = params.maxTokens;
    if (params.temperature != null) payload.temperature = params.temperature;
    if (params.topP != null) payload.top_p = params.topP;

    if (params.reasoningEffort === 'none' || params.reasoningEffort === 'off') {
      payload.thinking = { type: 'disabled' };
    } else if (params.reasoningEffort) {
      payload.reasoning_effort = params.reasoningEffort;
    }

    return payload;
  }

  _buildHeaders(bodyString, stream) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Length': Buffer.byteLength(bodyString),
      'User-Agent': this.userAgent,
      'Accept': stream ? 'text/event-stream' : 'application/json'
    };
  }

  /** Pull the provider's own error text out of a non-2xx body. */
  _errorFromBody(statusCode, rawBody) {
    let message = `DeepSeek API returned HTTP ${statusCode}`;
    let type = null;
    try {
      const parsed = JSON.parse(rawBody);
      const apiError = parsed && parsed.error;
      if (apiError && apiError.message) {
        message = apiError.message;
        type = apiError.type || apiError.code || null;
      } else if (parsed && parsed.message) {
        message = parsed.message;
      }
    } catch (_) {
      if (rawBody && rawBody.trim()) message = `${message}: ${rawBody.slice(0, 300)}`;
    }
    return new DeepSeekApiError(message, { statusCode, type, body: rawBody });
  }

  /**
   * One non-streaming completion.
   * @returns {Promise<{text: string, reasoning: string, finishReason: string|null, usage: object|null, model: string}>}
   */
  createChatCompletion(params) {
    const bodyString = JSON.stringify(this._buildPayload(params, false));

    return new Promise((resolve, reject) => {
      const req = https.request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this._buildHeaders(bodyString, false),
        timeout: this.timeout,
        agent: this.agent
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(this._errorFromBody(res.statusCode, raw));
            return;
          }
          try {
            resolve(this._parseCompletion(JSON.parse(raw)));
          } catch (parseError) {
            reject(new DeepSeekApiError(`Failed to parse DeepSeek response: ${parseError.message}`, {
              statusCode: res.statusCode,
              body: raw.slice(0, 500)
            }));
          }
        });
        res.on('error', (error) => reject(new DeepSeekApiError(`Response stream error: ${error.message}`)));
      });

      req.on('error', (error) => reject(new DeepSeekApiError(`Request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new DeepSeekApiError(`Request timed out after ${this.timeout}ms`));
      });

      req.write(bodyString);
      req.end();
    });
  }

  _parseCompletion(json) {
    const choice = (json && json.choices && json.choices[0]) || null;
    if (!choice) {
      throw new DeepSeekApiError('DeepSeek response contained no choices', { body: JSON.stringify(json).slice(0, 300) });
    }
    const message = choice.message || {};
    return {
      text: typeof message.content === 'string' ? message.content : '',
      reasoning: typeof message.reasoning_content === 'string' ? message.reasoning_content : '',
      finishReason: choice.finish_reason || null,
      usage: json.usage || null,
      model: json.model || null
    };
  }

  /**
   * Streaming completion over SSE.
   *
   * @param {object} params
   * @param {(delta: string) => void} [onDelta] Called with each *answer* delta.
   *        Thinking deltas are intentionally not forwarded.
   * @returns {Promise<{text, reasoning, finishReason, usage, model}>}
   */
  streamChatCompletion(params, onDelta) {
    const bodyString = JSON.stringify(this._buildPayload(params, true));

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const req = https.request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this._buildHeaders(bodyString, true),
        timeout: this.timeout,
        agent: this.agent
      }, (res) => {
        if (res.statusCode !== 200) {
          let errBody = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { errBody += c; });
          res.on('end', () => fail(this._errorFromBody(res.statusCode, errBody)));
          return;
        }

        let buffer = '';
        let text = '';
        let reasoning = '';
        let finishReason = null;
        let usage = null;
        let model = null;

        res.setEncoding('utf8');

        const handleLine = (line) => {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) return;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') return;

          let json;
          try {
            json = JSON.parse(payload);
          } catch (_) {
            // A partial JSON frame split across TCP chunks is not expected with
            // line framing, but skipping it is strictly safer than throwing.
            return;
          }

          if (json.model) model = json.model;
          if (json.usage) usage = json.usage;

          const choice = json.choices && json.choices[0];
          if (!choice) return;
          if (choice.finish_reason) finishReason = choice.finish_reason;

          const delta = choice.delta || {};
          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
            reasoning += delta.reasoning_content;
          }
          if (typeof delta.content === 'string' && delta.content) {
            text += delta.content;
            if (typeof onDelta === 'function') onDelta(delta.content);
          }
        };

        res.on('data', (chunk) => {
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            handleLine(line);
          }
        });

        res.on('end', () => {
          if (buffer) handleLine(buffer);
          done({ text, reasoning, finishReason, usage, model });
        });

        res.on('error', (error) => fail(new DeepSeekApiError(`Streaming response error: ${error.message}`)));
      });

      req.on('error', (error) => fail(new DeepSeekApiError(`Request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        fail(new DeepSeekApiError(`Request timed out after ${this.timeout}ms`));
      });

      req.write(bodyString);
      req.end();
    });
  }

  /** Used by the settings / diagnostics UI to confirm the key is live. */
  listModels() {
    return new Promise((resolve, reject) => {
      const req = https.request(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        },
        timeout: this.timeout,
        agent: this.agent
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(this._errorFromBody(res.statusCode, raw));
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            resolve(Array.isArray(parsed.data) ? parsed.data : []);
          } catch (e) {
            reject(new DeepSeekApiError(`Failed to parse model list: ${e.message}`));
          }
        });
        res.on('error', (error) => reject(new DeepSeekApiError(error.message)));
      });
      req.on('error', (error) => reject(new DeepSeekApiError(`Request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new DeepSeekApiError(`Request timed out after ${this.timeout}ms`));
      });
      req.end();
    });
  }
}

module.exports = { DeepSeekClient, DeepSeekApiError, DEFAULT_BASE_URL };
