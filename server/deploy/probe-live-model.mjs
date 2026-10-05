/**
 * Live end-to-end check of automatic model selection against the real provider.
 *
 * ── why this exists ────────────────────────────────────────────────────────
 * Everything else about this feature is proven by replay: real captured 503
 * bodies through the real selection functions, plus source assertions that the
 * route calls them. What replay cannot tell us is whether the provider's
 * behaviour today still matches the bodies we recorded. If UnoRouter has
 * changed its wording, `classifyFailure` stops recognising exhaustion and the
 * 503 comes straight back to farmers — and every offline test still passes.
 *
 * So this makes real calls, through the REAL compiled `model-health.js`, using
 * the same order of operations the route uses: choose, call, observe, and if
 * the model is gone or exhausted, choose again and call again.
 *
 * ── what it deliberately does NOT do ───────────────────────────────────────
 * It does not POST to /api/ai/chat. That needs a farmer's JWT, and more
 * importantly it would write records to a real farm. This is read-mostly and
 * bounded: at most MAX_CALLS requests, no farm data, nothing persisted.
 *
 * Cost: UnoRouter's free tier allows ~50 a day account-wide. This spends up to
 * MAX_CALLS. Run it when you need to know, not on a loop.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Hard ceiling. If the loop below ever misbehaves, this is what stops it. */
const MAX_CALLS = 3;

const env = {};
for (const line of readFileSync(resolve(appRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}

const KEY = env.AI_API_KEY;
const BASE = env.AI_BASE_URL || "https://api.unorouter.com/v1";
const PRIMARY = env.AI_MODEL || "space-bunny-alpha:free";
const FALLBACKS = (env.AI_MODEL_FALLBACKS || "").split(",").map((s) => s.trim()).filter(Boolean);

if (!KEY) {
  console.error("AI_API_KEY is not in .env — cannot run the live check.");
  process.exit(1);
}

// The REAL compiled module, not a reimplementation.
const { modelHealth, healthyModel, classifyFailure } = await import(
  resolve(appRoot, "server/dist/lib/model-health.js")
);

console.log(`provider  ${BASE}`);
console.log(`candidates ${[PRIMARY, ...FALLBACKS].join("  →  ")}`);
console.log(`budget     up to ${MAX_CALLS} request(s) against the free tier\n`);

/** One request. Returns status and body so classifyFailure sees the real text. */
async function call(model) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      max_tokens: 5,
    }),
  });
  const body = await res.text();
  return { status: res.status, body };
}

/**
 * The route's order of operations, with the retry/fallback loop flattened into
 * one straight run because we are measuring selection, not waiting out a rate
 * limit (a 429 here means the tier is exhausted for the day, which is itself a
 * finding worth reporting).
 */
const ALL = [PRIMARY, ...FALLBACKS];
let spent = 0;
let remaining = ALL;
let answeredBy = null;
let farmerSawError = null;

while (spent < MAX_CALLS) {
  const pick = healthyModel(remaining, modelHealth.snapshot(), Date.now());
  if (!pick.model) {
    farmerSawError = "no models configured";
    break;
  }
  /* Position is reported against the ORIGINAL list, not `remaining`.
     After a swap the backup is index 0 of a one-element list, so
     healthyModel calls it "preferred model, no known problem" — true of the
     reduced list, and actively misleading in the one screen someone reads
     during an incident, because it hides that anything went wrong at all. */
  const rank = ALL.indexOf(pick.model) + 1;
  const label = rank === 1 ? "preferred" : `fallback #${rank - 1}`;
  console.log(`  chose    ${pick.model}  [${label}]  (${pick.reason})`);

  const { status, body } = await call(pick.model);
  spent++;
  const verdict = classifyFailure(status, body);
  modelHealth.observe(pick.model, status, body, Date.now());
  const snippet = body.replace(/\s+/g, " ").slice(0, 90);
  console.log(`  call     ${status}  state=${verdict.state}  ${snippet}`);
  if (verdict.reason) console.log(`  reason   ${verdict.reason}`);

  if (status >= 200 && status < 300) {
    answeredBy = pick.model;
    modelHealth.recordUse(pick.model, { userId: null, ip: "127.0.0.1" }, Date.now(), {
      fellBackFrom: pick.fellBackFrom ?? null,
      reason: pick.reason,
    });
    break;
  }
  if (verdict.state === "rate_limited") {
    farmerSawError = `429 on ${pick.model} — the account's daily/free-tier budget is spent, not a model problem`;
    break;
  }
  if (verdict.state !== "gone" && verdict.state !== "exhausted") {
    farmerSawError = `${status} on ${pick.model} (${verdict.reason})`;
    break;
  }
  remaining = remaining.filter((m) => m !== pick.model);
  if (!remaining.length) {
    farmerSawError = `every candidate failed (last: ${status} on ${pick.model})`;
    break;
  }
  console.log(`           (${ALL.length - remaining.length} of ${ALL.length} candidates exhausted)`);
}

console.log("");
if (answeredBy) {
  console.log(`RESULT  a farmer would have been ANSWERED by ${answeredBy} after ${spent} request(s).`);
} else {
  console.log(`RESULT  a farmer would have seen an ERROR: ${farmerSawError}`);
}

console.log("\nselection state afterwards:");
for (const [m, h] of Object.entries(modelHealth.snapshot())) {
  console.log(`  ${m}  state=${h.state}  uptime=${Math.round(h.uptime * 100)}%  calls=${h.calls}`);
}
process.exit(answeredBy ? 0 : 1);