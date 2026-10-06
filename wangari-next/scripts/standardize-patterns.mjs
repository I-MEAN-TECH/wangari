/**
 * standardize-patterns — the copy-paste clusters become named constants.
 *
 * Why: the raw counts (357 buttons, 339 card shells) overstate the problem —
 * only 19 class strings actually repeat (8 buttons, 11 card shells, 66+
 * instances). Those are real duplication: changing a shell's padding today
 * means finding it in 7 files. They move to src/components/ui/patterns.ts,
 * referenced by name. Everything else is a unique composition and stays.
 *
 * Values are copied byte-for-byte: this is deduplication, not restyling.
 *
 * Run:  node scripts/standardize-patterns.mjs          (report)
 *       node scripts/standardize-patterns.mjs --apply  (write)
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** className value -> constant name (semantic, role-based). */
const NAME_MAP = {
  // ── card shells ───────────────────────────────────────────────────────
  "rounded-2xl border border-wangari-border p-3.5": "CARD_PANEL",
  "rounded-2xl border border-wangari-border p-4": "CARD_PANEL_P4",
  "rounded-2xl border border-wangari-border bg-white p-5": "CARD_PANEL_P5",
  "rounded-xl border border-wangari-border p-4": "CARD_PANEL_XL",
  "rounded-xl border border-wangari-border bg-wangari-cream/50 p-3.5": "CARD_PANEL_CREAM",
  "rounded-xl border border-wangari-border bg-white px-4 py-3 shadow-lg": "CARD_RAISED",
  "rounded-xl border border-dashed border-wangari-border px-3 py-4 text-center text-xs text-wangari-subtle":
    "CARD_WELL_DASHED",
  "flex items-center justify-between rounded-lg border border-wangari-border px-3 py-2 text-sm":
    "CARD_ROW_SM",
  "flex items-center gap-3 rounded-xl border border-wangari-border bg-white p-3.5 transition-colors hover:bg-gray-50":
    "CARD_ROW_ICON",
  "flex items-center justify-between p-3 rounded-xl border border-wangari-border hover:bg-wangari-cream transition-colors":
    "CARD_ROW_CREAM",
  "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700": "ALERT_DANGER_SM",
  // ── buttons ───────────────────────────────────────────────────────────
  "p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer": "BTN_TOOL",
  "px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-white border border-gray-200 transition-colors cursor-pointer":
    "BTN_CANCEL",
  "mt-4 px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 border border-gray-200 cursor-pointer":
    "BTN_CANCEL_BLOCK",
  "ml-auto text-wangari-subtle hover:text-wangari-muted cursor-pointer": "BTN_LINK_SM",
  "h-11 rounded-xl bg-wangari-green-800 px-4 text-sm font-semibold text-white shadow-md hover:bg-wangari-green-900 disabled:opacity-60":
    "BTN_PRIMARY_H11",
  "mt-2 flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-bold text-tone-bad-text shadow-sm":
    "BTN_REMOVE",
  "px-6 py-2 rounded-xl text-sm font-semibold bg-emerald-700 text-white hover:bg-emerald-800 shadow-md transition-all cursor-pointer disabled:opacity-50":
    "BTN_CTA_EMERALD",
  "p-2 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer": "BTN_GLASS",
};

const IMPORT_PATH = "@/components/ui/patterns";

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx$/.test(f) && !/\.test\./.test(p)) acc.push(p);
  }
  return acc;
}

const constantsDir = path.join(ROOT, "components/ui");
const constantsFile = path.join(constantsDir, "patterns.ts");
const reverse = Object.fromEntries(Object.entries(NAME_MAP).map(([k, v]) => [v, k]));

const report = [];
const importsByFile = new Map();
let total = 0;

for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  const names = new Set();
  for (const [str, name] of Object.entries(NAME_MAP)) {
    const variants = [
      [`className="${str}"`, `className={${name}}`],
      ["className={`" + str + "`}", `className={${name}}`],
    ];
    for (const [from, to] of variants) {
      const n = src.split(from).length - 1;
      if (n > 0) {
        src = src.split(from).join(to);
        names.add(name);
        total += n;
      }
    }
  }
  if (src !== orig) {
    importsByFile.set(file, [...names].sort());
    report.push(path.relative(ROOT, file));
    if (APPLY) {
      // Insert one import after the last COMPLETE top-of-file import — a
      // line that starts one only counts when its statement also ends on
      // that line, otherwise we splice into the middle of `import {`.
      const lines = src.split(/\r?\n/);
      let lastImport = -1;
      for (let i = 0; i < Math.min(lines.length, 80); i++) {
        const l = lines[i];
        if (/^import\s.*;$/.test(l)) lastImport = i;            // one-liner
        else if (/^}\s*from\s.*;$/.test(l)) lastImport = i;    // multiline end
      }
      const names2 = [...names].sort().join(", ");
      lines.splice(lastImport + 1, 0, `import { ${names2} } from "${IMPORT_PATH}";`);
      src = lines.join("\n");
      fs.writeFileSync(file, src);
    }
  }
}

if (APPLY) {
  const usedNames = new Set([...importsByFile.values()].flat());
  const all = Object.values(NAME_MAP);
  const doc = `/**
 * patterns.ts — the class strings that were copy-pasted across the app.
 *
 * Each constant is one repeated shell, byte-identical to what the files
 * used before this extraction — deduplication, not restyling. Use these
 * instead of re-spelling "rounded-2xl border border-wangari-border p-3.5"
 * for the Nth time (ui-ux-pro-max rule 6: consistency, one source).
 *
 * Patterns referenced by only one place are NOT here: a constant with one
 * consumer just adds a jump. Add one when a second site appears.
 *
 * Repeated <button> variants are included even where the kit's <Button>
 * differs (rounded-full base) — adopting the kit there is a visual change
 * and needs eyes on the result, so it waits.
 *
 * Regenerate candidates: node scripts/standardize-patterns.mjs
 */

${all.map((n) => `export const ${n} =\n  ${JSON.stringify(reverse[n])};`).join("\n\n")}
`;
  fs.writeFileSync(constantsFile, doc);
}

console.log(`${APPLY ? "APPLIED" : "DRY"}  replacements: ${total} across ${report.length} files`);
report.forEach((f) => console.log("    " + f));
console.log(`constants: ${Object.keys(NAME_MAP).length}`);
