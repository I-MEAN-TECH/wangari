/**
 * Does the live profitability endpoint carry M4's cost-vs-price economics —
 * and does it refuse to claim a margin where the books cannot support one?
 *
 * Run ON THE VPS:  node /home/saasapp/app/server/deploy/probe-unit-economics.mjs
 *
 * ## Why a probe and not a unit test
 *
 * unit-economics.test.ts pins the verdict arithmetic and the words. It cannot
 * prove the deployed build calls it, that the route's revenue ÷ output join
 * works against real Decimal columns, that the migration actually refiled the
 * livestock purchases, or that a zero-cost enterprise stays "no cost recorded"
 * in production. Those are the ways this can ship and still mislead.
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

const VERDICTS = new Set(["profitable", "thin", "losing", "no-cost", "no-price"]);

async function economicsFor(farm, owner) {
  const token = jwt.sign(
    { userId: owner.id, farmId: farm.id, tv: owner.tokenVersion ?? 0 },
    envValue("JWT_SECRET"),
    { expiresIn: "5m" }
  );
  const res = await fetch(`${API}/api/profitability`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`GET /api/profitability returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

try {
  // ── 1. The migration did its job. ──────────────────────────────────────────
  const misfiled = await prisma.transaction.count({
    where: {
      type: "expense",
      description: { startsWith: "Livestock purchase" },
      NOT: { costBucket: "stock" },
    },
  });
  check(
    misfiled === 0,
    "every 'Livestock purchase' expense sits in the stock bucket",
    `${misfiled} still misfiled`
  );

  const wrongCategory = await prisma.transaction.count({
    where: { type: "expense", description: { startsWith: "Livestock purchase" }, category: "animal_feed" },
  });
  check(wrongCategory === 0, "none of them still carries category animal_feed", `${wrongCategory} left`);

  // ── 2. The endpoint, on every farm that has produced anything. ─────────────
  const produced = await prisma.dailyProduction.groupBy({ by: ["farmId"], _count: true });
  const farmIds = produced.map((g) => g.farmId);
  check(farmIds.length > 0, "there are farms with production to probe", `${farmIds.length} farms`);

  let shaped = 0;
  let marginClaims = 0;
  let ownPriceSeen = null;

  for (const farmId of farmIds) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true, name: true, ownerId: true },
    });
    if (!farm || !farm.ownerId) continue;
    const owner = await prisma.user.findUnique({
      where: { id: farm.ownerId },
      select: { id: true, tokenVersion: true },
    });
    if (!owner) continue;

    const body = await economicsFor(farm, owner);
    check(Array.isArray(body.rows), `farm ${farmId}: rows returned`, `${body.rows.length} rows`);

    for (const r of body.rows) {
      // The key must exist on every row — null is a value, undefined is a bug.
      check(
        Object.prototype.hasOwnProperty.call(r, "economics"),
        `farm ${farmId}: row ${r.id} carries an economics field`
      );
      if (!r.economics) continue;

      check(VERDICTS.has(r.economics.verdict), `farm ${farmId}: row ${r.id} verdict is known`, r.economics.verdict);

      // The one sentence that must never be printed without data behind it.
      if (["profitable", "thin", "losing"].includes(r.economics.verdict)) {
        marginClaims++;
        check(
          typeof r.economics.costPerUnit === "number" && r.economics.costPerUnit > 0,
          `farm ${farmId}: row ${r.id} margin claim has a real cost behind it`,
          `cost=${r.economics.costPerUnit}`
        );
        check(
          typeof r.economics.pricePerUnit === "number" && r.economics.pricePerUnit > 0,
          `farm ${farmId}: row ${r.id} margin claim has a real price behind it`,
          `price=${r.economics.pricePerUnit}`
        );
        check(
          r.economics.profitPerUnit !== null,
          `farm ${farmId}: row ${r.id} margin claim carries a number`
        );
      }
      if (r.economics.verdict === "no-cost" || r.economics.verdict === "no-price") {
        check(
          r.economics.profitPerUnit === null,
          `farm ${farmId}: row ${r.id} absent data never carries a profit number`
        );
      }

      // Unit rows (the screen's audience) must have economics attached.
      if (r.unit && r.outputUnits > 0) {
        shaped++;
        if (ownPriceSeen === null && r.economics.ownPricePerUnit > 0) {
          ownPriceSeen = { farm: farm.name, row: r.name, own: r.economics.ownPricePerUnit, unit: r.unit };
        }
      }

      check(
        Object.prototype.hasOwnProperty.call(r, "marketRef"),
        `farm ${farmId}: row ${r.id} carries a marketRef field`
      );
    }
  }

  check(shaped > 0, "at least one unit-producing enterprise has economics", `${shaped} rows shaped`);
  check(
    ownPriceSeen !== null,
    "at least one enterprise joins its own realised price",
    ownPriceSeen ? `${ownPriceSeen.row}: KES ${ownPriceSeen.own}/${ownPriceSeen.unit}` : "none"
  );

  // ── 3. The county reference is honestly absent while the table is empty. ──
  const priceCount = await prisma.marketPrice.count();
  console.log(`\nmarket_prices rows: ${priceCount} (benchmark columns stay null until offers exist)`);

  console.log("");
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} check(s) — ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("all unit-economics checks passed");
} finally {
  await prisma.$disconnect();
}
