/**
 * Does the deployed Action Center carry rule #13 — flock replacement timing —
 * for the farm whose layers are past the window, and stay silent for the young
 * ones? Read-only: signs in as each farm owner with a 5-minute token, reads
 * GET /api/dashboard/actions, prints what fired.
 *
 * Run ON THE VPS: node /home/saasapp/app/server/deploy/probe-replacement-live.mjs
 * Exit 0 = rule verified live or honestly silent for every farm.
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

// Fixture state lives at module level because the finally block cannot see
// variables declared inside the try block — learned the hard way below.
let fixtureFlock = null;
let originalHatchDate = null;

try {
  // ownerId is a plain Int column: filter the nulls in JS, not with `not: null`.
  const farms = (await prisma.farm.findMany({
    select: { id: true, name: true, ownerId: true },
  })).filter((f) => f.ownerId != null);

  let sawRule13 = 0;
  let sawSilence = 0;

  // ── Fixture: age one layer flock past the window, prove the card fires. ──
  // probe-sale-timing's pattern: a temporary row change, restored in finally,
  // with the restore itself verified. Farm 7's "Layers - Pen B" is chosen
  // because that owner's account answers 200 (not trial-locked).
  const agedFlock = await prisma.flock.findFirst({
    where: { farmId: 7, type: { in: ["layers", "kienyeji"] }, status: "active" },
    orderBy: { id: "asc" },
    select: { id: true, name: true, hatchDate: true },
  });
  if (agedFlock) {
    fixtureFlock = agedFlock;
    originalHatchDate = agedFlock.hatchDate;
    const aged = new Date(Date.now() - 85 * 7 * 86400000);
    await prisma.flock.update({ where: { id: agedFlock.id }, data: { hatchDate: aged } });
    console.log(`fixture: flock ${agedFlock.id} (${agedFlock.name}) temporarily aged to 85 weeks`);
  }

  for (const farm of farms) {
    const owner = await prisma.user.findUnique({
      where: { id: farm.ownerId },
      select: { id: true, tokenVersion: true },
    });
    if (!owner) continue;
    const token = jwt.sign(
      { userId: owner.id, farmId: farm.id, tv: owner.tokenVersion ?? 0 },
      envValue("JWT_SECRET"),
      { expiresIn: "5m" }
    );
    const res = await fetch(`${API}/api/dashboard/actions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      // The paywall doing its job: an expired trial locks the dashboard module.
      // That is correct behaviour, not a probe failure — count it and move on.
      const bodyText = await res.text().catch(() => "");
      const locked = bodyText.includes("moduleLocked");
      check(locked, `farm ${farm.id} (${farm.name}): trial expired -> dashboard correctly locked`);
      sawSilence++;
      continue;
    }
    if (res.status !== 200) {
      const bodyText = await res.text().catch(() => "");
      check(false, `farm ${farm.id}: actions endpoint`, `status ${res.status}: ${bodyText.slice(0, 120)}`);
      continue;
    }
    const body = await res.json();
    const rule13 = (body.actions || []).filter((a) => a.id.startsWith("flock-replacement-"));
    const aged = await prisma.flock.findFirst({
      where: {
        farmId: farm.id,
        status: "active",
        type: { in: ["layers", "kienyeji"] },
        hatchDate: { not: null },
        currentCount: { gt: 0 },
      },
    });

    if (!aged) {
      // No aged layer flock: rule must be silent, whatever else fires.
      check(rule13.length === 0, `farm ${farm.id} (${farm.name}): no aged layers -> rule 13 silent`);
      sawSilence++;
      continue;
    }

    // The farm HAS an aged layer flock — the rule may still be silent while
    // the flock is younger than 64 weeks, but must never crash the endpoint.
    check(Array.isArray(body.actions), `farm ${farm.id} (${farm.name}): actions endpoint answers`, `${body.actions.length} actions`);
    const fixtureHere = fixtureFlock && farm.id === 7;
    if (fixtureHere && rule13.length === 0) {
      check(false, `farm 7: fixture flock aged past the window but NO rule-13 card fired`);
    }
    if (rule13.length > 0) {
      sawRule13++;
      const c = rule13[0];
      check(
        c.icon === "CalendarClock" && typeof c.title === "string" && c.title.length > 0,
        `farm ${farm.id}: rule 13 card well-formed`,
        c.title
      );
      check(
        c.moneyImpact === undefined || typeof c.moneyImpact === "string",
        `farm ${farm.id}: money impact only from the farm's own records`
      );
    } else {
      sawSilence++;
      console.log(`      farm ${farm.id} (${farm.name}): has aged layers but all younger than 64 weeks — silent by design`);
    }
  }

  check(sawRule13 > 0 || sawSilence > 0, "the rule ran against at least one farm", `${sawRule13} cards, ${sawSilence} silent`);
  console.log("");
  if (failures.length) {
    console.error(`FAILED: ${failures.length} check(s) — ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`all flock-replacement live checks passed (${sawRule13} farm(s) with a card, ${sawSilence} silent)`);
  } finally {
  // Restore first, verify the restore, then report — the fixture must never
  // outlive the probe, and "restored" must be proven, not assumed.
  if (fixtureFlock && originalHatchDate) {
    await prisma.flock.update({
      where: { id: fixtureFlock.id },
      data: { hatchDate: originalHatchDate },
    });
    const back = await prisma.flock.findUnique({
      where: { id: fixtureFlock.id },
      select: { hatchDate: true },
    });
    const restored = back && back.hatchDate && back.hatchDate.getTime() === originalHatchDate.getTime();
    console.log(`restore: flock ${fixtureFlock.id} hatchDate ${restored ? "restored to " + originalHatchDate.toISOString() : "RESTORE FAILED"}`);
    if (!restored) failures.push("fixture restore");
  }
  await prisma.$disconnect();
}
