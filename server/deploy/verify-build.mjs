#!/usr/bin/env node
/**
 * Verify the BUILD ON DISK actually contains the fixes we shipped.
 *
 * This exists because a deploy on this server succeeded, reported green, and
 * changed nothing at all: PM2 was running an orphan `dist/` that no build in
 * the repository produces, so every push was verified and then discarded. The
 * symptom was invisible — health checks returned 200 the whole time.
 *
 * It reads the compiled output, not the running process, because the running
 * process is the thing under suspicion.
 *
 * Usage: node verify-build.mjs [distDir]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = process.argv[2] || resolve(process.cwd(), "server", "dist");

/** Each entry is a fix that has already been reported as "deployed". */
const MARKERS = [
  /* Matched WITHOUT a trailing `(`. TypeScript compiles a cross-module call to
     `(0, model_health_js_1.healthyModel)(...)`, so `healthyModel(` never
     appears in the output — an earlier version of this file asserted exactly
     that and reported a healthy build as broken. The marker has to survive
     the compiler's shape, not assume source syntax. */
  ["routes/ai.js", /healthyModel/, "automatic model selection (this change)"],
  ["routes/ai.js", /recordUse/, "AI usage forensics log (this change)"],
  ["routes/ai.js", /isChannelExhausted/, "exhausted-channel 503 fallback"],
  ["routes/ai.js", /userId: req\.user/, "AI caller attribution"],
  ["routes/cron.js", /if \(!CRON_SECRET\)/, "cron guards fail closed"],
  ["routes/admin-ip.js", /refuse|isValidPattern/, "IP management router"],
  ["routes/admin-ai.js", /router\.get\("\/health"/, "AI health endpoint"],
  ["routes/admin-ai.js", /sidelinedForMs/, "AI health sidelining"],
  ["lib/ip-rules.js", /function decide/, "IP rule precedence"],
  ["middleware/ipGuard.js", /status\(403\)/, "IP request guard"],
];

let missing = 0;
let rows = [];
for (const [file, re, label] of MARKERS) {
  const path = resolve(dist, file);
  let ok = false;
  try {
    ok = re.test(readFileSync(path, "utf8"));
  } catch {
    ok = false;
  }
  if (!ok) missing++;
  rows.push(`${ok ? "PRESENT" : "MISSING"}  ${label.padEnd(42)} ${file}`);
}

console.log(rows.join("\n"));
if (missing) {
  console.error(`\n${missing} fix(es) are NOT in this build. A "git pull" alone does not rebuild.`);
  process.exit(1);
}
console.log("\nAll shipped fixes are present in this build.");