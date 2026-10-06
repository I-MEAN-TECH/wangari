/**
 * Does the live action engine fire the M3 sale-timing card — and stay silent
 * when the price data cannot support one?
 *
 * Run ON THE VPS:  node /home/saasapp/app/server/deploy/probe-sale-timing.mjs
 *
 * ## Why a probe and not a unit test
 *
 * sale-timing.test.ts pins the arithmetic and the words. It cannot prove that
 * the deployed build is the one calling it, that the route's egg/tray and
 * litre conversions are right, that the owner token authorises, or that the
 * card survives the 12-card cap. Those are the ways this can ship and still
 * be broken.
 *
 * ## The fixture, and why it is safe
 *
 * Production has 0 market_prices rows, so the honest state is silence and the
 * firing path is unobservable. The probe therefore inserts 6 clearly-labelled
 * price rows (source = "SMOKE TEST ..."), calls the real endpoint, asserts the
 * card, and DELETES THE ROWS IN A `finally`. It also asserts the row count is
 * exactly restored afterwards. The label means that even a failure mid-run
 * leaves a self-describing row, never a plausible-looking farmer offer.
 *
 * Exit 0 = verified (or honestly SKIPped for lack of a producing farm).
 * Exit 1 = something is wrong, with the reason printed.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import jwt from "/home/saasapp/app/server/node_modules/jsonwebtoken/index.js";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("/home/saasapp/app/server/node_modules/@prisma/client");

const ENV_FILE = "/home/saasapp/app/.env";
const API = "http://127.0.0.1:8010";
const DAY = 86400000;
const EGGS_PER_TRAY = 30;

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

const FIXTURE_SOURCE = "SMOKE TEST probe-sale-timing — deleted immediately after this check";
const createdIds = [];

async function actionsFor(farm, owner) {
  const token = jwt.sign(
    { userId: owner.id, farmId: farm.id, tv: owner.tokenVersion ?? 0 },
    envValue("JWT_SECRET"),
    { expiresIn: "5m" }
  );
  const res = await fetch(`${API}/api/dashboard/actions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`GET /api/dashboard/actions returned ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  return body.actions ?? [];
}

try {
  const beforeCount = await prisma.marketPrice.count();
  console.log(`market_prices rows before: ${beforeCount}\n`);

  // ── Find a farm that produced something in the last 7 days AND has a ──
  // county, because the route's `weekly` needs recent output and the
  // regional pool needs somewhere to be regional about.
  const since = new Date(Date.now() - 7 * DAY);
  const recent = await prisma.dailyProduction.findMany({
    where: { date: { gte: since } },
    select: { farmId: true, flockId: true, eggsCollected: true, milkCollected: true },
  });

  const byFarm = new Map();
  for (const r of recent) {
    if (!byFarm.has(r.farmId)) byFarm.set(r.farmId, []);
    byFarm.get(r.farmId).push(r);
  }

  const METRIC_BY_SPECIES = {
    layers: "eggs", kienyeji: "eggs", broilers: "weight",
    cattle_dairy: "milk", cattle_beef: "weight",
    goats: "weight", sheep: "weight", pigs: "weight", rabbits: "weight",
    fish: "weight", bees: "weight",
  };

  let chosen = null;
  for (const [farmId, rows] of byFarm) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true, name: true, county: true, ownerId: true },
    });
    if (!farm || !farm.county) continue;
    const owner = await prisma.user.findUnique({
      where: { id: farm.ownerId },
      select: { id: true, tokenVersion: true },
    });
    if (!owner) continue;

    const flocks = await prisma.flock.findMany({
      where: { farmId },
      select: { id: true, type: true, category: true },
    });
    const metricOf = (flockId) => {
      const f = flocks.find((x) => x.id === flockId);
      if (!f) return "weight";
      return METRIC_BY_SPECIES[f.type || ""] ?? (f.category === "poultry" ? "eggs" : "weight");
    };

    let eggs = 0, milk = 0;
    for (const r of rows) {
      const m = metricOf(r.flockId);
      if (m === "eggs") eggs += Number(r.eggsCollected || 0);
      else if (m === "milk") milk += Number(r.milkCollected || 0);
    }

    if (eggs > 0) chosen = { farm, owner, commodity: "eggs", label: "Egg", unit: "tray", weekly: eggs / EGGS_PER_TRAY };
    else if (milk > 0) chosen = { farm, owner, commodity: "milk", label: "Milk", unit: "litre", weekly: milk };
    if (chosen) break;
  }

  // ── Baseline: the endpoint works, and with no price data there is no card. ──
  const anyFarm = chosen?.farm ?? null;
  if (!anyFarm) {
    // Still prove the deployed route loads and answers.
    const fallback = await prisma.farm.findFirst({
      where: { owner: { isNot: null } },
      select: { id: true, name: true, county: true, ownerId: true },
    });
    const owner = await prisma.user.findUnique({
      where: { id: fallback.ownerId },
      select: { id: true, tokenVersion: true },
    });
    const actions = await actionsFor(fallback, owner);
    check(Array.isArray(actions), "GET /api/dashboard/actions answers 200 with an actions array");
    console.log("\nSKIP  firing check: no farm produced eggs or milk in the last 7 days");
    console.log("      (the rule is data-gated by design; silence is the correct state)");
  } else {
    const { farm, owner } = chosen;
    console.log(`probing farm ${farm.id} (${farm.name}), county ${farm.county}`);
    console.log(`producing ~${chosen.weekly.toFixed(1)} ${chosen.commodity === "eggs" ? "trays" : "litres"} / week of ${chosen.commodity}\n`);

    const before = await actionsFor(farm, owner);
    const beforeCard = before.find((a) => a.id.startsWith("sale-timing-"));
    // Silence is only the correct baseline while the table is empty. If a real
    // farmer offer has landed by run time and legitimately fires the card,
    // that is the feature working — don't fail it.
    const silenceExpected = beforeCount === 0;
    if (silenceExpected) {
      check(
        !beforeCard,
        "no sale-timing card while the price table has no offers",
        beforeCard ? `unexpected card: ${beforeCard.title}` : `${before.length} other actions`
      );
    } else {
      console.log(`NOTE  price table already has ${beforeCount} offers; ` +
        (beforeCard ? `a real card is already firing: "${beforeCard.title}"` : "baseline card absent"));
    }

    // ── The fixture: +20% move with a real baseline behind it. ──
    try {
      const now = Date.now();
      const mk = (price, daysAgo) => ({
        commodity: chosen.commodity,
        unit: chosen.unit,
        region: farm.county,
        priceKes: price,
        source: FIXTURE_SOURCE,
        effectiveDate: new Date(now - daysAgo * DAY),
      });
      await prisma.marketPrice.createMany({
        data: [
          mk(100, 60), mk(100, 70), mk(100, 80), mk(100, 90),
          mk(120, 5), mk(120, 12),
        ],
      });
      // createMany doesn't return ids; find them by the fixture source.
      const created = await prisma.marketPrice.findMany({
        where: { source: FIXTURE_SOURCE },
        select: { id: true },
      });
      createdIds.push(...created.map((r) => r.id));
      console.log(`inserted ${createdIds.length} labelled fixture offers`);

      const after = await actionsFor(farm, owner);
      const card = after.find((a) => a.id === `sale-timing-${chosen.commodity}`);
      check(Boolean(card), "the sale-timing card fires once a real move exists");
      if (card) {
        console.log(`  title:       ${card.title}`);
        console.log(`  detail:      ${card.detail}`);
        console.log(`  moneyImpact: ${card.moneyImpact}`);
        check(/up 20%/.test(card.title), "the card says exactly what the data says (+20%)");
        check(/\/week at your current output/.test(card.moneyImpact), "the card stakes the move in KES per week");
        check(card.href === "/market-prices", "the card links to the price board");
        check(card.icon === "TrendingUp", "the card carries the TrendingUp icon", `got ${card.icon}`);
        check(
          /Recorded by farmers in /.test(card.detail),
          "the card names where the offers came from"
        );
        check(after.length <= 12, "the card survived the 12-card cap", `${after.length} cards`);
      }
    } finally {
      const deleted = await prisma.marketPrice.deleteMany({
        where: { source: FIXTURE_SOURCE },
      });
      console.log(`deleted ${deleted.count} fixture rows`);
    }

    const restored = await prisma.marketPrice.count();
    check(restored === beforeCount, "price table restored exactly", `before ${beforeCount}, after ${restored}`);

    const finalActions = await actionsFor(farm, owner);
    if (silenceExpected) {
      check(
        !finalActions.some((a) => a.id.startsWith("sale-timing-")),
        "card gone again once the fixtures are removed"
      );
    }
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} check(s) — ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("all sale-timing checks passed");
} finally {
  // Last-resort cleanup: even an error above must not leave labelled rows
  // behind. Silently successful deletes are the normal case (already done).
  if (createdIds.length > 0) {
    try {
      const leftover = await prisma.marketPrice.count({ where: { source: FIXTURE_SOURCE } });
      if (leftover > 0) {
        await prisma.marketPrice.deleteMany({ where: { source: FIXTURE_SOURCE } });
        console.error(`emergency cleanup removed ${leftover} leftover fixture rows`);
      }
    } catch (e) {
      console.error("EMERGENCY CLEANUP FAILED — delete market_prices rows where source =", FIXTURE_SOURCE, e);
    }
  }
  await prisma.$disconnect();
}
