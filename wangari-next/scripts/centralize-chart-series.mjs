/**
 * centralize-chart-series — chart series palettes leave the components.
 *
 * Recharts writes SVG presentation attributes where var() cannot resolve,
 * so series colors must be JS literals — but they were literals inside seven
 * different page components, i.e. hardcoded data sprinkled through the UI.
 * They now live in src/lib/chart-series.ts, and every value that equals a
 * theme token is expressed as a THEME[...] reference, so the charts follow
 * the theme instead of retyping it. Non-theme values (data-series accents)
 * stay literal, with the reason in the module.
 *
 * Byte-identical: THEME[token] IS that hex, verified by theme-palette.test.
 *
 * Run:  node scripts/centralize-chart-series.mjs          (report)
 *       node scripts/centralize-chart-series.mjs --apply  (write)
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const MOVES = [
  { file: "app/(admin)/waadmin/analytics/page.tsx", name: "EVENT_COLORS", exp: "eventSeries" },
  { file: "app/(dashboard)/crops/page.tsx", name: "COLORS", exp: "cropsSeries" },
  { file: "app/(dashboard)/finances/page.tsx", name: "COLORS", exp: "financesSeries" },
  { file: "app/(dashboard)/inventory/page.tsx", name: "COLORS", exp: "inventorySeries" },
  { file: "app/(dashboard)/sales/page.tsx", name: "COLORS", exp: "salesSeries" },
  { file: "components/admin/charts.tsx", name: "PIE_COLORS", exp: "pieSeries" },
  { file: "components/dashboard/Charts.tsx", name: "FLOCK_COLORS", exp: "flockSeries" },
];

const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const valueToToken = new Map();
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  const key = m[2].toUpperCase();
  const prev = valueToToken.get(key);
  if (!prev || (prev.startsWith("wangari-") === false && m[1].startsWith("wangari-"))) valueToToken.set(key, m[1]);
}

const exports_ = [];
for (const move of MOVES) {
  const p = path.join(ROOT, move.file);
  const src = fs.readFileSync(p, "utf8");
  const re = new RegExp(`const ${move.name} = (\\[[^\\]]+\\]);`, "m");
  const m = src.match(re);
  if (!m) { console.error(`MISSING  ${move.file}: ${move.name}`); process.exit(1); }
  const hexes = m[1].match(/#[0-9a-fA-F]{6}/g) || [];
  const items = hexes.map((h) => {
    const token = valueToToken.get(h.toUpperCase());
    return token ? `THEME[${JSON.stringify(token)}]` : JSON.stringify(h);
  });
  exports_.push({ ...move, def: `export const ${move.exp} = [${items.join(", ")}];` });
  console.log(`${APPLY ? "moved" : "would move"}  ${move.exp} (${hexes.length} colors) <- ${move.file}`);
}

if (!APPLY) process.exit(0);

// write the module
const module_ = `/**
 * chart-series — the data-color palettes, in one place.
 *
 * Recharts renders series colors as SVG presentation attributes, where
 * var() is invalid — so these must be JS strings. They used to be literals
 * scattered across seven components (hardcoded data in the UI); now every
 * value that equals a theme token is a THEME[...] reference, so a theme
 * change reaches the charts too. Values with no token (sky/amber accents
 * used to separate chart series, and the retired #94A3B8 kept as a DATA
 * grey — it encodes a series, it is not text) stay literal on purpose.
 *
 * Regenerate: node scripts/centralize-chart-series.mjs
 */
import { THEME } from "./theme-palette";

${exports_.map((e) => e.def).join("\n\n")}
`;
fs.writeFileSync(path.join(ROOT, "lib/chart-series.ts"), module_);

// strip local consts + add imports
for (const move of MOVES) {
  const p = path.join(ROOT, move.file);
  let src = fs.readFileSync(p, "utf8");
  src = src.replace(new RegExp(`const ${move.name} = \\[[^\\]]+\\];\\n?`), "");
  const lines = src.split(/\r?\n/);
  let last = -1;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if (/^import\s.*;$/.test(lines[i]) || /^}\s*from\s.*;$/.test(lines[i])) last = i;
  }
  lines.splice(last + 1, 0, `import { ${move.exp} as ${move.name} } from "@/lib/chart-series";`);
  fs.writeFileSync(p, lines.join("\n"));
}
console.log(`\nchart-series.ts written; ${MOVES.length} components updated`);
