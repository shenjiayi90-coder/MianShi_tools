/**
 * Request metrics tests (TTFT + context utilisation).
 * Run: node scripts/test-request-metrics.js
 */
const { MetricsCollector, DEFAULT_CONTEXT_WINDOW_TOKENS } = require('../src/services/request-metrics');

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

(async () => {
  console.log('Request metrics tests');

  console.log('\n[1] TTFT capture');
  const m = new MetricsCollector();
  m.begin({ requestId: 1, kind: 'voice' });
  await new Promise((r) => setTimeout(r, 60));
  m.recordFirstToken();
  await new Promise((r) => setTimeout(r, 30));
  m.recordFirstToken(); // second call must be ignored
  const done = m.end({ responseChars: 500 });
  check('ttft captured once', done.ttftMs != null && done.ttftMs >= 55, `${done.ttftMs}ms`);
  check('total exceeds ttft', done.totalMs > done.ttftMs);
  check('history has one record', m.history.length === 1);

  console.log('\n[2] Context utilisation');
  const m2 = new MetricsCollector();
  m2.begin({ requestId: 1, kind: 'voice' });
  m2.recordPromptChars(250 * 1000); // 250k chars ≈ 100k tokens at 2.5 c/t
  const d2 = m2.end({});
  check('token estimate computed', d2.promptTokens > 0, `${d2.promptTokens} tokens`);
  check('percent within range', d2.contextPercent > 50 && d2.contextPercent <= 100,
    `${d2.contextPercent.toFixed(1)}%`);
  check('capped at 100 even for huge prompts', (() => {
    const x = new MetricsCollector();
    x.begin({ requestId: 1, kind: 'chat' });
    x.recordPromptChars(10 * 1000 * 1000);
    return x.end({}).contextPercent === 100;
  })());

  console.log('\n[3] Snapshot shape for the renderer');
  const snap = m2.snapshot();
  check('last record present', !!snap.last);
  check('contextPercent exposed', snap.last.contextPercent != null);
  check('window size exposed', snap.contextWindowTokens === DEFAULT_CONTEXT_WINDOW_TOKENS);
  check('avg TTFT null without data', snap.avgTtftMs === null);

  console.log('\n[4] Trend over several requests');
  const m3 = new MetricsCollector();
  for (let i = 0; i < 7; i++) {
    m3.begin({ requestId: i, kind: 'voice' });
    m3.recordFirstToken();
    m3.recordPromptChars(1000 * (i + 1));
    m3.end({});
  }
  const s3 = m3.snapshot();
  check('history keeps all 7 (below the 20 cap)', m3.history.length === 7 && s3.requestsTracked === 7,
    `tracked=${s3.requestsTracked}`);
  check('last is the most recent', s3.last.promptTokens === Math.round(7000 / 2.5));

  // Cap check: push far more than the limit and verify it trims.
  for (let i = 0; i < 30; i++) {
    m3.begin({ requestId: 100 + i, kind: 'chat' });
    m3.end({});
  }
  check('history trimmed to the 20 cap', m3.history.length === 20, `length=${m3.history.length}`);

  console.log('\n[5] No first token (request failed before streaming)');
  const m4 = new MetricsCollector();
  m4.begin({ requestId: 1, kind: 'chat' });
  m4.end({ error: 'boom' });
  check('ttft null when no token', m4.history[0].ttftMs === null);
  check('snapshot still works', m4.snapshot().last.ttftMs === null);

  console.log(`\n${failures === 0 ? 'ALL METRICS CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
