/**
 * Smoke test for the DashScope streaming ASR worker.
 * Run: node scripts/test-dashscope.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const DashScopeWorkerService = require('../src/services/dashscope-worker.service');

const API_KEY = process.env.DASHSCOPE_API_KEY;
if (!API_KEY) {
  console.error('DASHSCOPE_API_KEY is not set');
  process.exit(1);
}

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Read a 16 kHz mono 16-bit WAV into raw PCM. */
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

/** Render speech to a 16 kHz mono WAV via Windows SAPI. */
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
  const { spawnSync } = require('child_process');
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (!fs.existsSync(outFile)) {
    throw new Error(`synthesis failed: ${r.stderr || r.stdout}`);
  }
  return outFile;
}

/** Push PCM as 100 ms frames, paced like a live stream. */
async function streamChannel(worker, channel, pcm, { realtime = true } = {}) {
  const CHUNK = 3200; // 100 ms @ 16 kHz mono 16-bit
  for (let i = 0; i < pcm.length; i += CHUNK) {
    worker.sendAudio(channel, pcm.slice(i, i + CHUNK));
    if (realtime) await new Promise((r) => setTimeout(r, 100));
  }
}

async function testWorkerStartup() {
  console.log('\n[1] Worker startup and credential check');
  const worker = new DashScopeWorkerService();
  worker.configure({
    pythonPath: path.resolve('.venv-whisper/Scripts/python.exe'),
    apiKey: API_KEY
  });
  worker.on('error', (e) => console.log('    (worker error event:', e.message, ')'));
  try {
    const ok = await worker.ensureStarted();
    check('worker started', ok === true);
    check('worker reports configured', worker.isConfigured() === true);

    const cred = await worker.verifyCredentials();
    check('credentials present', cred.hasKey === true);
    await worker.close();
  } catch (e) {
    check('worker started', false, e.message);
    try { await worker.close(); } catch (_) {}
  }
}

async function testSingleChannel() {
  console.log('\n[2] Single-channel streaming (Chinese with English terms)');
  const wav = path.join(os.tmpdir(), 'ds-worker-test.wav');
  const truth = '你能讲一下怎么设计一个限流器吗？我想比较一下token bucket和sliding window这两种算法，另外如果Redis挂了会怎么样？';
  synthesize(truth, wav);

  const worker = new DashScopeWorkerService();
  worker.configure({
    pythonPath: path.resolve('.venv-whisper/Scripts/python.exe'),
    apiKey: API_KEY
  });

  const partials = [];
  const finals = [];
  worker.on('partial', (ch, text) => { if (ch === 'mic') partials.push(text); });
  worker.on('final', (ch, text) => { if (ch === 'mic') finals.push(text); });
  worker.on('error', () => {});

  try {
    await worker.startChannel('mic');
    await streamChannel(worker, 'mic', wavToPcm(wav));
    await new Promise((r) => setTimeout(r, 2500));
    await worker.stopChannel('mic');

    check('received partials', partials.length > 0, `${partials.length} partials`);
    check('received a final sentence', finals.length > 0, `${finals.length} finals`);
    const text = finals.join('');
    check('final text non-empty', text.length > 0, JSON.stringify(text.slice(0, 80)));
    check('Chinese recognised', /限流器|设计/.test(text), text.slice(0, 60));
    check('English term "token bucket" survived', /token\s*bucket/i.test(text), text.slice(0, 120));
    check('English term "sliding window" survived', /sliding\s*window/i.test(text), text.slice(0, 120));
    check('proper noun "Redis" survived', /redis/i.test(text), text.slice(0, 120));
    await worker.close();
  } catch (e) {
    check('single channel run', false, e.message);
    try { await worker.close(); } catch (_) {}
  }
}

async function testTwoChannelsConcurrently() {
  console.log('\n[3] Two channels concurrently (interviewer + me)');
  const wavInterviewer = path.join(os.tmpdir(), 'ds-ch-interviewer.wav');
  const wavMe = path.join(os.tmpdir(), 'ds-ch-me.wav');
  synthesize('请你解释一下快速排序的最坏时间复杂度是多少', wavInterviewer);
  synthesize('好的我先想一下这个问题的思路', wavMe);

  const worker = new DashScopeWorkerService();
  worker.configure({
    pythonPath: path.resolve('.venv-whisper/Scripts/python.exe'),
    apiKey: API_KEY
  });

  const byChannel = { mic: [], system: [] };
  worker.on('final', (ch, text) => { if (byChannel[ch]) byChannel[ch].push(text); });
  worker.on('error', () => {});

  try {
    await worker.startChannel('system');
    await worker.startChannel('mic');

    const pcmA = wavToPcm(wavInterviewer);
    const pcmB = wavToPcm(wavMe);
    await Promise.all([
      streamChannel(worker, 'system', pcmA),
      streamChannel(worker, 'mic', pcmB)
    ]);

    await new Promise((r) => setTimeout(r, 2500));
    await worker.stopChannel('system');
    await worker.stopChannel('mic');

    const interviewText = byChannel.system.join('');
    const meText = byChannel.mic.join('');
    check('system channel produced text', interviewText.length > 0, JSON.stringify(interviewText.slice(0, 60)));
    check('mic channel produced text', meText.length > 0, JSON.stringify(meText.slice(0, 60)));
    // The decisive check: the channels must not have swapped or merged.
    check('system got the sorting question', /快速排序|时间复杂度/.test(interviewText), interviewText.slice(0, 60));
    check('mic got the thinking remark', /想一下|思路|好的/.test(meText), meText.slice(0, 60));
    check('channels did not cross-contaminate',
      !/快速排序/.test(meText) && !/想一下/.test(interviewText));
    await worker.close();
  } catch (e) {
    check('two channel run', false, e.message);
    try { await worker.close(); } catch (_) {}
  }
}

async function testBadKey() {
  console.log('\n[4] Bad API key fails clearly');
  const worker = new DashScopeWorkerService();
  worker.configure({
    pythonPath: path.resolve('.venv-whisper/Scripts/python.exe'),
    apiKey: 'sk-invalid-key-for-testing'
  });
  const errors = [];
  worker.on('error', (e) => errors.push(e.message));
  try {
    await worker.startChannel('mic');
    const wav = path.join(os.tmpdir(), 'ds-badkey.wav');
    if (!fs.existsSync(wav)) synthesize('测试一下', wav);
    await streamChannel(worker, 'mic', wavToPcm(wav), { realtime: false });
    await new Promise((r) => setTimeout(r, 2500));
    check('bad key surfaced an error', errors.length > 0,
      errors.length ? errors[0].slice(0, 100) : 'no error reported');
    await worker.close();
  } catch (e) {
    check('bad key surfaced an error', true, `rejected at start: ${e.message.slice(0, 80)}`);
    try { await worker.close(); } catch (_) {}
  }
}

(async () => {
  console.log('DashScope worker smoke test');
  try {
    await testWorkerStartup();
    await testSingleChannel();
    await testTwoChannelsConcurrently();
    await testBadKey();
  } catch (e) {
    failures++;
    console.error('\nUNEXPECTED ERROR:', e && e.stack ? e.stack : e);
  }
  console.log(`\n${failures === 0 ? 'ALL DASHSCOPE CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
