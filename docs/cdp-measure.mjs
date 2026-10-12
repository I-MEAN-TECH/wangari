import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const URL = process.argv[2] || 'file:///C:/Users/lewis/Desktop/wangari/docs/aiae-2026-one-pager.html';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/tmp/cdp-profile-' + Date.now(),
  '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method: path.startsWith('/json/new') ? 'PUT' : 'GET' });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools not up');
}

let ws, id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

try {
  const target = await getJson(`/json/new?${encodeURIComponent(URL)}`);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await send('Page.navigate', { url: URL });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true, returnByValue: true });
  await sleep(500);

  const expr = `(() => {
    const mm = window.matchMedia('print').matches;
    const page = document.querySelector('.page');
    const parts = [];
    document.querySelectorAll('header, section, .two, footer, .brandbar').forEach((el) => {
      const h2 = el.querySelector('h2');
      const label = (h2 ? h2.textContent.trim().slice(0, 20) : el.tagName.toLowerCase());
      parts.push(label + '=' + el.getBoundingClientRect().height.toFixed(1));
    });
    return {
      printMQ: mm,
      bodyFS: getComputedStyle(document.body).fontSize,
      pageH: page ? +page.getBoundingClientRect().height.toFixed(1) : null,
      docH: document.documentElement.scrollHeight,
      bodyH: document.body.scrollHeight,
      parts,
    };
  })()`;

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const v = r.result.value;
  console.log('matchMedia(print).matches:', v.printMQ);
  console.log('body font-size         :', v.bodyFS);
  console.log('.page height           :', v.pageH, 'px');
  console.log('documentElement scrollH:', v.docH, 'px');
  console.log('body scrollHeight      :', v.bodyH, 'px');
  console.log('printable A4 @11mm     : 1039.4 px');
  console.log('--- blocks ---');
  v.parts.forEach((p) => console.log('  ' + p));
} catch (e) {
  console.error('CDP ERROR:', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  process.exit(0);
}
