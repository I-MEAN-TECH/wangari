/**
 * tokenize-hex — replace hardcoded hex colors with theme token classes.
 *
 * Why: the @theme block in src/app/globals.css IS the palette. Components
 * that spell #166534 by hand drift from the theme the moment the theme
 * changes (ui-ux-pro-max rule 6: "Semantic color tokens — anti-pattern:
 * raw hex in components").
 *
 * Two mappings:
 *   1. exact  — hex equals a token value → that token's utility class
 *   2. #94A3B8 → wangari-subtle. That value was deliberately retired from
 *      the theme (2.56:1 contrast on white); the token comment documents
 *      the migration. Stragglers get the corrected value, not a new token.
 *
 * Inline `style={{ ... }}` values become var(--color-...) references.
 * SVG presentation attributes and standalone print-HTML templates are
 * LEFT ALONE: var() does not resolve there.
 *
 * Run:  node scripts/tokenize-hex.mjs          (report)
 *       node scripts/tokenize-hex.mjs --apply  (write)
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// ── token map ───────────────────────────────────────────────────────────────
const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const TOKENS = new Map(); // HEX_UPPER -> token name (e.g. wangari-green-800)
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  const [, name, hex] = m;
  const key = hex.toUpperCase();
  // Prefer the first definition; wangari-* before tone-*/badge-* on ties.
  const existing = TOKENS.get(key);
  if (!existing || (existing.startsWith("wangari-") === false && name.startsWith("wangari-"))) {
    TOKENS.set(key, name);
  }
}
// Documented migrations (see comments in globals.css):
//   #94A3B8  — retired value (2.56:1 on white); text uses get wangari-subtle.
//   #E6F4EA  — light green wash that duplicated tone-good-bg by eye.
//   #FAFAF7  — document-reader sheet, now wangari-paper.
const RETIRED = new Map([
  ["#94A3B8", "wangari-subtle"],
  ["#E6F4EA", "tone-good-bg"],
  ["#FAFAF7", "wangari-paper"],
]);
// Class-only: #FFFFFF becomes the built-in white utilities (bg-white etc.),
// never var(--color-white) in style blocks.
const CLASS_ONLY = new Map([["#FFFFFF", "white"]]);
// Where var() cannot go (SVG attrs, print-HTML templates) but the value was
// still the retired #94A3B8 on TEXT — swap the literal to the corrected one.
// Series/fill arrays keep the old value: there it encodes data, not copy.
const TEXT_LITERAL = [
  [/fill: "#94A3B8"/g, 'fill: "#5F6E85"'],
  [/color: ?#94A3B8/gi, "color:#5F6E85"],
];

// ── file walk ───────────────────────────────────────────────────────────────
function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(p)) acc.push(p);
  }
  return acc;
}

const CLASS_RE = /([a-zA-Z][\w-]*-)\[(#[0-9a-fA-F]{6})\]/g;
// Only inside explicit style={{ ... }} JSX blocks: SVG presentation
// attributes (Recharts stroke/fill, tick configs) cannot resolve var(),
// so hex there is config, not styling.
const STYLE_BLOCK = /(style=\{\{)([\s\S]*?)(\}\})/g;
const STYLE_HEX = /#[0-9a-fA-F]{6}/g;

let changedFiles = 0, classReplaced = 0, styleReplaced = 0;
const residual = new Map(); // hex -> count (anything left)
const perFile = [];

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  let out = src;

  out = out.replace(CLASS_RE, (m, prefix, hex) => {
    const token =
      CLASS_ONLY.get(hex.toUpperCase()) ??
      RETIRED.get(hex.toUpperCase()) ??
      TOKENS.get(hex.toUpperCase());
    if (!token) return m;
    classReplaced++;
    return prefix + token;
  });

  out = out.replace(STYLE_BLOCK, (m, open, body, close) => {
    const replaced = body.replace(STYLE_HEX, (h) => {
      const token = TOKENS.get(h.toUpperCase()) ?? RETIRED.get(h.toUpperCase());
      if (!token) return h;
      styleReplaced++;
      return "var(--color-" + token + ")";
    });
    return open + replaced + close;
  });

  for (const [re, to] of TEXT_LITERAL) {
    out = out.replace(re, () => { styleReplaced++; return to; });
  }

  if (out !== src) {
    changedFiles++;
    perFile.push(path.relative(ROOT, file));
    if (APPLY) fs.writeFileSync(file, out);
  }
  // residual scan on the (possibly written) result
  const left = out.match(/#[0-9a-fA-F]{6}\b/g) || [];
  for (const h of left) residual.set(h.toUpperCase(), (residual.get(h.toUpperCase()) || 0) + 1);
}

console.log(`${APPLY ? "APPLIED" : "DRY"}  files changed: ${changedFiles}`);
console.log(`  class tokens replaced: ${classReplaced}`);
console.log(`  style-attr hex -> var(): ${styleReplaced}`);
if (!APPLY) perFile.forEach((f) => console.log("    " + f));
const res = [...residual.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nresidual hex: ${res.reduce((a, b) => a + b[1], 0)} across ${res.length} values`);
res.slice(0, 30).forEach(([h, n]) => console.log(`  ${h} x${n}`));
