/**
 * Drive the running Electron app over the Chrome DevTools Protocol.
 *
 * Used for verification only — it connects to an app started with
 * --remote-debugging-port, screenshots each window and runs a real
 * end-to-end question through the renderer's IPC bridge.
 *
 * Usage: node scripts/cdp-verify.js [port]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.argv[2] || 9333);
const OUT_DIR = path.join(__dirname, '..', '.verify');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class Session {
  constructor(wsUrl, label) {
    this.wsUrl = wsUrl;
    this.label = label;
    this.id = 0;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, { maxPayload: 256 * 1024 * 1024 });
      this.ws.on('open', () => resolve(this));
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data); } catch (_) { return; }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg.result);
        }
      });
    });
  }

  send(method, params = {}, timeoutMs = 180000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, timeoutMs);
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (r.exceptionDetails) {
      throw new Error(`eval failed: ${r.exceptionDetails.text} ${JSON.stringify(r.exceptionDetails.exception || {})}`);
    }
    return r.result.value;
  }

  /**
   * Capture the window. Hidden Electron windows do not produce frames, so this
   * can legitimately time out — callers treat that as "no screenshot" rather
   * than a failure.
   */
  async screenshot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' }, 20000);
    const file = path.join(OUT_DIR, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  async tryScreenshot(name) {
    try {
      return await this.screenshot(name);
    } catch (e) {
      console.log(`  (screenshot "${name}" skipped: ${e.message})`);
      return null;
    }
  }

  close() {
    try { this.ws.close(); } catch (_) { /* ignore */ }
  }
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const pages = targets.filter(t => t.type === 'page');
  console.log('Targets:');
  pages.forEach(t => console.log(`  ${t.title} -> ${t.url.split('/').pop()}`));

  const byFile = (name) => pages.find(p => p.url.endsWith(name));
  const onboarding = byFile('onboarding.html');
  const settings = byFile('settings.html');
  const chat = byFile('chat.html');
  const main = byFile('index.html');
  const response = byFile('llm-response.html');

  // ── Onboarding window ──
  if (onboarding) {
    const s = await new Session(onboarding.webSocketDebuggerUrl, 'onboarding').connect();
    await s.send('Page.enable');
    await s.send('Runtime.enable');

    const heading = await s.evaluate(`document.querySelector('h1') ? document.querySelector('h1').textContent : '(none)'`);
    console.log(`\nOnboarding heading: ${JSON.stringify(heading)}`);

    // Walk to the API-key screen using the wizard's own navigation.
    const nav = await s.evaluate(`(async () => {
      const cta = document.getElementById('heroCtaBtn');
      if (cta) { cta.click(); await new Promise(r => setTimeout(r, 900)); }
      const screen = document.querySelector('.screen.active') || document.querySelector('.screen:not([hidden])');
      const h1 = document.querySelector('.screen.active h1') || document.querySelector('h1');
      return {
        activeScreen: screen ? (screen.dataset.screen || screen.className) : null,
        heading: h1 ? h1.textContent.trim() : null,
        hasKeyInput: !!document.getElementById('geminiKey'),
        placeholder: (document.getElementById('geminiKey') || {}).placeholder || null
      };
    })()`);
    console.log('After Get Started:', JSON.stringify(nav, null, 2));

    const shot1 = await s.tryScreenshot('01-onboarding-apikey');
    console.log(`screenshot: ${shot1}`);
    s.close();
  }

  // ── Settings window ──
  if (settings) {
    const s = await new Session(settings.webSocketDebuggerUrl, 'settings').connect();
    await s.send('Page.enable');
    await s.send('Runtime.enable');

    const info = await s.evaluate(`(() => {
      const titles = [...document.querySelectorAll('.settings-section-title')].map(e => e.textContent.trim());
      const keyInput = document.getElementById('geminiKey');
      const effort = document.getElementById('reasoningEffort');
      return {
        sectionTitles: titles,
        keyLabel: keyInput ? (document.querySelector('label[for="geminiKey"]') || {}).textContent : null,
        keyPlaceholder: keyInput ? keyInput.placeholder : null,
        keyValue: keyInput ? keyInput.value : null,
        effortExists: !!effort,
        effortValue: effort ? effort.value : null,
        effortOptions: effort ? [...effort.options].map(o => o.value) : []
      };
    })()`);
    console.log('\nSettings window:', JSON.stringify(info, null, 2));

    const shot2 = await s.tryScreenshot('02-settings');
    console.log(`screenshot: ${shot2}`);
    s.close();
  }

  // ── Live LLM round-trip through the real IPC bridge ──
  if (chat) {
    const s = await new Session(chat.webSocketDebuggerUrl, 'chat').connect();
    await s.send('Runtime.enable');

    const status = await s.evaluate(`(async () => {
      const st = await window.electronAPI.getLlmStatus();
      return { isInitialized: st.isInitialized, model: st.model, hasApiKey: st.hasApiKey, provider: st.provider };
    })()`);
    console.log('\nLLM status via renderer IPC:', JSON.stringify(status));

    const conn = await s.evaluate(`(async () => {
      const r = await window.electronAPI.testLlmConnection();
      return { success: r.success, model: r.model, latency: r.latency, response: r.response, error: r.error };
    })()`);
    console.log('Connection test via renderer IPC:', JSON.stringify(conn));
    s.close();
  }

  // ── Main overlay window ──
  if (main) {
    const s = await new Session(main.webSocketDebuggerUrl, 'main').connect();
    await s.send('Runtime.enable');
    const info = await s.evaluate(`(() => ({
      title: document.title,
      hasApi: typeof window.electronAPI === 'object',
      hasSendChat: typeof (window.electronAPI||{}).sendChatMessage === 'function',
      hasTakeScreenshot: typeof (window.electronAPI||{}).takeScreenshot === 'function'
    }))()`);
    console.log('\nMain overlay window:', JSON.stringify(info));

    // ── Live end-to-end: real screenshot -> DeepSeek vision -> streamed answer ──
    if (chat && response) {
      const chatS = await new Session(chat.webSocketDebuggerUrl, 'chat').connect();
      const respS = await new Session(response.webSocketDebuggerUrl, 'llm-response').connect();
      await chatS.send('Runtime.enable');
      await respS.send('Runtime.enable');

      await respS.evaluate(`(() => {
        window.__collector = { chunks: [], final: null, started: false };
        if (window.electronAPI && window.electronAPI.onTranscriptionLlmResponseChunk) {
          window.electronAPI.onTranscriptionLlmResponseChunk((_e, data) => {
            window.__collector.started = true;
            if (data && data.delta) window.__collector.chunks.push(data.delta);
          });
        }
        if (window.electronAPI && window.electronAPI.onTranscriptionLlmResponse) {
          window.electronAPI.onTranscriptionLlmResponse((_e, data) => {
            window.__collector.final = (data && (data.response || data.text)) || null;
          });
        }
        return true;
      })()`);

      console.log('\n[E2E] Triggering a real screen capture -> DeepSeek vision...');
      const shotResult = await s.evaluate(`(async () => {
        try {
          const r = await window.electronAPI.takeScreenshot();
          return { ok: true, result: r === undefined ? null : r };
        } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      })()`);
      console.log('[E2E] takeScreenshot returned:', JSON.stringify(shotResult));

      let collected = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        collected = await respS.evaluate(`(() => ({
          started: window.__collector.started,
          chunkCount: window.__collector.chunks.length,
          text: window.__collector.chunks.join(''),
          final: window.__collector.final
        }))()`);
        if (collected && collected.chunkCount > 0 && collected.text.length > 60) break;
      }
      console.log(`[E2E] streamed chunks: ${collected ? collected.chunkCount : 0}`);
      console.log(`[E2E] answer preview: ${JSON.stringify((collected && collected.text || '').slice(0, 400))}`);

      const shot = await respS.tryScreenshot('03-vision-response');
      if (shot) console.log(`[E2E] screenshot: ${shot}`);

      chatS.close();
      respS.close();
    }

    s.close();
  }

  console.log('\nCDP verification complete.');
  process.exit(0);
})().catch((e) => {
  console.error('CDP verify failed:', e && e.stack ? e.stack : e);
  process.exit(1);
});
