#!/usr/bin/env node
/**
 * Reload the API with the real environment attached.
 *
 * Why this exists rather than `pm2 restart --update-env`:
 *
 *   1. PM2 does not parse .env. `--update-env` copies the CALLER's environment
 *      into the process, so reloading from a plain ssh session hands PM2 an
 *      environment with almost nothing in it — and PM2 then DROPS the vars the
 *      running process had. That is how JWT_SECRET, ADMIN_JWT_SECRET and
 *      CRON_SECRET quietly disappeared from the live process: every deploy from
 *      a fresh shell stripped them.
 *
 *   2. `set -a; . ./.env` is the documented fix but it breaks on this file:
 *      EMAIL_FROM=Wangari <noreply@imeantech.com> is unquoted, so bash treats
 *      the value as a redirect and dies with a syntax error, leaving the rest
 *      of the file unsourced.
 *
 * So the file is parsed here instead — split on the FIRST `=` and nothing else,
 * which is exactly the rule dotenv uses and which does not care about spaces,
 * `#`, or shell metacharacters in a value.
 *
 * Usage: node deploy/reload-with-env.mjs <.env path> [pm2 args...]
 * Prints what it sourced (names and value lengths only — never the values).
 *
 * ── reload vs start, and why it matters ────────────────────────────────────
 * `pm2 reload <ecosystem>` recycles the workers of an app PM2 already knows.
 * It does NOT re-read the `script` field, so a change to the entrypoint is
 * silently ignored and the process keeps running the OLD file — which is
 * exactly what happened here: PM2 kept serving an orphan build that nothing
 * in the repository produces, and every deploy "succeeded" while changing
 * nothing. `start` re-reads the definition and is the action to use whenever
 * the app definition itself changed.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const action = process.env.PM2_ACTION || "reload";
const envPath = process.argv[2] || ".env";
const pm2Args = process.argv.slice(3);

let raw;
try {
  raw = readFileSync(envPath, "utf8");
} catch (e) {
  console.error(`Cannot read ${envPath}: ${e.message}`);
  process.exit(1);
}

const parsed = {};
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue; // no key, or a bare line
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  // Strip one layer of matching quotes; leave everything else verbatim so a
  // value containing spaces or '#' survives.
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  parsed[key] = value;
}

// Keep whatever PM2 itself was started with (PATH, PM2_HOME, HOME) and layer
// the file on top. Dropping PATH here would break `pm2` itself.
const env = { ...process.env, ...parsed };

const required = ["CRON_SECRET", "JWT_SECRET", "DATABASE_URL", "NODE_ENV"];
const missing = required.filter((k) => !env[k]);
console.log(`sourced ${Object.keys(parsed).length} keys from ${envPath}`);
for (const k of required) {
  console.log(`  ${missing.includes(k) ? "MISSING" : "ok"} ${k} (len ${(env[k] || "").length})`);
}
if (missing.length) {
  console.error(`\nRefusing to reload: ${missing.join(", ")} not set.`);
  console.error("A reload without them strips them from the live process.");
  process.exit(1);
}

const res = spawnSync(
  "/home/saasapp/bin/pm2",
  [action, "ecosystem.config.cjs", "--update-env", ...pm2Args],
  { env, stdio: "inherit" },
);
process.exit(res.status ?? 1);