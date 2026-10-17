/**
 * Echo-suppression tests.
 *
 * The hard part is not removing the duplicate — it is removing it WITHOUT
 * eating real dialogue. These cases pin down both sides.
 *
 * Run: node scripts/test-echo-suppressor.js
 */
const { EchoSuppressor, similarity } = require('../src/services/echo-suppressor');

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function testSimilarity() {
  console.log('\n[1] Similarity scoring');
  // Bounds encode the separation the threshold relies on: true echoes must sit
  // well above DEFAULT_THRESHOLD (0.62), same-topic-different-sentence well
  // below it. If either drifts into the gap, echo removal becomes unsafe.
  const cases = [
    ['请你讲一下快速排序的最坏时间复杂度是多少？', '请你讲一下快速排序的最坏时间复杂度是多少', 'identical minus punctuation', 0.95, 1],
    ['请你讲一下快速排序的最坏时间复杂度是多少？', '复杂度是多少？请你讲一下快速排序的最坏时间复杂度是多少？', 'ASR repeat variant', 0.9, 1],
    ['请介绍一下你的项目经验', '请介绍一下你的项目经历', 'one char differs', 0.85, 1],
    ['请介绍一下你的项目经验', '好的我来介绍一下我的项目', 'same topic, different sentence', 0, 0.55],
    ['请你讲一下快速排序的最坏时间复杂度', '那你觉得有什么办法可以避免这种情况呢', 'unrelated sentences', 0, 0.35],
    ['请介绍一下你的项目经验', '嗯', 'unrelated short', 0, 0.2],
  ];
  for (const [a, b, label, min, max] of cases) {
    const s = similarity(a, b);
    const ok = s >= min && s <= max;
    check(label, ok, `score=${s.toFixed(2)} expected ${min}..${max}`);
  }

  const { DEFAULT_THRESHOLD } = require('../src/services/echo-suppressor');
  const echoMin = Math.min(...cases.slice(0, 3).map(([a, b]) => similarity(a, b)));
  const dialogueMax = Math.max(...cases.slice(3).map(([a, b]) => similarity(a, b)));
  check('threshold sits in the gap between echoes and dialogue',
    DEFAULT_THRESHOLD > dialogueMax && DEFAULT_THRESHOLD < echoMin,
    `dialogueMax=${dialogueMax.toFixed(2)} < threshold=${DEFAULT_THRESHOLD} < echoMin=${echoMin.toFixed(2)}`);
}

function testEchoRemoval() {
  console.log('\n[2] Echo is removed, and the right copy survives');

  // Case A: loopback reported first — the microphone copy is the echo.
  const sup = new EchoSuppressor();
  sup.record('system', '请你讲一下快速排序的最坏时间复杂度是多少？');
  const verdict = sup.check('mic', '复杂度是多少？请你讲一下快速排序的最坏时间复杂度是多少？');
  check('mic echo dropped when loopback arrived first', verdict.isEcho === true,
    verdict.isEcho ? `score=${verdict.score.toFixed(2)}` : 'not detected');

  // Case B: microphone reported FIRST (the common case in the running app).
  // The loopback copy must NOT be dropped — it is the interviewer's line and
  // dropping it inverts the speaker labels, which stops the app answering.
  const sup2 = new EchoSuppressor();
  sup2.record('mic', '请你讲一下快速排序的最坏时间复杂度是多少？');
  const v2 = sup2.check('system', '请你讲一下快速排序的最坏时间复杂度是多少？');
  check('authoritative channel is never dropped as an echo', v2.isEcho === false);
  check('but the duplicate is still flagged for retraction',
    v2.duplicateOfOtherChannel === true && v2.score >= 0.9,
    `score=${(v2.score || 0).toFixed(2)}`);

  // The earlier microphone line is findable so the UI bubble can be withdrawn.
  const earlier = sup2.findRecentOnChannel('mic', '请你讲一下快速排序的最坏时间复杂度是多少？');
  check('earlier microphone line is retrievable for retraction', !!earlier,
    earlier ? `score=${earlier.score.toFixed(2)}` : 'not found');
}

function testDialogueSurvives() {
  console.log('\n[3] Real dialogue is NOT removed');
  const sup = new EchoSuppressor();

  // Interviewer asks.
  sup.record('system', '请你讲一下快速排序的最坏时间复杂度是多少？');
  // Candidate answers — different sentence, same topic. Must survive.
  const answer = sup.check('mic', '好的，快速排序最坏是 O(n²)，因为每次 pivot 都选到最边上');
  check('candidate answer is not treated as echo', answer.isEcho === false,
    answer.isEcho ? `wrongly matched score=${answer.score.toFixed(2)}` : 'kept');

  // Candidate's short acknowledgements must survive too.
  const ack = sup.check('mic', '好的我明白了');
  check('short acknowledgement survives', ack.isEcho === false);

  // A follow-up question from the interviewer on the same channel is unaffected.
  const followUp = sup.check('system', '那你觉得怎么避免这种情况？');
  check('same-channel lines never match', followUp.isEcho === false);
}

function testTimeWindow() {
  console.log('\n[4] Time window expires');
  const sup = new EchoSuppressor({ windowMs: 200 });
  sup.record('system', '请你讲一下快速排序的时间复杂度');

  const immediate = sup.check('mic', '请你讲一下快速排序的时间复杂度');
  check('within window: detected', immediate.isEcho === true);

  // Simulate the same sentence being repeated much later — a real repetition,
  // not an echo.
  const original = Date.now;
  Date.now = () => original() + 5000;
  const late = sup.check('mic', '请你讲一下快速排序的时间复杂度');
  Date.now = original;
  check('outside window: kept', late.isEcho === false);
}

function testShortTextGuard() {
  console.log('\n[5] Short/ambiguous lines are never suppressed');
  const sup = new EchoSuppressor();
  sup.record('system', '嗯');
  const v = sup.check('mic', '嗯');
  check('very short line not matched', v.isEcho === false);
}

function testBufferBound() {
  console.log('\n[6] Buffer stays bounded');
  const sup = new EchoSuppressor();
  for (let i = 0; i < 200; i++) {
    sup.record('system', `这是第${i}句测试用的内容用于验证缓冲区不会无限增长`);
  }
  check('recent buffer capped', sup.recent.length <= 40, `length=${sup.recent.length}`);
}

function testTagStripping() {
  console.log('\n[7] Speaker tags do not affect matching');
  const s = similarity('[面试官] 请你讲一下快速排序', '[我] 请你讲一下快速排序');
  check('tags stripped before comparing', s >= 0.95, `score=${s.toFixed(2)}`);
}

function testReset() {
  console.log('\n[8] Reset clears history');
  const sup = new EchoSuppressor();
  sup.record('system', '请你讲一下快速排序的时间复杂度');
  sup.reset();
  const v = sup.check('mic', '请你讲一下快速排序的时间复杂度');
  check('nothing matches after reset', v.isEcho === false);
}

console.log('Echo suppressor tests');
testSimilarity();
testEchoRemoval();
testDialogueSurvives();
testTimeWindow();
testShortTextGuard();
testBufferBound();
testTagStripping();
testReset();

console.log(`\n${failures === 0 ? 'ALL ECHO CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
