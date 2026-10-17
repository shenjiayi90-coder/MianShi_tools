/**
 * Standalone smoke test for the DeepSeek transport + adapter.
 * Run: node scripts/test-deepseek.js
 */
const { DeepSeekClient } = require('../src/services/deepseek.client');
const { toDeepSeekParams } = require('../src/services/deepseek.adapter');

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY is not set');
  process.exit(1);
}

const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
const client = new DeepSeekClient({ apiKey, timeout: 120000 });

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function testAdapter() {
  console.log('\n[1] Adapter: Gemini shape -> DeepSeek params');
  const req = {
    systemInstruction: { parts: [{ text: 'You are a DSA tutor.' }] },
    contents: [
      { role: 'user', parts: [{ text: 'What is a hash map?' }] },
      { role: 'model', parts: [{ text: 'A key-value structure.' }] },
      { role: 'user', parts: [{ text: 'Give an example.' }] }
    ],
    generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 4096 }
  };
  const params = toDeepSeekParams(req, { model, reasoningEffort: 'low' });
  check('system message hoisted', params.messages[0].role === 'system', params.messages[0].content);
  check('model role -> assistant', params.messages[2].role === 'assistant');
  check('message count', params.messages.length === 4, `got ${params.messages.length}`);
  check('maxTokens mapped', params.maxTokens === 4096, `got ${params.maxTokens}`);
  check('temperature mapped', params.temperature === 0.7, `got ${params.temperature}`);
  check('reasoningEffort passed', params.reasoningEffort === 'low');

  // Image conversion
  const imgReq = {
    contents: [{
      role: 'user',
      parts: [
        { text: 'Read this.' },
        { inlineData: { data: 'AAAA', mimeType: 'image/png' } }
      ]
    }]
  };
  const imgParams = toDeepSeekParams(imgReq, { model });
  const blocks = imgParams.messages[0].content;
  check('image -> block array', Array.isArray(blocks), `type=${typeof blocks}`);
  check('image_url data URL', Array.isArray(blocks) && blocks[1].image_url.url.startsWith('data:image/png;base64,AAAA'));
}

async function testChat() {
  console.log('\n[2] Non-streaming chat');
  const params = toDeepSeekParams({
    contents: [{ role: 'user', parts: [{ text: 'Reply with exactly the word PONG and nothing else.' }] }]
  }, { model, maxTokens: 500, reasoningEffort: 'none' });
  const result = await client.createChatCompletion(params);
  check('got text', result.text.trim().length > 0, JSON.stringify(result.text.trim().slice(0, 60)));
  check('text contains PONG', /PONG/i.test(result.text));
  check('usage reported', !!result.usage, `completion=${result.usage && result.usage.completion_tokens}`);
}

async function testStreaming() {
  console.log('\n[3] Streaming chat (delta callback)');
  const params = toDeepSeekParams({
    contents: [{ role: 'user', parts: [{ text: 'Count from 1 to 10, comma separated, nothing else.' }] }]
  }, { model, maxTokens: 800, reasoningEffort: 'none' });

  let deltaCount = 0;
  let streamed = '';
  const t0 = Date.now();
  let firstDeltaAt = null;
  const result = await client.streamChatCompletion(params, (delta) => {
    if (firstDeltaAt === null) firstDeltaAt = Date.now() - t0;
    deltaCount++;
    streamed += delta;
  });

  check('deltas received', deltaCount > 1, `${deltaCount} deltas, first at ${firstDeltaAt}ms`);
  check('stream matches final', streamed === result.text, `streamed=${streamed.length} final=${result.text.length}`);
  check('text non-empty', result.text.trim().length > 0, JSON.stringify(result.text.trim().slice(0, 60)));
  check('finishReason set', result.finishReason === 'stop', `got ${result.finishReason}`);
}

async function testVision() {
  console.log('\n[4] Vision (multimodal screenshot path)');
  // 1x1 is useless for OCR, so build a real PNG with text via a tiny raw PNG.
  // Instead we reuse a pre-rendered base64 image of the text "DEEPSEEK OK".
  const png = require('./fixtures/deepseek-ok.png.base64.json');
  const params = toDeepSeekParams({
    contents: [{
      role: 'user',
      parts: [
        { text: 'What text is written in this image? Reply with just that text.' },
        { inlineData: { data: png.data, mimeType: 'image/png' } }
      ]
    }]
  }, { model, maxTokens: 1000, reasoningEffort: 'none' });

  const result = await client.createChatCompletion(params);
  check('vision text returned', result.text.trim().length > 0, JSON.stringify(result.text.trim()));
  check('vision read the text', /DEEPSEEK\s*OK/i.test(result.text));
}

async function testReasoningBudget() {
  console.log('\n[5] Reasoning budget behaviour');
  const question = 'Explain the two-pointer technique briefly.';

  const off = await client.createChatCompletion(toDeepSeekParams(
    { contents: [{ role: 'user', parts: [{ text: question }] }] },
    { model, maxTokens: 2000, reasoningEffort: 'none' }
  ));
  check('thinking disabled -> no reasoning tokens', !off.reasoning, `reasoning len=${off.reasoning.length}`);
  check('thinking disabled -> answer present', off.text.trim().length > 0, `${off.text.length} chars`);

  const low = await client.createChatCompletion(toDeepSeekParams(
    { contents: [{ role: 'user', parts: [{ text: question }] }] },
    { model, maxTokens: 2000, reasoningEffort: 'low' }
  ));
  check('reasoning_effort=low -> thinking happens', low.reasoning.length > 0, `${low.reasoning.length} chars`);
  check('reasoning_effort=low -> answer present', low.text.trim().length > 0, `${low.text.length} chars`);
}

async function testErrors() {
  console.log('\n[6] Error handling');
  const bad = new DeepSeekClient({ apiKey: 'sk-invalid-key-for-testing', timeout: 30000 });
  try {
    await bad.createChatCompletion({ model, messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 });
    check('invalid key rejected', false, 'no error thrown');
  } catch (e) {
    check('invalid key rejected', e.statusCode === 401 || e.statusCode === 403, `status=${e.statusCode} type=${e.type} msg=${e.message.slice(0, 80)}`);
  }

  try {
    await client.createChatCompletion({ model: 'no-such-model-xyz', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 });
    check('bad model rejected', false, 'no error thrown');
  } catch (e) {
    check('bad model rejected', e.statusCode === 400 || e.statusCode === 404, `status=${e.statusCode} msg=${e.message.slice(0, 80)}`);
  }
}

(async () => {
  console.log(`DeepSeek smoke test — model=${model}`);
  try {
    await testAdapter();
    await testChat();
    await testStreaming();
    await testVision();
    await testReasoningBudget();
    await testErrors();
  } catch (e) {
    failures++;
    console.error('\nUNEXPECTED ERROR:', e && e.stack ? e.stack : e);
  }
  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
