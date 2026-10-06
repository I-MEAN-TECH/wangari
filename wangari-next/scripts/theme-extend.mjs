/**
 * theme-extend — the last step of "no hardcoded UI; follow the theme".
 *
 * tokenize-hex handled raw [#hex]; tokenize-palette handled default-palette
 * classes whose value already equals a token. What remains (1,868 classes,
 * 93 variants: emerald-*, the gray ramp, stone, red-500/600, amber-600…)
 * has no token at all. Two moves close it:
 *
 *  1. MIRROR: every value still in use gets an exact-value scale token
 *     (wangari-gray-400 = #9CA3AF, wangari-stone-200 = #E7E5E4…), following
 *     the wangari-green-* precedent. Value-identical: pixels cannot move.
 *  2. UNIFY: emerald-* maps onto wangari-green-*, step for step. The system
 *     has one green (the brand scale in @theme) — a second green family is
 *     exactly the hardcoded-UI problem this closes. This IS a visible hue
 *     shift (emerald #059669 -> green #16A34A family) and is the single
 *     deliberate visual change in this sweep.
 *
 * After editing globals.css it regenerates src/lib/theme-palette.ts (the JS
 * mirror must equal @theme or theme-palette.test.ts fails) and swaps the
 * classes. Re-run tokenize-palette.mjs afterwards for value-equality picks.
 *
 * Run:  node scripts/theme-extend.mjs          (report)
 *       node scripts/theme-extend.mjs --apply  (write)
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CSS_PATH = path.join(ROOT, "app/globals.css");
const MIRROR_PATH = path.join(ROOT, "lib/theme-palette.ts");

// ── default palette (families used in this repo) ────────────────────────────
const PALETTE = {};
const fam = (name, steps) => Object.entries(steps).forEach(([s, hex]) => (PALETTE[`${name}-${s}`] = hex));
fam("gray",  {50:"#F9FAFB",100:"#F3F4F6",200:"#E5E7EB",300:"#D1D5DB",400:"#9CA3AF",500:"#6B7280",600:"#4B5563",700:"#374151",800:"#1F2937",900:"#111827"});
fam("slate", {50:"#F8FAFC",100:"#F1F5F9",200:"#E2E8F0",300:"#CBD5E1",400:"#94A3B8",500:"#64748B",600:"#475569",700:"#334155",800:"#1E293B",900:"#0F172A"});
fam("stone", {50:"#FAFAF9",100:"#F5F5F4",200:"#E7E5E4",300:"#D6D3D1",400:"#A8A29E",500:"#78716C",600:"#57534E",700:"#44403C",800:"#292524",900:"#1C1917"});
fam("zinc",  {50:"#FAFAFA",100:"#F4F4F5",200:"#E4E4E7",300:"#D4D4D8",400:"#A1A1AA",500:"#71717A",600:"#52525B",700:"#3F3F46",800:"#27272A",900:"#18181B"});
fam("red",   {50:"#FEF2F2",100:"#FEE2E2",200:"#FECACA",300:"#FCA5A5",400:"#F87171",500:"#EF4444",600:"#DC2626",700:"#B91C1C",800:"#991B1B",900:"#7F1D1D"});
fam("orange",{50:"#FFF7ED",100:"#FFEDD5",200:"#FED7AA",300:"#FDBA74",400:"#FB923C",500:"#F97316",600:"#EA580C",700:"#C2410C",800:"#9A3412",900:"#7C2D12"});
fam("amber", {50:"#FFFBEB",100:"#FEF3C7",200:"#FDE68A",300:"#FCD34D",400:"#FBBF24",500:"#F59E0B",600:"#D97706",700:"#92400E",800:"#78350F",900:"#713F12"});
fam("yellow",{50:"#FEFCE8",100:"#FEF9C3",200:"#FEF08A",300:"#FDE047",400:"#FACC15",500:"#EAB308",600:"#CA8A04",700:"#A16207",800:"#854D0E",900:"#713F12"});
fam("lime",  {50:"#F7FEE7",100:"#ECFCCB",200:"#D9F99D",300:"#BEF264",400:"#A3E635",500:"#84CC16",600:"#65A30D",700:"#4D7C0F",800:"#3F6212",900:"#365314"});
fam("green", {50:"#F0FDF4",100:"#DCFCE7",200:"#BBF7D0",300:"#86EFAC",400:"#4ADE80",500:"#22C55E",600:"#16A34A",700:"#15803D",800:"#166534",900:"#14532D",950:"#052E16"});
fam("emerald",{50:"#ECFDF5",100:"#D1FAE5",200:"#A7F3D0",300:"#6EE7B7",400:"#34D399",500:"#10B981",600:"#059669",700:"#047857",800:"#065F46",900:"#064E3B"});
fam("teal",  {50:"#F0FDFA",100:"#CCFBF1",200:"#99F6E4",300:"#5EEAD4",400:"#2DD4BF",500:"#14B8A6",600:"#0D9488",700:"#0F766E",800:"#115E59",900:"#134E4A"});
fam("cyan",  {50:"#ECFEFF",100:"#CFFAFE",200:"#A5F3FC",300:"#67E8F9",400:"#22D3EE",500:"#06B6D4",600:"#0891B2",700:"#0E7490",800:"#155E75",900:"#164E63"});
fam("sky",   {50:"#F0F9FF",100:"#E0F2FE",200:"#BAE6FD",300:"#7DD3FC",400:"#38BDF8",500:"#0EA5E9",600:"#0284C7",700:"#0369A1",800:"#075985",900:"#0C4A6E"});
fam("blue",  {50:"#EFF6FF",100:"#DBEAFE",200:"#BFDBFE",300:"#93C5FD",400:"#60A5FA",500:"#3B82F6",600:"#2563EB",700:"#1D4ED8",800:"#1E40AF",900:"#1E3A8A"});
fam("indigo",{50:"#EEF2FF",100:"#E0E7FF",200:"#C7D2FE",300:"#A5B4FC",400:"#818CF8",500:"#6366F1",600:"#4F46E5",700:"#4338CA",800:"#3730A3",900:"#312E81"});
fam("violet",{50:"#F5F3FF",100:"#EDE9FE",200:"#DDD6FE",300:"#C4B5FD",400:"#A78BFA",500:"#8B5CF6",600:"#7C3AED",700:"#6D28D9",800:"#5B21B6",900:"#4C1D95"});
fam("purple",{50:"#FAF5FF",100:"#F3E8FF",200:"#E9D5FF",300:"#D8B4FE",400:"#C084FC",500:"#A855F7",600:"#9333EA",700:"#7E22CE",800:"#6B21A8",900:"#581C87"});
fam("pink",  {50:"#FDF2F8",100:"#FCE7F3",200:"#FBCFE8",300:"#F9A8D4",400:"#F472B6",500:"#EC4899",600:"#DB2777",700:"#BE185D",800:"#9D174D",900:"#831843"});
fam("rose",  {50:"#FFF1F2",100:"#FFE4E6",200:"#FECDD3",300:"#FDA4AF",400:"#FB7185",500:"#F43F5E",600:"#E11D48",700:"#BE123C",800:"#9F1239",900:"#881337"});

const UNIFY = new Map([["emerald", "wangari-green"]]); // family -> token family

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(p)) acc.push(p);
  }
  return acc;
}

const FAMILIES = [...new Set(Object.keys(PALETTE).map((k) => k.split("-")[0]))];
const CLASS_RE = new RegExp(
  "((?:[\\w-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|divide|decoration|placeholder|outline|accent|caret)-)" +
    "((?:" + FAMILIES.join("|") + ")-\\d{2,3})\\b",
  "g"
);

// What is still using default-palette classes right now?
const usage = new Map(); // "emerald-500" -> count
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(CLASS_RE)) {
    usage.set(m[2], (usage.get(m[2]) || 0) + 1);
  }
}

const css = fs.readFileSync(CSS_PATH, "utf8");
const haveToken = new Set([...css.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]));
// value -> token (first wins, wangari-* preferred) for exact-equality picks
const valueToToken = new Map();
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  const key = m[2].toUpperCase();
  const prev = valueToToken.get(key);
  if (!prev || (prev.startsWith("wangari-") === false && m[1].startsWith("wangari-"))) valueToToken.set(key, m[1]);
}

// ── plan ────────────────────────────────────────────────────────────────────
const newTokens = new Map(); // tokenName -> hex   (scale mirrors to add)
const swaps = new Map();     // "gray-400" -> "wangari-gray-400" (or wangari-green-N)
let unified = 0, mirrored = 0, valueExact = 0, untouched = 0;

for (const [cls, count] of usage) {
  const famName = cls.split("-")[0];
  // 1. unify families first (emerald -> wangari-green). If the target step
  //    does not exist yet, mirror the TARGET family's value, never emerald's.
  if (UNIFY.has(famName)) {
    const target = `${UNIFY.get(famName)}-${cls.split("-")[1]}`;       // wangari-green-950
    const raw = `${famName === UNIFY.get(famName).replace("wangari-", "") ? famName : UNIFY.get(famName).replace("wangari-", "")}-${cls.split("-")[1]}`; // green-950
    if (haveToken.has(target)) { swaps.set(cls, target); unified += count; continue; }
    const targetHex = PALETTE[raw];
    if (targetHex) {
      newTokens.set(target, targetHex.toUpperCase());
      swaps.set(cls, target);
      unified += count;
      continue;
    }
    throw new Error(`unified class ${cls} has no ${raw} value — decide the mapping`);
  }
  const hex = (PALETTE[cls] || "").toUpperCase();
  if (!hex) throw new Error(`no palette value for used class: ${cls} — add it to the table`);
  // 2. exact value already in theme -> existing token (tokenize-palette's job,
  //    but resolve here so the plan is complete)
  const exact = valueToToken.get(hex);
  if (exact) { swaps.set(cls, exact); valueExact += count; continue; }
  // 3. mirror it as wangari-<family>-<step>
  const token = `wangari-${cls}`;
  newTokens.set(token, hex);
  swaps.set(cls, token);
  mirrored += count;
}

console.log(`${APPLY ? "APPLIED" : "DRY"}  usage found: ${[...usage.values()].reduce((a, b) => a + b, 0)} classes, ${usage.size} variants`);
console.log(`  unified onto wangari-green: ${unified}`);
console.log(`  exact existing token:       ${valueExact}`);
console.log(`  mirrored as new tokens:     ${mirrored} (${newTokens.size} tokens)`);
console.log(`  untouched:                  ${untouched}`);
console.log("\nnew @theme tokens:");
[...newTokens].sort().forEach(([t, h]) => console.log(`  --color-${t}: ${h}`));
console.log("\nswaps:");
[...swaps].sort().forEach(([from, to]) => console.log(`  ${from} -> ${to}`));

if (!APPLY) process.exit(0);

// ── 1. insert mirror tokens into @theme (after the green scale) ─────────────
if (newTokens.size > 0) {
  const anchor = "  --color-wangari-green-900: #14532D;\n";
  if (!css.includes(anchor)) throw new Error("anchor line not found in globals.css");
  const byFam = new Map();
  for (const [t, h] of [...newTokens].sort()) {
    const f = t.split("-")[1]; // family after wangari-
    if (!byFam.has(f)) byFam.set(f, []);
    byFam.get(f).push(`  --color-${t}: ${h};`);
  }
  let block = "";
  for (const [f, lines] of byFam) {
    block += `\n  /* Mirrored ${f} scale — values the app actually uses, named as theme\n     tokens so no component spells a default-palette class again. */`;
    block += "\n  " + lines.join("\n  ") + "\n";
  }
  fs.writeFileSync(CSS_PATH, css.replace(anchor, anchor + block));
}

// ── 2. swap classes everywhere ──────────────────────────────────────────────
let swappedCount = 0, filesTouched = 0;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  const out = src.replace(CLASS_RE, (m, prefix, cls) => {
    const to = swaps.get(cls);
    if (!to || to === cls) return m;
    swappedCount++;
    return prefix + to;
  });
  if (out !== src) { filesTouched++; fs.writeFileSync(file, out); }
}
console.log(`\nswapped ${swappedCount} classes in ${filesTouched} files`);

// ── 3. regenerate the JS mirror ─────────────────────────────────────────────
const css2 = fs.readFileSync(CSS_PATH, "utf8");
const rows = [];
for (const m of css2.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) rows.push([m[1], m[2].toUpperCase()]);
const body = rows.map(([n, v]) => `  "${n}": "${v}",`).join("\n");
const mirror = `/**
 * theme-palette — the JavaScript mirror of @theme in src/app/globals.css.
 *
 * WHY THIS EXISTS: email HTML, print documents and SVG/Recharts attributes
 * cannot resolve CSS variables (var() is invalid in presentation attributes
 * and unsupported by mail clients). Those contexts must inline a literal —
 * so the literal comes from HERE, one place, keyed exactly like the CSS.
 *
 * The mirror is enforced: theme-palette.test.ts fails the build if this file
 * and @theme ever disagree. Never add a color to a component that is not in
 * this palette (add it to @theme first — ui-ux-pro-max rule 6: semantic color
 * tokens, no raw hex in components).
 */
export const THEME = {
${body}
} as const;

export type ThemeToken = keyof typeof THEME;

/** Literal value for a token, for contexts where var() cannot go. */
export function themeColor(token: ThemeToken): string {
  return THEME[token];
}
`;
fs.writeFileSync(MIRROR_PATH, mirror);
console.log(`theme-palette.ts regenerated: ${rows.length} tokens`);
