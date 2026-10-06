/**
 * Does the live profitability endpoint return real, finite, attributed numbers?
 *
 * Run ON THE VPS:  node /home/saasapp/app/server/deploy/probe-m1-profitability.mjs
 *
 * ## Why a probe and not a unit test
 *
 * The unit tests pin the taxonomy and the attribution rules. They cannot tell
 * us that the deployed build is the one that *calls* them, that the migration
 * applied, that the owner token actually authorises, or that the JSON the
 * farmer's screen receives has no `NaN` in it. Those are the four ways M1 can
 * ship and still be broken, and only this probe covers them.
 *
 * It signs its own token from the real JWT_SECRET rather than borrowing a
 * session, so it stays runnable after a deploy with no logged-in user.
 *
 * Exit 0 = verified. Exit 1 = something is wrong, with the reason printed.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import jwt from "/home/saasapp/app/server/node_modules/jsonwebtoken/index.js";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("/home/saasapp/app/server/node_modules/@prisma/client");

const ENV_FILE = "/home/saasapp/app/.env";
const API = "http://127.0.0.1:8010";

function envValue(key) {
  const line = fs
    .readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in ${ENV_FILE}`);
  return line.slice(key.length + 1).replace(/^\s*"/, "").replace(/"\s*$/, "").trim();
}

const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const prisma = new PrismaClient({
  datasources: { db: { url: envValue("DATABASE_URL") } },
});

try {
  // ── Pick a farm that actually has transactions, so the endpoint has work to do.
  const tx = await prisma.transaction.findFirst({ select: { farmId: true } });
  if (!tx) throw new Error("no transactions in the database; nothing to verify");

  const farm = await prisma.farm.findUnique({
    where: { id: tx.farmId },
    select: { id: true, name: true, ownerId: true },
  });
  const owner = await prisma.user.findUnique({
    where: { id: farm.ownerId },
    select: { id: true, tokenVersion: true },
  });

  console.log(`probing farm ${farm.id} (${farm.name}), owner ${owner.id}`);
  console.log("");

  const token = jwt.sign(
    { userId: owner.id, farmId: farm.id, tv: owner.tokenVersion ?? 0 },
    envValue("JWT_SECRET"),
    { expiresIn: "5m" }
  );

  const res = await fetch(`${API}/api/profitability`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(res.status === 200, `GET /api/profitability returns 200`, `got ${res.status}`);
  if (res.status !== 200) {
    console.log(JSON.stringify(await res.json().catch(() => ({})), null, 2));
    throw new Error("endpoint did not return 200");
  }

  const body = await res.json();
  console.log("");
  console.log(`periodDays: ${body.periodDays}`);
  console.log(`rows: ${body.rows.length}`);
  console.log(`summary: revenue=${body.summary.totalRevenue} costs=${body.summary.totalCosts} profit=${body.summary.totalProfit}`);
  console.log("");

  for (const r of body.rows) {
    const breakdown = (r.costBreakdown ?? [])
      .map((b) => `${b.bucket}=${b.amount}`)
      .join(" ");
    console.log(
      `  ${String(r.kind).padEnd(7)} ${String(r.name).slice(0, 26).padEnd(26)} ` +
        `rev=${String(r.revenue).padStart(10)} cost=${String(r.costs).padStart(10)} ` +
        `profit=${String(r.profit).padStart(10)} margin=${r.margin} ` +
        `unit=${r.unit ?? "-"} costPerUnit=${r.costPerUnit ?? "-"}`
    );
    if (breakdown) console.log(`          costs: ${breakdown}`);
  }
  console.log("");

  // ── The assertions that matter.
  check(body.rows.length > 0, "the endpoint returned at least one enterprise row");

  // Every number the farmer reads must be a finite number or an explicit null.
  // `NaN` serialises to null in JSON, so an undefined division would hide —
  // check the raw values, not the serialised ones.
  const NaNish = body.rows.filter((r) =>
    ["revenue", "costs", "profit", "outputKg", "outputUnits"].some(
      (k) => typeof r[k] !== "number" || Number.isNaN(r[k])
    )
  );
  check(NaNish.length === 0, "no row has a NaN or missing core number", `${NaNish.length} bad`);

  const badUnit = body.rows.filter(
    (r) => r.costPerUnit !== null && (!Number.isFinite(r.costPerUnit) || r.costPerUnit < 0)
  );
  check(badUnit.length === 0, "costPerUnit is finite and non-negative, or null", `${badUnit.length} bad`);

  // The whole point of M1: at least one row should now show a bucketed cost
  // breakdown. If every row is "general" with no breakdown, the classification
  // did not reach the query.
  const withBreakdown = body.rows.filter((r) => (r.costBreakdown ?? []).length > 0);
  check(withBreakdown.length > 0, "at least one enterprise reports a cost breakdown by bucket");

  const attributed = body.rows.filter((r) => r.kind !== "general");
  console.log("");
  console.log(`attributed enterprises: ${attributed.length} of ${body.rows.length}`);
} catch (e) {
  console.error("");
  console.error(`ERROR: ${e.message}`);
  failures.push(e.message);
} finally {
  await prisma.$disconnect();
}

console.log("");
if (failures.length) {
  console.log(`FAILED (${failures.length}): ${failures.join(" | ")}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
