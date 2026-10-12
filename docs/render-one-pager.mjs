import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC = 'C:/Users/lewis/Desktop/wangari/docs/aiae-2026-one-pager.html';
const TMP = 'C:/tmp/aiae-measure.html';
const OUT = 'C:/Users/lewis/Desktop/wangari/docs/aiae-2026-one-pager.pdf';

// 1) Measurement copy: same markup + a probe that reports .page height.
//    Probe runs before first paint so dump-dom captures it.
let html = fs.readFileSync(SRC, 'utf8');
const probe = `<script>
document.addEventListener('DOMContentLoaded', function () {
  var out = [];
  function add(label, el) { if (el) out.push(label + '=' + el.getBoundingClientRect().height.toFixed(1)); }
  add('HEADER', document.querySelector('header'));
  add('BAR', document.querySelector('.brandbar'));
  document.querySelectorAll('section').forEach(function (s, i) {
    var h2 = s.querySelector('h2');
    add('SEC' + i + '[' + (h2 ? h2.textContent.trim().slice(0, 18) : '?') + ']', s);
  });
  add('TWO', document.querySelector('.two'));
  add('GRID', document.querySelector('.grid'));
  add('FOOTER', document.querySelector('footer'));
  add('PAGE', document.querySelector('.page'));
  out.push('DOC=' + document.documentElement.scrollHeight);
  out.push('PRINTMQ=' + window.matchMedia('print').matches);
  out.push('BODYFS=' + getComputedStyle(document.body).fontSize);
  var d = document.createElement('div');
  d.id = 'PROBE_RESULT';
  d.textContent = 'PROBE=' + out.join(' | ');
  document.body.appendChild(d);
});
</script></body>`;
html = html.replace('</body>', probe);
fs.writeFileSync(TMP, html);

// 2) Print to PDF
execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${OUT}`,
  `file:///${SRC}`,
], { stdio: 'ignore', timeout: 90000 });
console.log('pdf bytes:', fs.statSync(OUT).size);

// 3) Probe the height. --emulated-media=print gives the TRUE print layout.
const dom = execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--emulated-media=print',
  '--virtual-time-budget=4000', '--dump-dom',
  `file:///${TMP}`,
], { encoding: 'utf8', timeout: 90000 });
const m = dom.match(/id="PROBE_RESULT"[^>]*>([^<]*)</);
if (m) m[1].replace(/^PROBE=/, '').split(' | ').forEach((x) => console.log('  ' + x));
else console.log('PROBE NOT FOUND');

// 4) Page count from the PDF
const pdf = fs.readFileSync(OUT, 'latin1');
const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
const count = (pdf.match(/\/Count\s+(\d+)/g) || []).join(',');
const kids = (pdf.match(/\/Kids\s*\[[^\]]*\]/g) || []).join(' ');
console.log('PDF /Type /Page occurrences:', pages);
console.log('PDF /Count:', count);
console.log('PDF /Kids:', kids);
console.log('printable A4 height at 11mm margins (px):', ((297 - 22) / 25.4 * 96).toFixed(1));
