/**
 * Does the live dashboard carry a populated six-month revenue series — the
 * fix for the empty Revenue Overview chart?
 *
 * Run ON THE VPS:  node /home/saasapp/app/server/deploy/probe-revenue-series.mjs
 * Exit 0 = series present and non-empty for a farm that has transactions.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import jwt from "/home/saasapp/app/server/node_modules/jsonwebtoken/index.js";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("/home/saasapp/app/server/node_modules/@prisma/client");

const ENV_FILE = "/home/saasapp/app/.env";
const API = "http://127.0.0.1:8010";

function envValue(key) {
  const line = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in ${ENV_FILE}`);
  return line.slice(key.length + 1).replace(/^\s*"/, "").replace(/"\s*$/, "").trim();
}

const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const prisma = new PrismaClient({ datasources: { db: { url: envValue("DATABASE_URL") } } });

try {
  // The farm with the most ledger rows (the screenshot farm has a 40k purchase).
  const txCounts = await prisma.transaction.groupBy({ by: ["farmId"], _count: true });
  txCounts.sort((a, b) => b._count - a._count);
  check(txCounts.length > 0, "there are farms with transactions", `${txCounts.length} farms`);
  const richest = txCounts[0];
  const farm = await prisma.farm.findUnique({ where: { id: richest.farmId } });
  const owner = await prisma.user.findUnique({ where: { id: farm.ownerId } });

  const token = jwt.sign(
    { userId: owner.id, farmId: farm.id, tv: owner.tokenVersion ?? 0 },
    envValue("JWT_SECRET"),
    { expiresIn: "5m" }
  );
  const res = await fetch(`${API}/api/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  check(res.status === 200, "GET /api/dashboard returns 200", `status ${res.status}`);
  const body = await res.json();

  check(Array.isArray(body.revenueSeries), "response carries revenueSeries");
  const series = body.revenueSeries ?? [];
  check(series.length > 0, "series has buckets", JSON.stringify(series));
  const nonEmpty = series.filter((s) => s.income > 0 || s.expenses > 0);
  check(nonEmpty.length > 0, "at least one month has real money", JSON.stringify(nonEmpty));
  check(
    series.every((s, i, a) => i === 0 || a[i - 1].key < s.key),
    "buckets are sorted ascending by key"
  );
  check(
    series.every((s) => /^\d{4}-\d{2}$/.test(s.key)),
    "every key is YYYY-MM"
  );
  check(
    nonEmpty.every((s) => Number.isFinite(s.income) && Number.isFinite(s.expenses)),
    "sums are finite numbers"
  );
} catch (error) {
  failures.push(`unexpected error: ${error.message}`);
  console.error("FAIL  unexpected error:", error);
} finally {
  await prisma.$disconnect();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nrevenueSeries is live and populated");
process.exit(0);
