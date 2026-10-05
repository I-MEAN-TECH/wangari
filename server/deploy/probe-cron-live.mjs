#!/usr/bin/env node
/**
 * Probe the live cron endpoints with the correct CRON_SECRET header.
 *
 * The cron routes are called by Vercel Cron (or a mirror) using CRON_SECRET
 * as a Bearer token. A deploy can pass verification with everything else
 * intact yet still lose the cron runner if CRON_SECRET is stripped from the
 * process — the kind of failure that reports 200s on /health and still leaves
 * farmers without their daily digest.
 *
 * This probe lists the cron paths from the SOURCE (so it has to be updated if
 * the routes change) and calls each one with the secret. A 401 from the
 * correct header is the failure it is looking for, because that means the
 * process either does not have CRON_SECRET or is comparing against the wrong
 * value.
 *
 * It does NOT call any write endpoint — every route here is GET and read-only
 * from the outside. Do not add mutations to this probe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..", "..");

// Parse the app-root .env, first '=' only (same rule as every deploy helper).
const envPath = path.resolve(appRoot, ".env");
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

const secret = env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET missing from .env. Refusing to probe.");
  process.exit(1);
}

const BASE = process.argv[2] || "https://api.wangari.imeantech.com";

// The live cron routes come from the COMPILED server, not the source — so read
// the route paths from dist/routes/cron.js. If that fails, fall back to the
// source list so the probe is still useful when run against a fresh checkout.
const compiledRoutes = path.resolve(appRoot, "server", "dist", "routes", "cron.js");
const srcPaths = (() => {
  const routeDir = path.resolve(appRoot, "server", "src", "routes");
  const cronFiles = fs.readdirSync(routeDir).filter((f) => /cron/.test(f) && f.endsWith(".ts"));
  const paths = new Set();
  for (const file of cronFiles) {
    const src = fs.readFileSync(path.resolve(routeDir, file), "utf8");
    let cursor = src;
    let m;
    while ((m = /router\.(get|post|patch|delete|all)\("([^"]+)"/.exec(cursor))) {
      paths.add(m[2]);
      cursor = cursor.slice(m.index + m[0].length);
    }
  }
  return [...paths];
})();
const paths = fs.existsSync(compiledRoutes)
  ? fs.readFileSync(compiledRoutes, "utf8").match(/\.(get|post|patch|delete|all)\("([^"]+)"/g).map((m) => m.slice(m.indexOf('"') + 1, m.lastIndexOf('"')))
  : srcPaths;

if (paths.length === 0) {
  console.error("No cron routes found. Refusing to probe.");
  process.exit(1);
}

console.log(`probing ${paths.length} cron route(s) with CRON_SECRET Bearer token\n`);

let failed = 0;
for (const p of [...paths].sort()) {
  try {
    const res = await fetch(BASE + p, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const ok = res.ok;
    console.log(`${ok ? "OK " : "FAIL"}  ${p}  ->  ${res.status}`);
    if (!ok) failed++;
  } catch (e) {
    failed++;
    console.log(`ERROR  ${p}  ->  ${e.message.split("\n")[0]}`);
  }
}

if (failed) {
  console.error(`\n${failed} cron route(s) did not return 2xx with the correct secret.`);
  process.exit(1);
}

console.log("\nAll cron routes answered 2xx with CRON_SECRET. The cron runner is live.");