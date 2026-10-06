/**
 * Do the live M2 compliance documents and the M4 farm-health endpoint work
 * against the production database — and does farm-health refuse to invent a
 * percentile when there is not enough real data to compute one?
 *
 * Run ON THE VPS:  node /home/saasapp/app/server/deploy/probe-m2-m4-live.mjs
 *
 * ## Why a probe and not a unit test
 *
 * animal-register.test.ts pins the builders; farm-health.test.ts pins the
 * direction/percentile rules. Neither can prove the deployed build serves
 * them, that the auth gate passes a real owner token, that the
 * `animal_movements` migration actually landed on the production database,
 * or that the CSV routes produce downloadable bytes behind the real router.
 * Those are the ways this can ship and still be broken.
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

function tokenFor(user, farm) {
  return jwt.sign(
    { userId: user.id, farmId: farm.id, tv: user.tokenVersion ?? 0 },
    envValue("JWT_SECRET"),
    { expiresIn: "5m" }
  );
}

async function get(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res;
}

const SW_MARKERS = /(Hakuna|Wastani|Walialama|Haija|Kisima|Asante|Karibu|Mkulima)/;

try {
  // ── 1. The migration landed with its constraints. ─────────────────────────
  const movementCount = await prisma.animalMovement.count();
  check(true, "prisma.animalMovements is queryable", `${movementCount} rows`);

  // ── 2. Pick a real owner + farm (the way a farmer actually logs in). ─────
  // role is "farm_owner", not "owner" — and requireOwner only needs a session
  // that is neither a worker nor farmless, so any farm's owner will do.
  const farm = await prisma.farm.findFirst({ orderBy: { id: "asc" } });
  check(farm != null, "there is a farm to probe with");
  const owner = farm
    ? await prisma.user.findUnique({ where: { id: farm.ownerId } })
    : null;
  check(owner != null, "that farm has an owner account");
  const token = tokenFor(owner, farm);

  // No token must not be enough.
  const unauth = await get("/api/animals/register");
  check(unauth.status === 401, "GET /api/animals/register refuses a tokenless request", `status ${unauth.status}`);

  // ── 3. M2: the owner register, JSON and CSV. ─────────────────────────────
  const registerRes = await get("/api/animals/register", token);
  check(registerRes.status === 200, "GET /api/animals/register returns 200", `status ${registerRes.status}`);
  const register = registerRes.status === 200 ? await registerRes.json() : null;
  check(Array.isArray(register?.animals), "register carries an animals list");
  check(Array.isArray(register?.missing), "register carries an honest missing[] list",
    `missing: ${JSON.stringify((register?.missing ?? []).slice(0, 4))}`);

  const registerCsvRes = await get("/api/animals/register.csv", token);
  const registerCsv = registerCsvRes.status === 200 ? await registerCsvRes.text() : "";
  check(registerCsvRes.status === 200 && registerCsv.split(/\r?\n/)[0]?.includes(","),
    "GET /api/animals/register.csv returns CSV bytes",
    `status ${registerCsvRes.status}, header: ${registerCsv.split(/\r?\n/)[0]?.slice(0, 90)}`);
  check(!SW_MARKERS.test(registerCsv), "register CSV copy is English");

  // ── 4. M2: the county export, JSON and CSV. ──────────────────────────────
  const countyRes = await get("/api/animals/county-export", token);
  check(countyRes.status === 200, "GET /api/animals/county-export returns 200", `status ${countyRes.status}`);
  const county = countyRes.status === 200 ? await countyRes.json() : null;
  check(Array.isArray(county?.missing), "county export carries an honest missing[] list",
    `missing: ${JSON.stringify((county?.missing ?? []).slice(0, 4))}`);

  const countyCsvRes = await get("/api/animals/county-export.csv", token);
  const countyCsv = countyCsvRes.status === 200 ? await countyCsvRes.text() : "";
  check(countyCsvRes.status === 200 && countyCsv.split(/\r?\n/)[0]?.includes(","),
    "GET /api/animals/county-export.csv returns CSV bytes",
    `status ${countyCsvRes.status}, header: ${countyCsv.split(/\r?\n/)[0]?.slice(0, 90)}`);
  check(!SW_MARKERS.test(countyCsv), "county CSV copy is English");

  // ── 5. M4: farm-health tells the truth. ──────────────────────────────────
  const healthRes = await get("/api/farm-health", token);
  check(healthRes.status === 200, "GET /api/farm-health returns 200", `status ${healthRes.status}`);
  const health = healthRes.status === 200 ? await healthRes.json() : null;

  if (health) {
    check(typeof health.grade?.graded === "boolean", "grade.graded is a boolean",
      `graded=${health.grade?.graded} stars=${health.grade?.stars}`);
    for (const key of ["output", "income", "profit"]) {
      const t = health.trends?.[key];
      check(t && ["up", "down", "flat", null].includes(t.direction),
        `trends.${key}.direction is up/down/flat/null`,
        `direction=${JSON.stringify(t?.direction)} changePct=${JSON.stringify(t?.changePct)}`);
      if (t && t.direction === null) {
        check(t.changePct === null, `trends.${key} with no prior activity has changePct null`);
      }
    }
    if (health.percentile === null) {
      check(typeof health.percentileNote === "string" && health.percentileNote.length > 0,
        "no percentile means a percentileNote explaining why", health.percentileNote);
    } else {
      check(
        Number.isInteger(health.percentile.value) &&
          health.percentile.value >= 0 &&
          health.percentile.value <= 100 &&
          health.percentile.farmsCompared >= 1,
        "a percentile is only ever real and bounded",
        JSON.stringify(health.percentile)
      );
    }
    check(!SW_MARKERS.test(JSON.stringify(health)), "farm-health copy is English");
  }

  // ── 6. The movements endpoints answer for a farm with no animals. ────────
  const listed = await get(`/api/animals/${999999}/movements`, token);
  check(listed.status === 404 || listed.status === 200,
    "GET /api/animals/:id/movements answers without crashing", `status ${listed.status}`);
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
console.log("\nAll M2/M4 live checks passed");
process.exit(0);
