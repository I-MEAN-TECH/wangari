/**
 * Recompute the tallies in docs/mirofish-panel.md straight from the raw panel
 * output, so the document's numbers cannot drift from the evidence.
 * Exits non-zero if the doc and the data disagree.
 */
import { readFileSync } from "node:fs";

const panel = JSON.parse(
  readFileSync("tools/wangari-panel/panel_results.json", "utf8"),
).panel;

const answered = panel.filter((p) => p.response);
console.log(`panel: ${panel.length} personas, ${answered.length} answered`);

const ratings = [];
const best = new Map();
const improve = new Map();
const species = new Map();

function add(map, key) {
  if (!key) return;
  key.split(",").map((s) => s.trim()).filter(Boolean)
    .forEach((k) => map.set(k, (map.get(k) || 0) + 1));
}

for (const p of answered) {
  const text = p.response;
  // [^\S\r\n]* — horizontal space only. \s* would span the newline after an
  // empty field and swallow the next label, which is exactly what happened
  // when the investor left BEST blank.
  const r = text.match(/RATING:[^\S\r\n]*([1-5])/);
  if (r) ratings.push({ name: p.name, value: Number(r[1]) });
  add(best, text.match(/BEST:[^\S\r\n]*(.*)/)?.[1]);
  add(improve, text.match(/IMPROVE:[^\S\r\n]*(.*)/)?.[1]);
  add(species, text.match(/SPECIES:[^\S\r\n]*(.*)/)?.[1]);
}

const rank = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);
const values = ratings.map((r) => r.value).sort((a, b) => a - b);
const mean = values.reduce((a, b) => a + b, 0) / values.length;
const median = values[Math.floor(values.length / 2)];

console.log("\nratings:", ratings.map((r) => `${r.name.split(" ")[0]}=${r.value}`).join(" "));
console.log(`mean ${mean.toFixed(2)}  median ${median}  (n=${values.length})`);
console.log("\nBEST:    ", rank(best).map(([k, v]) => `${k} ${v}`).join(" | "));
console.log("IMPROVE: ", rank(improve).map(([k, v]) => `${k} ${v}`).join(" | "));
console.log("SPECIES: ", rank(species).map(([k, v]) => `${k} ${v}`).join(" | "));

// Cross-check the claims made in docs/mirofish-panel.md.
const doc = readFileSync("docs/mirofish-panel.md", "utf8");
const claims = [
  ["mean 2.57", mean.toFixed(2) === "2.57"],
  ["offline BEST = 3", best.get("inafanya_kazi_bila_internet") === 3],
  ["easy BEST = 5", best.get("ni_rahisi") === 5],
  ["records BEST = 5", best.get("kumbukumbu") === 5],
  ["internet IMPROVE = 6", improve.get("mtandao") === 6],
  ["missing feature IMPROVE = 5", improve.get("kipengele_hakipo") === 5],
  ["training IMPROVE = 3", improve.get("mafunzo") === 3],
  ["H3 threshold 3/7 = 43%", improve.get("mafunzo") / answered.length >= 1 / 3],
];

let bad = 0;
for (const [label, ok] of claims) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) bad++;
}
console.log(bad ? `\n${bad} claim(s) disagree with the data` : "\nall doc claims match the data");
process.exit(bad ? 1 : 0);