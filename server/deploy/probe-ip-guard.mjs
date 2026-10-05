/**
 * Throwaway probe: is the IP guard actually consulting a working table?
 *
 * The guard FAILS OPEN by design — if the rule table is unreadable it lets
 * every request through, because a database blip must not become an outage of
 * paying farmers. That is the right default, but it means a broken table looks
 * exactly like a working one: traffic flows, the panel lists rules, and
 * nothing is ever blocked.
 *
 * So this asserts the table is reachable from the running build. Run from the
 * app root on the VPS, e.g. `node server/deploy/probe-ip-guard.mjs`.
 *
 * Exits non-zero if anything above fails, so it can gate a deploy.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Same convention as migrate-with-env.mjs: server/deploy -> server -> app root.
// Hardcoding the production path here would make the check wrong on any other
// host, which is how a diagnostic quietly stops being run.
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = resolve(appRoot, ".env");

const envLine = readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));
if (!envLine) {
  console.error(`DATABASE_URL not found in ${envPath}`);
  process.exit(1);
}
process.env.DATABASE_URL = envLine.slice("DATABASE_URL=".length).trim();

const { PrismaClient } = await import(resolve(appRoot, "server/node_modules/@prisma/client/index.js"));
const prisma = new PrismaClient();

let failed = 0;
const say = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "FAIL "} ${msg}`);
};

const { decide, verdictFor } = await import(resolve(appRoot, "server/dist/lib/ip-rules.js"));

// 1. The pure precedence function, with no database involved.
say(decide([], "203.0.113.9").action === "allow", "decide() with no rules allows");
say(
  decide(
    [{ id: 1, pattern: "203.0.113.0/24", action: "block", note: null, addedBy: null, hitCount: 0, lastHitAt: null, createdAt: new Date() },
     { id: 2, pattern: "203.0.113.7", action: "allow", note: null, addedBy: null, hitCount: 0, lastHitAt: null, createdAt: new Date() }],
    "203.0.113.7",
  ).action === "allow",
  "allow beats block",
);

// 2. The table itself — this is the one that fails open, so it is the one that
//    matters. If this throws, the guard is inert and nothing will say so.
const rows = await prisma.ipRule.findMany();
say(true, `ip_rules is reachable (${rows.length} rule(s))`);

// 3. The live path, end to end.
const v = await verdictFor("203.0.113.9");
say(v.action === "allow", `verdictFor() returns allow for an unlisted address (${v.reason})`);

// 4. A real block, if the operator has added one. Reported, never asserted:
//    the table may legitimately be empty on a fresh install.
if (rows.some((r) => r.action === "block")) {
  say(true, "at least one block rule exists to exercise");
} else {
  console.log("NOTE  no block rules yet — add one from System Health to see it refuse");
}

await prisma.$disconnect();
process.exit(failed ? 1 : 0);