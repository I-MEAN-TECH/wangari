/**
 * Choose a free chat model by probing, not by guessing.
 *
 * Run it by hand, not per request:
 *   node scripts/pick-free-model.cjs [limit]
 *
 * Why by hand: every probe is TWO provider requests, and this plan allows
 * one request a minute account-wide. Probing five candidates costs about
 * ten minutes. A farm cannot afford that on every farmer's question, and an
 * assistant that re-chooses its own model mid-conversation dies in front of
 * a customer the moment a chosen model 404s.
 *
 * So: this prints a recommendation, a human pins it in AI_MODEL, and the
 * runtime keeps using that pin. The selection is deliberate; the use is not.
 */
const fs = require("fs");
const path = require("path");

/* Run the compiled libs, not ts-node: the app ships compiled, and this
   script must exercise exactly what production runs.

   Resolved from __dirname first, then from cwd. It was written to live at
   server/scripts/, and on the VPS that maps to app/scripts/ - but it also
   has to survive being run from the app root, which is where a deploy tends
   to drop it. Guessing the layout and crashing with MODULE_NOT_FOUND is a
   worse failure than two lines of fallback. */
function resolveLib(name) {
  const tries = [
    path.join(__dirname, "..", "dist", "lib", name),
    path.join(process.cwd(), "dist", "lib", name),
  ];
  for (const t of tries) if (fs.existsSync(t)) return t;
  throw new Error("compiled lib not found; looked in:\n  " + tries.join("\n  "));
}
const { rankCandidates, fetchRoster, DEFAULT_PROBE_LIMIT } = require(resolveLib("free-model-roster.js"));
const { probeAgentic } = require(resolveLib("agentic-probe.js"));

function loadEnv(file = ".env") {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const REASON_WORDS = {
  "not-free": "billable - has no :free suffix",
  "not-chat-transport": "not reachable over /chat/completions",
  "embedding-model": "an embedding model, cannot be talked to",
  "image-model": "an image model",
  "speech-model": "speech-to-text, cannot be talked to",
  "context-too-small": "context window too small for our prompt",
};

(async () => {
  const env = loadEnv(process.env.ENV_FILE || ".env");
  const baseUrl = env.AI_BASE_URL || "https://api.unorouter.com/v1";
  const apiKey = env.AI_API_KEY;
  if (!apiKey) {
    console.error("No AI_API_KEY in", process.env.ENV_FILE || ".env");
    process.exit(1);
  }

  const limit = Number(process.argv[2] || DEFAULT_PROBE_LIMIT);
  /* The probe fires TWO requests per model and this plan allows one a
     minute, so both the between-step gap and the between-model gap have to
     clear a full window. Without the between-STEP gap every candidate
     returned "step 2 answered 429" and the probe measured the rate limiter
     instead of the model. */
  const gapMs = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000) + 1_500;
  const roster = await fetchRoster(baseUrl, apiKey);
  const { candidates, rejected } = rankCandidates(roster);
  const freeCount = roster.filter((m) => String(m.id).endsWith(":free")).length;

  console.log(`\nRoster: ${roster.length} models, ${freeCount} of them free (id ends ":free").\n`);

  const byReason = {};
  for (const r of rejected) (byReason[r.reason] ||= []).push(r.model.id);
  console.log("Discarded before ranking:");
  for (const [reason, ids] of Object.entries(byReason)) {
    console.log(`  ${String(ids.length).padStart(3)}  ${REASON_WORDS[reason] || reason}`);
    console.log(`       e.g. ${ids.slice(0, 3).join(", ")}`);
  }
  console.log(`\n${candidates.length} chat candidates remain. Probing the first ${Math.min(limit, candidates.length)}.\n`);
  console.log("(each probe is 2 requests; the free plan allows 1 per minute)\n");

  const results = [];
  for (const c of candidates.slice(0, limit)) {
    process.stdout.write(`  ${c.model.id.padEnd(42)} probing... `);
    const verdict = await probeAgentic(c.model.id, apiKey, baseUrl, fetch, gapMs);
    const ms = (verdict.step1Ms ?? 0) + (verdict.step2Ms ?? 0);
    console.log(verdict.passed ? `PASS (${ms}ms)` : `fail - ${verdict.reason}`);
    results.push({ candidate: c, verdict });
    // Clear the per-minute window before the next probe, or the next one is
    // refused for being early rather than for being a bad model. Judging a
    // model on a rate-limit error is judging the plan, not the model.
    if (results.length < Math.min(limit, candidates.length)) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  const winner = results.find((r) => r.verdict.passed);
  console.log("\n" + "=".repeat(72));
  if (winner) {
    console.log(`\nRECOMMENDED: ${winner.candidate.model.id}`);
    console.log(`  ${winner.candidate.why}`);
    console.log(`  probe: ${winner.verdict.reason}`);
    console.log(`\n  Pin it with:\n    AI_MODEL=${winner.candidate.model.id}\n`);
    const runnersUp = results.filter((r) => !r.verdict.passed);
    if (runnersUp.length) {
      console.log("  Did NOT pass (do not pin these):");
      for (const r of runnersUp) console.log(`    ${r.candidate.model.id} - ${r.verdict.reason}`);
    }
  } else {
    console.log("\nNO CANDIDATE PASSED the two-step agentic probe.");
    console.log("  Keep the current AI_MODEL pinned. Switching to a model that");
    console.log("  cannot chain two tool calls leaves the panel dead halfway");
    console.log("  through recording a sale - the worst failure this product has.");
  }
  console.log("=".repeat(72) + "\n");
  process.exit(winner ? 0 : 2);
})().catch((e) => {
  console.error("selection failed:", e?.message || e);
  process.exit(1);
});