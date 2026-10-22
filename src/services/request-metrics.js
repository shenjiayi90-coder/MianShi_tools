/**
 * Request metrics — the two numbers that decide whether this thing is usable
 * in a live interview:
 *
 *   TTFT (time to first token)  — how long until text starts appearing
 *   context utilization         — how full the prompt is relative to the
 *                                 model's context window
 *
 * Both are per-request and kept in a small rolling window so the renderer can
 * display the latest one and a short trend without unbounded growth.
 */

const loggerModule = require('../core/logger');
const logger = loggerModule.createServiceLogger('METRICS');

// deepseek-flash exposes a 1M-token window, but the practical budget is far
// smaller than that — cost and latency grow with input. Treating 128K as the
// "full" mark keeps the percentage honest and actionable; going past it is a
// signal to trim history or the profile, not a hard failure.
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128 * 1024;

// Rough character-per-token ratio for mixed Chinese/English content. Chinese
// is ~1.5 chars/token, English ~4; a blend lands near 2.5. Good enough for a
// utilisation gauge — this is a UI signal, not a billing figure.
const CHARS_PER_TOKEN = 2.5;

/** How many recent requests to retain. */
const HISTORY_LIMIT = 20;

class MetricsCollector {
  constructor() {
    this.history = [];
    this.current = null;
  }

  /** Start tracking one request. */
  begin({ requestId, kind }) {
    this.current = {
      requestId,
      kind: kind || 'unknown',
      startedAt: Date.now(),
      firstTokenAt: null,
      ttftMs: null,
      promptChars: null,
      promptTokens: null,
      contextPercent: null
    };
    return this.current;
  }

  /** Record the first streaming delta. Only the first call per request counts. */
  recordFirstToken() {
    if (this.current && this.current.firstTokenAt === null) {
      this.current.firstTokenAt = Date.now();
      this.current.ttftMs = this.current.firstTokenAt - this.current.startedAt;
    }
  }

  /** Record prompt size (characters) once the request object is built. */
  recordPromptChars(chars) {
    if (!this.current || chars == null) return;
    this.current.promptChars = chars;
    this.current.promptTokens = Math.round(chars / CHARS_PER_TOKEN);
    this.current.contextPercent = Math.min(
      100,
      (this.current.promptTokens / DEFAULT_CONTEXT_WINDOW_TOKENS) * 100
    );
  }

  /** Finish the request and push it into the rolling history. */
  end(extra = {}) {
    if (!this.current) return null;
    const record = {
      ...this.current,
      endedAt: Date.now(),
      totalMs: Date.now() - this.current.startedAt,
      ...extra
    };
    this.history.push(record);
    if (this.history.length > HISTORY_LIMIT) {
      this.history = this.history.slice(-HISTORY_LIMIT);
    }
    this.current = null;

    logger.info('Request metrics', {
      kind: record.kind,
      ttftMs: record.ttftMs,
      totalMs: record.totalMs,
      promptTokens: record.promptTokens,
      contextPercent: record.contextPercent == null
        ? null
        : Number(record.contextPercent.toFixed(2))
    });
    return record;
  }

  /** Latest finished request plus a short trend, for the UI. */
  snapshot() {
    const last = this.history[this.history.length - 1] || null;
    const recent = this.history.slice(-5).filter((r) => r.ttftMs != null);
    const avgTtft = recent.length
      ? Math.round(recent.reduce((s, r) => s + r.ttftMs, 0) / recent.length)
      : null;
    return {
      last: last ? {
        kind: last.kind,
        ttftMs: last.ttftMs,
        totalMs: last.totalMs,
        promptTokens: last.promptTokens,
        contextPercent: last.contextPercent == null
          ? null
          : Number(last.contextPercent.toFixed(2))
      } : null,
      avgTtftMs: avgTtft,
      contextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
      requestsTracked: this.history.length
    };
  }

  reset() {
    this.history = [];
    this.current = null;
  }
}

module.exports = { MetricsCollector, DEFAULT_CONTEXT_WINDOW_TOKENS, CHARS_PER_TOKEN };
