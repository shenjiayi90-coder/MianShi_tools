/**
 * Integration test for the wired-up LLM service (DeepSeek).
 *
 * Unlike scripts/test-deepseek.js (which tests the transport in isolation),
 * this drives the real src/services/llm.service.js exactly as main.js does:
 * the same builder methods, the same streaming callbacks, the same fallbacks.
 *
 * Run: node scripts/test-llm-integration.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const llmService = require('../src/services/llm.service');

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const DSA_QUESTION =
  'Given an array of integers nums and an integer target, return indices of the two numbers that add up to target. ' +
  'Provide the optimal approach and a complete C++ implementation.';

async function testInit() {
  console.log('\n[1] Service initialization');
  check('service is initialized', llmService.isInitialized, `model=${llmService.model}`);
  check('model is deepseek-flash', llmService.model === 'deepseek-flash', llmService.model);
  check('provider is deepseek', llmService.provider === 'deepseek', llmService.provider);

  const stats = llmService.getStats();
  check('stats.hasApiKey true (for config modal)', stats.hasApiKey === true);
  check('stats.model exposed (for config modal)', stats.model === 'deepseek-flash', stats.model);
}

async function testConnection() {
  console.log('\n[2] testConnection() — used by onboarding + settings');
  const result = await llmService.testConnection();
  check('connection succeeded', result.success === true, result.success ? `latency=${result.latency}ms` : result.error);
  if (result.success) {
    check('reported model', result.model === 'deepseek-flash', result.model);
    check('returned text', typeof result.response === 'string' && result.response.length > 0, JSON.stringify((result.response || '').slice(0, 40)));
  }
}

async function testTextStream() {
  console.log('\n[3] processTextWithSkillStream — typed chat path');
  const chunks = [];
  const t0 = Date.now();
  let firstChunkAt = null;

  const result = await llmService.processTextWithSkillStream(
    DSA_QUESTION,
    'dsa',
    [],
    'cpp',
    (delta) => {
      if (firstChunkAt === null) firstChunkAt = Date.now() - t0;
      chunks.push(delta);
    }
  );

  check('streamed multiple chunks', chunks.length > 1, `${chunks.length} chunks, first at ${firstChunkAt}ms`);
  check('response non-empty', result.response.length > 0, `${result.response.length} chars in ${Date.now() - t0}ms`);
  check('marked as streamed', result.metadata.streamed === true);
  check('not a fallback', result.metadata.usedFallback === false);
  check('language enforced (cpp fence)', /```cpp/.test(result.response),
    (result.response.match(/```[a-z]*/) || ['none'])[0]);
  check('answer mentions hash map / two sum',
    /hash|unordered_map|two sum|complement/i.test(result.response));
}

async function testImageStream() {
  console.log('\n[4] processImageWithSkillStream — screenshot path');
  const fixture = require('./fixtures/deepseek-ok.png.base64.json');
  const buffer = Buffer.from(fixture.data, 'base64');

  const chunks = [];
  const t0 = Date.now();
  const result = await llmService.processImageWithSkillStream(
    buffer,
    'image/png',
    'dsa',
    [],
    'cpp',
    (delta) => chunks.push(delta)
  );

  check('image streamed chunks', chunks.length > 0, `${chunks.length} chunks in ${Date.now() - t0}ms`);
  check('image response non-empty', result.response.length > 0, `${result.response.length} chars`);
  check('flagged as image analysis', result.metadata.isImageAnalysis === true);
  check('vision actually read the text', /DEEPSEEK\s*OK/i.test(result.response),
    JSON.stringify(result.response.trim().slice(0, 80)));
}

async function testTranscriptionStream() {
  console.log('\n[5] processTranscriptionWithIntelligentResponseStream — voice path');
  const chunks = [];
  const result = await llmService.processTranscriptionWithIntelligentResponseStream(
    'What is the time complexity of binary search?',
    'dsa',
    [],
    'cpp',
    (delta) => chunks.push(delta)
  );

  check('voice streamed chunks', chunks.length > 0, `${chunks.length} chunks`);
  check('voice response non-empty', result.response.length > 0, `${result.response.length} chars`);
  check('flagged as transcription response', result.metadata.isTranscriptionResponse === true);
  check('answer mentions log n', /log\s*n|O\(log/i.test(result.response),
    JSON.stringify(result.response.trim().slice(0, 80)));
}

async function testCasualFilter() {
  console.log('\n[6] Voice casual-message filter (intelligent prompt behaviour)');
  const result = await llmService.processTranscriptionWithIntelligentResponseStream(
    'Hello, how are you today?',
    'dsa',
    [],
    null,
    () => {}
  );
  check('casual message got a short acknowledgment', result.response.length > 0 && result.response.length < 400,
    `${result.response.length} chars: ${JSON.stringify(result.response.trim().slice(0, 100))}`);
}

async function testReasoningEffortLive() {
  console.log('\n[7] Reasoning is off by default and live-configurable (settings UI path)');
  const config = require('../src/core/config');

  const original = config.get('llm.deepseek.reasoningEffort');
  check('default reasoning effort is "none" (thinking off)', original === 'none', `got ${original}`);

  // With thinking disabled, no reasoning tokens should be produced at all.
  config.set('llm.deepseek.reasoningEffort', 'none');
  const t0 = Date.now();
  const off = await llmService.processTextWithSkillStream('What is a stack? One sentence.', 'dsa', [], null, () => {});
  const offMs = Date.now() - t0;
  check('effort=none returns an answer', off.response.length > 0, `${off.response.length} chars in ${offMs}ms`);

  config.set('llm.deepseek.reasoningEffort', 'low');
  const t1 = Date.now();
  const low = await llmService.processTextWithSkillStream('What is a stack? One sentence.', 'dsa', [], null, () => {});
  const lowMs = Date.now() - t1;
  check('effort=low returns an answer', low.response.length > 0, `${low.response.length} chars in ${lowMs}ms`);

  config.set('llm.deepseek.reasoningEffort', original);
  console.log(`        (none=${offMs}ms, low=${lowMs}ms — both functional)`);
}

async function testErrorSurfacing() {
  console.log('\n[8] Auth failure surfaces a friendly, actionable error');
  const config = require('../src/core/config');
  const goodKey = process.env.DEEPSEEK_API_KEY;

  process.env.DEEPSEEK_API_KEY = 'sk-invalid-key-for-testing';
  llmService.initializeClient();
  const bad = await llmService.testConnection();
  check('bad key -> success=false', bad.success === false, bad.error);
  check('error message is actionable', /deepseek|api key|invalid/i.test(bad.error || ''), bad.error);
  check('errorType is AUTH_ERROR', bad.errorType === 'AUTH_ERROR', bad.errorType);

  process.env.DEEPSEEK_API_KEY = goodKey;
  llmService.initializeClient();
  check('restored with the real key', llmService.isInitialized === true, `model=${llmService.model}`);
}

(async () => {
  console.log('LLM service integration test (DeepSeek)');
  try {
    await testInit();
    await testConnection();
    await testTextStream();
    await testImageStream();
    await testTranscriptionStream();
    await testCasualFilter();
    await testReasoningEffortLive();
    await testErrorSurfacing();
  } catch (e) {
    failures++;
    console.error('\nUNEXPECTED ERROR:', e && e.stack ? e.stack : e);
  }
  console.log(`\n${failures === 0 ? 'ALL INTEGRATION CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
