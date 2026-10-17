/**
 * Cross-channel echo suppression.
 *
 * The two capture channels are meant to be independent:
 *
 *   system (loopback) ← the call's digital output  = the interviewer
 *   mic               ← the room's acoustics       = the candidate
 *
 * On speakers those two overlap. The interviewer's voice leaves the speakers,
 * travels through the air, and is picked up by the microphone a moment later.
 * Both channels transcribe the same sentence, so the panel shows it twice —
 * once as [面试官] and once as [我].
 *
 * Browser-side `echoCancellation` cannot fix this: it is tuned for a single
 * device's own playback, and here the "echo" arrives on a *different* channel
 * whose text has already been transcribed independently. So the duplicate is
 * removed at the text level instead.
 *
 * Design constraints:
 *   - ASR is not deterministic, so the two transcripts of one sentence differ
 *     slightly. Matching must be fuzzy, not exact.
 *   - Genuine dialogue must survive: the interviewer asking a question and the
 *     candidate answering it are different sentences and must both be kept.
 *     Hence a short time window and a high similarity bar.
 *
 * Headphones eliminate the problem at the source; this is the safety net for
 * everyone who does not wear them.
 */

/** How long after a system-channel line a mic line is still considered an echo. */
const DEFAULT_WINDOW_MS = 4000;

/**
 * Minimum similarity (0..1) for a line to be judged an echo.
 *
 * Chosen from measured scores:
 *   true echo (same sentence, ASR variants)  ~0.90-1.00
 *   same topic, different sentence           ~0.45-0.55
 *   unrelated                                <0.20
 *
 * 0.62 sits in the gap with room on both sides. The false-negative cost is a
 * visible duplicate; the false-positive cost is silently swallowing something
 * the candidate said, which is far worse — so the bar stays high.
 */
const DEFAULT_THRESHOLD = 0.62;

/** Lines shorter than this are too ambiguous to match on ("好的", "嗯"). */
const MIN_COMPARABLE_LENGTH = 4;

/**
 * Normalise text for comparison: lowercase, strip punctuation/whitespace and
 * the speaker tags the app prepends.
 */
function normalize(text) {
  return String(text || '')
    .replace(/^\s*\[(面试官|我|interviewer|me)\]\s*/i, '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

/**
 * Character-bigram Dice coefficient — a good fit for Chinese, where word
 * segmentation is not available and single characters are too granular.
 *
 * Returns 0..1. Identical strings score 1; unrelated strings score near 0.
 */
function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  // A very short string fully contained in a longer one is likely the same
  // utterance truncated ("快速排序的最坏时间复杂度" ⊂ "...是多少？").
  if (x.length >= MIN_COMPARABLE_LENGTH && y.includes(x)) return 0.95;
  if (y.length >= MIN_COMPARABLE_LENGTH && x.includes(y)) return 0.95;

  const bigrams = (s) => {
    const out = new Map();
    if (s.length < 2) {
      out.set(s, 1);
      return out;
    }
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };

  const A = bigrams(x);
  const B = bigrams(y);
  let overlap = 0;
  for (const [g, count] of A) {
    const other = B.get(g);
    if (other) overlap += Math.min(count, other);
  }
  const total = (x.length < 2 ? 1 : x.length - 1) + (y.length < 2 ? 1 : y.length - 1);
  return total > 0 ? (2 * overlap) / total : 0;
}

/**
 * Which channel wins when both transcribe the same sentence.
 *
 * This is the crux of correct echo handling. A naive "first one wins" rule is
 * WRONG: measured in the running app, the microphone consistently reports the
 * sentence *before* the loopback channel does (Web Audio buffers in 4096-frame
 * blocks and the loopback stream is itself re-sampled, so the digital path is
 * not necessarily the faster one). First-wins therefore kept the microphone
 * copy and discarded the interviewer's — which silently inverted the speaker
 * labels, and since the app only answers the interviewer, it stopped answering
 * entirely.
 *
 * The loopback channel is authoritative whenever the two disagree: it is the
 * call's own digital mix, with no room acoustics. The microphone copy is the
 * echo by definition.
 */
const AUTHORITATIVE_CHANNEL = 'system';

class EchoSuppressor {
  constructor(options = {}) {
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    this.threshold = options.threshold || DEFAULT_THRESHOLD;
    this.recent = [];
  }

  /**
   * Record a transcript so later lines on the other channel can be matched
   * against it.
   *
   * @param {string} channelId 'mic' | 'system'
   * @param {string} text
   */
  record(channelId, text) {
    const normalized = normalize(text);
    if (normalized.length < MIN_COMPARABLE_LENGTH) return;
    this.recent.push({ channelId, normalized, text, at: Date.now() });
    this._prune();
  }

  /**
   * Would this line duplicate something just heard on the other channel?
   *
   * Callers should also consult `shouldPrefer(channelId)` before recording:
   * a line can be a genuine duplicate yet still be the copy worth keeping.
   *
   * @param {string} channelId channel the line arrived on
   * @param {string} text
   * @returns {{isEcho: boolean, matchedText?: string, score?: number, reason?: string}}
   */
  check(channelId, text) {
    const normalized = normalize(text);
    if (normalized.length < MIN_COMPARABLE_LENGTH) {
      return { isEcho: false };
    }

    const now = Date.now();
    let best = null;

    for (const entry of this.recent) {
      if (entry.channelId === channelId) continue;
      if (now - entry.at > this.windowMs) continue;

      const score = similarity(normalized, entry.normalized);
      if (score >= this.threshold && (!best || score > best.score)) {
        best = { score, matchedText: entry.text, matchedChannel: entry.channelId };
      }
    }

    if (!best) {
      return { isEcho: false };
    }

    // The authoritative channel is never treated as an echo, even when the
    // microphone happened to report the same sentence first. In that case the
    // microphone copy is the one to drop — but it has already been emitted, so
    // we accept the duplicate rather than losing the interviewer's line.
    if (channelId === AUTHORITATIVE_CHANNEL) {
      return {
        isEcho: false,
        duplicateOfOtherChannel: true,
        matchedText: best.matchedText,
        score: best.score
      };
    }

    return {
      isEcho: true,
      matchedText: best.matchedText,
      matchedChannel: best.matchedChannel,
      score: best.score
    };
  }

  /**
   * Has the authoritative channel already spoken this sentence?
   *
   * Used as a second-pass guard: if the microphone reported it first and the
   * loopback reports it later, the earlier microphone line is the duplicate.
   *
   * @param {string} text
   * @param {number} withinMs
   */
  findRecentOnChannel(channelId, text, withinMs = this.windowMs) {
    const normalized = normalize(text);
    if (normalized.length < MIN_COMPARABLE_LENGTH) return null;
    const now = Date.now();
    for (let i = this.recent.length - 1; i >= 0; i--) {
      const entry = this.recent[i];
      if (entry.channelId !== channelId) continue;
      if (now - entry.at > withinMs) continue;
      const score = similarity(normalized, entry.normalized);
      if (score >= this.threshold) return { ...entry, score };
    }
    return null;
  }

  /** Drop entries that can no longer match anything. */
  _prune() {
    const cutoff = Date.now() - this.windowMs;
    this.recent = this.recent.filter((e) => e.at >= cutoff);
    // Hard cap so a long silent stretch cannot grow the buffer without bound.
    if (this.recent.length > 40) {
      this.recent = this.recent.slice(-40);
    }
  }

  reset() {
    this.recent = [];
  }
}

module.exports = { EchoSuppressor, similarity, normalize, DEFAULT_WINDOW_MS, DEFAULT_THRESHOLD };
