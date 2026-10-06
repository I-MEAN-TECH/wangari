/**
 * tokenize-palette — named Tailwind default-palette classes become theme
 * token classes, ONLY when the values are byte-identical.
 *
 * tokenize-hex.mjs handled raw `[#hex]` classes; this handles the larger
 * remainder, e.g. `border-gray-200` (#E5E7EB == --color-wangari-border) or
 * `bg-red-50` (#FEF2F2 == --color-tone-bad-bg). Same value, so pixels do
 * not move — provably.
 *
 * Values with no exact theme counterpart (emerald-*, gray-400, gray-100…)
 * are left alone on purpose: mapping them would CHANGE what farmers see
 * (emerald is a different hue from the wangari green scale) and that is a
 * design decision, not a codemod.
 *
 * One documented exception: slate-400 (#94A3B8) maps to wangari-subtle —
 * the theme retired that value for contrast (see globals.css).
 *
 * Run:  node scripts/tokenize-palette.mjs          (report)
 *       node scripts/tokenize-palette.mjs --apply  (write)
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Tailwind's default palette (the families actually used in this repo).
const PALETTE = {};
const family = (name, steps) => Object.assign(PALETTE, Object.fromEntries(
  Object.entries(steps).map(([step, hex]) => [`${name}-${step}`, hex])
));
family("gray",  {50:"#F9FAFB",100:"#F3F4F6",200:"#E5E7EB",300:"#D1D5DB",400:"#9CA3AF",500:"#6B7280",600:"#4B5563",700:"#374151",800:"#1F2937",900:"#111827"});
family("slate", {50:"#F8FAFC",100:"#F1F5F9",200:"#E2E8F0",300:"#CBD5E1",400:"#94A3B8",500:"#64748B",600:"#475569",700:"#334155",800:"#1E293B",900:"#0F172A"});
family("zinc",  {50:"#FAFAFA",100:"#F4F4F5",200:"#E4E4E7",300:"#D4D4D8",400:"#A1A1AA",500:"#71717A",600:"#52525B",700:"#3F3F46",800:"#27272A",900:"#18181B"});
family("stone", {50:"#FAFAF9",100:"#F5F5F4",200:"#E7E5E4",300:"#D6D3D1",400:"#A8A29E",500:"#78716C",600:"#57534E",700:"#44403C",800:"#292524",900:"#1C1917"});
family("red",   {50:"#FEF2F2",100:"#FEE2E2",200:"#FECACA",300:"#FCA5A5",400:"#F87171",500:"#EF4444",600:"#DC2626",700:"#B91C1C",800:"#991B1B",900:"#7F1D1D"});
family("orange",{50:"#FFF7ED",100:"#FFEDD5",200:"#FED7AA",300:"#FDBA74",400:"#FB923C",500:"#F97316",600:"#EA580C",700:"#C2410C",800:"#9A3412",900:"#7C2D12"});
family("amber", {50:"#FFFBEB",100:"#FEF3C7",200:"#FDE68A",300:"#FCD34D",400:"#FBBF24",500:"#F59E0B",600:"#D97706",700:"#92400E",800:"#78350F",900:"#713F12"});
family("yellow",{50:"#FEFCE8",100:"#FEF9C3",200:"#FEF08A",300:"#FDE047",400:"#FACC15",500:"#EAB308",600:"#CA8A04",700:"#A16207",800:"#854D0E",900:"#713F12"});
family("green", {50:"#F0FDF4",100:"#DCFCE7",200:"#BBF7D0",300:"#86EFAC",400:"#4ADE80",500:"#22C55E",600:"#16A34A",700:"#15803D",800:"#166534",900:"#14532D"});
family("emerald",{50:"#ECFDF5",100:"#D1FAE5",200:"#A7F3D0",300:"#6EE7B7",400:"#34D399",500:"#10B981",600:"#059669",700:"#047857",800:"#065F46",900:"#064E3B"});
family("teal",  {50:"#F0FDFA",100:"#CCFBF1",200:"#99F6E4",300:"#5EEAD4",400:"#2DD4BF",500:"#14B8A6",600:"#0D9488",700:"#0F766E",800:"#115E59",900:"#134E4A"});
family("sky",   {50:"#F0F9FF",100:"#E0F2FE",200:"#BAE6FD",300:"#7DD3FC",400:"#38BDF8",500:"#0EA5E9",600:"#0284C7",700:"#0369A1",800:"#075985",900:"#0C4A6E"});
family("blue",  {50:"#EFF6FF",100:"#DBEAFE",200:"#BFDBFE",300:"#93C5FD",400:"#60A5FA",500:"#3B82F6",600:"#2563EB",700:"#1D4ED8",800:"#1E40AF",900:"#1E3A8A"});
family("indigo",{50:"#EEF2FF",100:"#E0E7FF",200:"#C7D2FE",300:"#A5B4FC",400:"#818CF8",500:"#6366F1",600:"#4F46E5",700:"#4338CA",800:"#3730A3",900:"#312E81"});
family("violet",{50:"#F5F3FF",100:"#EDE9FE",200:"#DDD6FE",300:"#C4B5FD",400:"#A78BFA",500:"#8B5CF6",600:"#7C3AED",700:"#6D28D9",800:"#5B21B6",900:"#4C1D95"});
family("purple",{50:"#FAF5FF",100:"#F3E8FF",200:"#E9D5FF",300:"#D8B4FE",400:"#C084FC",500:"#A855F7",600:"#9333EA",700:"#7E22CE",800:"#6B21A8",900:"#581C87"});
family("pink",  {50:"#FDF2F8",100:"#FCE7F3",200:"#FBCFE8",300:"#F9A8D4",400:"#F472B6",500:"#EC4899",600:"#DB2777",700:"#BE185D",800:"#9D174D",900:"#831843"});
family("rose",  {50:"#FFF1F2",100:"#FFE4E6",200:"#FECDD3",300:"#FDA4AF",400:"#FB7185",500:"#F43F5E",600:"#E11D48",700:"#BE123C",800:"#9F1239",900:"#881337"});

const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const valueToToken = new Map(); // HEX_UPPER -> token name
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  const [, name, hex] = m;
  const key = hex.toUpperCase();
  const existing = valueToToken.get(key);
  if (!existing || (existing.startsWith("wangari-") === false && name.startsWith("wangari-"))) {
    valueToToken.set(key, name);
  }
}
// Documented retirement: slate-400 failed contrast; text uses subtle.
const RETIRED = new Map([["SLATE-400", "wangari-subtle"]]);

const PALETTE_NAMES = Object.keys(PALETTE).map((k) => k.split("-")[0]);
const CLASS_RE = new RegExp(
  "((?:[\\w-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|divide|decoration|placeholder|outline|accent|caret)-)" +
    "((?:" + [...new Set(PALETTE_NAMES)].join("|") + ")-\\d{2,3})\\b",
  "g"
);

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(p)) acc.push(p);
  }
  return acc;
}

let swapped = 0, filesChanged = 0;
const bySwap = new Map();
const left = new Map();

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  const out = src.replace(CLASS_RE, (m, prefix, name) => {
    const upper = name.toUpperCase();
    const token =
      RETIRED.get(upper) ??
      valueToToken.get((PALETTE[name] ?? "").toUpperCase());
    if (!token) {
      left.set(name, (left.get(name) || 0) + 1);
      return m;
    }
    swapped++;
    bySwap.set(`${name} -> ${token}`, (bySwap.get(`${name} -> ${token}`) || 0) + 1);
    return prefix + token;
  });
  if (out !== src) {
    filesChanged++;
    if (APPLY) fs.writeFileSync(file, out);
  }
}

console.log(`${APPLY ? "APPLIED" : "DRY"}  swapped: ${swapped} in ${filesChanged} files`);
console.log("\nmappings:");
[...bySwap.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}\t${k}`));
const leftTotal = [...left.values()].reduce((a, b) => a + b, 0);
console.log(`\nleft alone (no exact theme value): ${leftTotal} across ${left.size} classes`);
[...left.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${v}\t${k}`));
