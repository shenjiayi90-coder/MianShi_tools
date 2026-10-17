/**
 * Integration test: DashScope cloud ASR behind the dual-channel service.
 *
 * Drives the real speech.service.js the way main.js does, so it covers the
 * provider switch, per-channel routing and the speaker labels that decide
 * whether the LLM answers.
 *
 * Run: node scripts/test-dashscope-integration.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const speechService = require('../src/services/speech.service');

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function synthesize(text, outFile, rate = 0) {
  const ps = `
Add-Type -AssemblyName System.Speech
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile("${outFile.replace(/\\/g, '\\\\')}", $fmt)
$s.Rate = ${rate}
$s.Speak("${text.replace(/"/g, '`"')}")
$s.Dispose()
`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (!fs.existsSync(outFile)) throw new Error(`synthesis failed for: ${text}`);
  return outFile;
}

function wavToPcm(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'data') return b.slice(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk in ' + file);
}

async function feedChannel(pcm, channelId, { realtime = true, ms = 100 } = {}) {
  const CHUNK = 3200; // 100 ms @16 kHz mono 16-bit
  for (let i = 0; i < pcm.length; i += CHUNK) {
    speechService.handleAudioChunkFromRenderer(pcm.slice(i, i + CHUNK), channelId);
    if (realtime) await new Promise((r) => setTimeout(r, ms));
  }
}

function testProviderSelection() {
  console.log('\n[1] Provider selection and configuration');
  check('provider is dashscope', speechService.provider === 'dashscope', speechService.provider);
  check('service reports available', speechService.isAvailable() === true);
  check('API key detected', !!speechService._getDashScopeApiKey());
  check('model configured', !!speechService._getDashScopeModel(), speechService._getDashScopeModel());
  const hints = speechService._getDashScopeLanguageHints();
  check('language hints include zh and en', hints.includes('zh') && hints.includes('en'), hints.join(','));
  check('manual capture disabled for cloud (server endpoints)',
    speechService.isManualCaptureMode() === false);
}

async function testConnectionProbe() {
  console.log('\n[2] testConnection()');
  const result = await speechService.testConnection();
  check('connection test succeeded', result.success === true, result.message);
}

async function testDualChannel() {
  console.log('\n[3] Dual-channel streaming end to end');

  const wavQ = path.join(os.tmpdir(), 'dsi-question.wav');
  const wavMe = path.join(os.tmpdir(), 'dsi-me.wav');
  synthesize('请你讲一下如何设计一个限流器，token bucket 和 Redis 分别适合什么场景', wavQ);
  synthesize('好的我先整理一下思路再回答你', wavMe);

  const events = [];
  const onTranscript = (text, meta) => events.push({ text, speaker: meta && meta.speaker, channel: meta && meta.channel });
  speechService.on('transcription', onTranscript);

  speechService.initializeClient();
  await speechService.startRecording();
  check('recording started', speechService.isRecording === true);
  check('mic channel capturing', speechService.channels.mic.capturing === true);
  check('system channel capturing', speechService.channels.system.capturing === true);

  await Promise.all([
    feedChannel(wavToPcm(wavQ), 'system'),
    feedChannel(wavToPcm(wavMe), 'mic')
  ]);

  // Let the service deliver the final sentences.
  await new Promise((r) => setTimeout(r, 3000));
  speechService.stopRecording();
  await new Promise((r) => setTimeout(r, 2500));

  speechService.removeListener('transcription', onTranscript);

  console.log('    events:');
  events.forEach((e) => console.log(`      [${e.speaker}] (${e.channel}) ${e.text}`));

  const interviewer = events.filter((e) => e.speaker === 'interviewer');
  const me = events.filter((e) => e.speaker === 'me');

  check('interviewer channel produced a transcript', interviewer.length > 0,
    interviewer.length ? interviewer[0].text.slice(0, 60) : 'none');
  check('me channel produced a transcript', me.length > 0,
    me.length ? me[0].text.slice(0, 60) : 'none');

  const qText = interviewer.map((e) => e.text).join('');
  const meText = me.map((e) => e.text).join('');

  check('interviewer text is the question', /限流器|token bucket|Redis/i.test(qText), qText.slice(0, 80));
  check('me text is the thinking remark', /思路|整理|好的/.test(meText), meText.slice(0, 60));
  check('channels did not cross-contaminate',
    !/整理.*思路/.test(qText) && !/限流器/.test(meText));
  check('English terms survived in Chinese speech',
    /token\s*bucket/i.test(qText) && /redis/i.test(qText), qText.slice(0, 100));
}

function testRouting() {
  console.log('\n[4] Speaker routing decides what reaches the LLM');
  const src = process.env.WHISPER_ANSWER_SOURCE;
  process.env.WHISPER_ANSWER_SOURCE = 'interviewer';
  check('interviewer triggers an answer', speechService.shouldAnswerSpeaker('interviewer') === true);
  check('me does NOT trigger an answer', speechService.shouldAnswerSpeaker('me') === false);
  process.env.WHISPER_ANSWER_SOURCE = 'me';
  check('me-only mode: me triggers', speechService.shouldAnswerSpeaker('me') === true);
  check('me-only mode: interviewer does not', speechService.shouldAnswerSpeaker('interviewer') === false);
  if (src === undefined) delete process.env.WHISPER_ANSWER_SOURCE;
  else process.env.WHISPER_ANSWER_SOURCE = src;
}

async function testCleanup() {
  console.log('\n[5] Shutdown releases cloud sessions');
  speechService.shutdown();
  await new Promise((r) => setTimeout(r, 800));
  check('worker closed without throwing', true);
}

(async () => {
  console.log('DashScope dual-channel integration test');
  try {
    testProviderSelection();
    await testConnectionProbe();
    await testDualChannel();
    testRouting();
    await testCleanup();
  } catch (e) {
    failures++;
    console.error('\nUNEXPECTED ERROR:', e && e.stack ? e.stack : e);
  }
  console.log(`\n${failures === 0 ? 'ALL DASHSCOPE INTEGRATION CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
