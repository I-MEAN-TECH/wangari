#!/usr/bin/env node
/**
 * Insert or remove a temporary IP rule against the LIVE database, so the guard
 * can be proven to refuse real traffic.
 *
 * Why this exists: `probe-ip-guard.mjs` only exercises decide() in-process
 * against the real table. That cannot catch the failure this feature exists to
 * prevent — a guard that is mounted, healthy, and never fires because it reads
 * the wrong address. With `trust proxy` unset, req.ip is the nginx socket and
 * every rule silently matches 127.0.0.1 while the panel shows it "working".
 *
 * The request must come from the address being blocked, and `trust proxy = 1`
 * means Express takes the RIGHTMOST X-Forwarded-For entry, so the header
 * cannot be spoofed from outside. Hence this script only manages the rule; the
 * request itself is made from the caller's own machine.
 *
 * Usage:
 *   node probe-ip-guard-live.mjs add    <ip>   # insert, wait out the cache
 *   node probe-ip-guard-live.mjs remove <ip>   # delete, wait out the cache
 *   node probe-ip-guard-live.mjs status
 *
 * The rule table is only ever left as it was found: `status` prints the count
 * so a leftover row is obvious, and `remove` is idempotent.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..", "..");
const envPath = resolve(appRoot, ".env");

// Same parsing rule as migrate-with-env.mjs: split on the FIRST '=' only, and
// do not let the shell near the file (EMAIL_FROM has an unquoted space).
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
}
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL missing from .env. Refusing to touch the rule table.");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

// verdictFor caches the rule set for 5s; out-wait it or the proof tests the
// cache rather than the rule.
const CACHE_MS = 5000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mode = process.argv[2];
const ip = process.argv[3];

try {
  if (mode === "status") {
    const rules = await prisma.ipRule.findMany({ orderBy: { id: "asc" } });
    console.log(`ip_rules: ${rules.length} row(s)`);
    for (const r of rules) {
      console.log(`  #${r.id} ${r.action} ${r.pattern} hits=${r.hitCount} last=${r.lastHitAt ? r.lastHitAt.toISOString() : "-"}`);
    }
  } else if (mode === "add") {
    if (!ip) throw new Error("add needs an address");
    const rule = await prisma.ipRule.create({
      data: { pattern: ip, action: "block", note: "TEMPORARY live guard proof — removed immediately after", addedBy: "deploy-probe" },
    });
    console.log(`inserted #${rule.id} block ${ip}`);
    await sleep(CACHE_MS + 500);
    console.log(`waited out the ${CACHE_MS}ms rule cache`);
  } else if (mode === "remove") {
    if (!ip) throw new Error("remove needs an address");
    const { count } = await prisma.ipRule.deleteMany({ where: { pattern: ip } });
    console.log(`deleted ${count} row(s) for ${ip}`);
    await sleep(CACHE_MS + 500);
    console.log(`waited out the ${CACHE_MS}ms rule cache`);
  } else {
    console.error("usage: probe-ip-guard-live.mjs <add|remove|status> [ip]");
    process.exit(2);
  }
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}