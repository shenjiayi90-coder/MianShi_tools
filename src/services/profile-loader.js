/**
 * Personal context loader — "who am I" for the LLM.
 *
 * The interview copilot can only answer questions like "你简历上第二个项目用了
 * 什么架构" or "你刚说的召回率提升 23% 是怎么做的" if it knows the candidate's
 * actual background. Without it the model invents a plausible-sounding project,
 * which in a real interview is catastrophic.
 *
 * The profile lives in `profile.md` at the project root. It is plain text the
 * user edits freely — no schema, no build step. It is loaded once at startup
 * and re-checked periodically so edits show up without a restart.
 *
 * Deliberately NOT a vector store: a resume is a page or two, which fits
 * comfortably in the context window of any model this app talks to. Full-text
 * injection is simpler, has no retrieval failure modes, and cannot miss.
 */

const fs = require('fs');
const path = require('path');
const loggerModule = require('../core/logger');
const logger = loggerModule.createServiceLogger('PROFILE');

const PROFILE_FILENAME = 'profile.md';
const PROFILE_DIRNAME = 'profile';
const RECHECK_INTERVAL_MS = 30000;

class ProfileLoader {
  constructor() {
    this.cache = null;
    this.lastCheckedAt = 0;
    this._lastFingerprint = null;
    this._docMtimes = new Map();
  }

  /** Candidate locations for the main profile, in priority order. */
  _candidatePaths() {
    return [
      path.join(process.cwd(), PROFILE_FILENAME),
      path.join(__dirname, '..', '..', PROFILE_FILENAME)
    ];
  }

  /**
   * Directory holding per-project deep-dive documents.
   *
   * A resume fits in one file, but interview prep material grows per project —
   * one "面试深挖手册" per project, each easily hundreds of lines. Keeping them
   * as separate files means adding a project is dropping a document into this
   * folder; nothing else changes.
   */
  _profileDirs() {
    return [
      path.join(process.cwd(), PROFILE_DIRNAME),
      path.join(__dirname, '..', '..', PROFILE_DIRNAME)
    ];
  }

  _statSafe(filePath) {
    try {
      return fs.statSync(filePath);
    } catch (_) {
      return null;
    }
  }

  /**
   * All .md files in the profile/ directories (both supported), sorted by name
   * so the assembled profile is stable across reloads.
   */
  _collectProjectDocs() {
    const docs = [];
    for (const dir of this._profileDirs()) {
      let entries = null;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_) {
        continue; // directory does not exist
      }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
        const full = path.join(dir, entry.name);
        const stat = this._statSafe(full);
        if (!stat) continue;
        // Keyed by name so the same file discovered via both candidate roots
        // (cwd and app dir are the same in dev) is only included once.
        docs.push({ name: entry.name, path: full, mtimeMs: stat.mtimeMs });
      }
    }
    // Deduplicate by filename across the candidate roots, then sort for a
    // deterministic order.
    const byName = new Map(docs.map((d) => [d.name, d]));
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  _readSafe(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      logger.warn('Failed to read profile document', {
        path: filePath,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Assemble the whole profile: main file + every project document, with a
   * section header per document so the model can tell projects apart.
   */
  _assemble() {
    const parts = [];

    const mainPath = this._candidatePaths()
      .map((p) => ({ p, stat: this._statSafe(p) }))
      .find((x) => x.stat && x.stat.isFile());

    if (mainPath) {
      const content = this._readSafe(mainPath.p);
      if (content && content.trim()) {
        parts.push(content.trim());
        this._mainMtime = mainPath.stat.mtimeMs;
      } else {
        this._mainMtime = 0;
      }
    } else {
      this._mainMtime = 0;
    }

    for (const doc of this._collectProjectDocs()) {
      const content = this._readSafe(doc.path);
      if (!content || !content.trim()) continue;
      // Strip the extension for a cleaner header; keep the filename so a
      // document can be found again later.
      const title = doc.name.replace(/\.md$/i, '');
      parts.push(`\n\n<!-- 来源文档: ${doc.name} -->\n# ${title}\n\n${content.trim()}`);
      this._docMtimes.set(doc.name, doc.mtimeMs);
    }

    return parts.join('\n\n').trim();
  }

  /**
   * Get the current profile text, or '' when none is configured.
   *
   * Re-reads at most once every RECHECK_INTERVAL_MS so an interview-length
   * session picks up edits without hammering the filesystem.
   */
  getProfile() {
    const now = Date.now();
    if (now - this.lastCheckedAt < RECHECK_INTERVAL_MS && this.cache !== null) {
      return this.cache;
    }
    this.lastCheckedAt = now;

    // Cheap change detection: compare mtimes of everything that participates.
    const fingerprint = [this._mainMtime || 0, ...this._collectProjectDocs().map((d) => d.mtimeMs)].join('|');
    if (this.cache !== null && fingerprint === this._lastFingerprint) {
      return this.cache;
    }
    this._lastFingerprint = fingerprint;

    this._docMtimes = new Map();
    const assembled = this._assemble();
    if (assembled) {
      this.cache = assembled;
      logger.info('Profile assembled', {
        characters: assembled.length,
        projectDocs: this._docMtimes.size
      });
    } else {
      this.cache = '';
    }
    return this.cache;
  }

  hasProfile() {
    return this.getProfile().length > 0;
  }

  /** Force a reload on next access (used after settings changes). */
  invalidate() {
    this.cache = null;
    this.lastCheckedAt = 0;
    this._lastFingerprint = null;
  }

  /**
   * Build the system-prompt block for the candidate's personal context.
   *
   * Returns '' when no profile exists, so callers can append it unconditionally.
   */
  getProfileContext() {
    const profile = this.getProfile();
    if (!profile) return '';

    return `
# CANDIDATE PROFILE (真实资料 — 这是面试者本人的背景)

以下内容来自候选人本人的简历/项目材料，是唯一可信的事实来源：

${profile}

使用这份资料的规则：
- 回答"你的项目 / 你的经历 / 你的简历"类问题时，**只能引用上面的事实**。
  技术选型、数据、难点、结果都必须来自这份材料，绝不允许编造。
- 材料里没有的信息，用一句话明确说明，例如"这个细节我的材料里没有，
  我按通用做法来回答"—— 然后再给一个通用答案。绝不编造具体数字或细节。
- 被追问时优先到这份材料里找对应条目，而不是重新发明。
`;
  }
}

module.exports = new ProfileLoader();
