#!/usr/bin/env node
/**
 * End-to-end verification that the live cron runner is reachable and
 * authenticated.
 *
 * The cron routes live behind /api/cron/<name>, authenticated with
 * CRON_SECRET as a Bearer token. A deploy can pass every other check yet
 * still lose the cron runner if CRON_SECRET is stripped from the process —
 * which is exactly the failure this probe is written to catch.
 *
 * It reads CRON_SECRET from the app-root .env (first '=' only, same rule as
 * every deploy helper) and calls each known cron path. A 401 from the correct
 * secret is the ONLY failure it accepts, because 200 means the runner is
 * live and 401 with the correct secret means it is lost.
 *
 * It does NOT call any write endpoint. Every route here is GET and read-only
 * from the outside. Do not add mutations to this probe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
// If the probe was copied somewhere else (for example /tmp/ from a base64
// round-trip), the relative path to the app root is wrong. The probe is
// shipped from server/deploy, so if that exists relative to here, use it;
// otherwise fall back to the repo root, which is one level up from server/.
let appRoot = path.resolve(here, "..", "..");
if (!fs.existsSync(path.resolve(appRoot, "server", "package.json"))) {
  appRoot = path.resolve(here, "..");
}
if (!fs.existsSync(path.resolve(appRoot, "server", "package.json"))) {
  appRoot = "/home/saasapp/app";
}

// Verify we found it rather than guessing wrong.
const envPath = path.resolve(appRoot, ".env");
if (!fs.existsSync(envPath)) {
  console.error("Cannot find .env under", appRoot);
  console.error("looking for .env at", envPath);
  console.error("cwd:", process.cwd());
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  let v = t.slice(eq + 1).trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
  }
  env[t.slice(0, eq).trim()] = v;
}

const CRON_SECRET = env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error("CRON_SECRET missing from .env. Refusing to probe.");
  process.exit(1);
}

const BASE = process.argv[2] || "https://api.wangari.imeantech.com";

// These paths come from the SOURCE route files, which is where the contract
// is defined. The compiled server mirrors this list (verified separately), so
// the source list is the correct one to assert against.
//
// Keep this list in sync with the route files in server/src/routes/ that
// register /api/cron/<name>. Adding a new cron route means adding its path
// here, or this probe will pass while the new runner is down.
const CRON_PATHS = [
  "/api/cron/farm-digest",
  "/api/cron/dmarc-check",
  "/api/cron/mfa-nudge",
  "/api/cron/quote-expiry",
  "/api/cron/farm-advisory",
  "/api/cron/lifecycle-reminders",
  "/api/cron/weekly-report",
];

console.log(`probing ${CRON_PATHS.length} cron route(s) with the real CRON_SECRET\n`);

let failed = 0;
for (const p of CRON_PATHS) {
  let status = "?";
  try {
    const res = await fetch(BASE + p, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    status = res.status;
    if (!res.ok) failed++;
  } catch (e) {
    status = `err:${e.message.split("\n")[0]}`;
    failed++;
  }
  console.log(`${status === 200 ? "OK  " : "BAD "}  ${p}  ->  ${status}`);
}

if (failed) {
  console.error(`\n${failed}/${CRON_PATHS.length} cron route(s) did not return 200 with the real CRON_SECRET.`);
  console.error("That usually means CRON_SECRET was stripped from the running process —");
  console.error("the exact failure this probe exists to catch.");
  process.exit(1);
}

console.log("\nAll cron routes answered 200 with the real CRON_SECRET. The cron runner is live.");
