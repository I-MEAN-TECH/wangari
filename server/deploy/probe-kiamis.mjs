/**
 * Does the live server keep the national ID masked, reject bad input with a
 * reason, and build a KIAMIS export the farmer could actually hand over?
 *
 * Run ON THE VPS:  node /home/saasapp/app/server/deploy/probe-kiamis.mjs
 *
 * The probe performs ONE real write cycle (premises number, GPS, national ID)
 * to prove the round trip, then restores every original value in a `finally`
 * — including when a check throws mid-run. If the original national ID was
 * already set (the probe cannot read it back, by design), the ID write is
 * skipped rather than risking a value it cannot restore.
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

let token = null;
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const originals = { premises: undefined, lat: undefined, lng: undefined, idSet: undefined };
let probedFarmId = null;

try {
  // ── Pick a farm with production (has an owner worth probing). ─────────────
  const produced = await prisma.dailyProduction.groupBy({ by: ["farmId"], _count: true });
  const farmId = produced[0].farmId;
  probedFarmId = farmId;
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: { id: true, name: true, ownerId: true, premisesRegNo: true, latitude: true, longitude: true },
  });
  const owner = await prisma.user.findUnique({
    where: { id: farm.ownerId },
    select: { id: true, tokenVersion: true, nationalId: true },
  });
  token = jwt.sign(
    { userId: owner.id, farmId: farm.id, tv: owner.tokenVersion ?? 0 },
    envValue("JWT_SECRET"),
    { expiresIn: "10m" }
  );
  originals.premises = farm.premisesRegNo;
  originals.lat = farm.latitude === null ? null : Number(farm.latitude);
  originals.lng = farm.longitude === null ? null : Number(farm.longitude);
  originals.idSet = owner.nationalId != null;
  console.log(`probing farm ${farm.id} (${farm.name})\n`);

  // ── 1. The mask, and only the mask, rides an ordinary read. ───────────────
  const settings = await call("GET", "/api/settings");
  check(settings.status === 200, "GET /api/settings answers 200");
  check(
    settings.data?.user && Object.prototype.hasOwnProperty.call(settings.data.user, "nationalIdMasked"),
    "settings carries a nationalIdMasked hint",
    JSON.stringify(settings.data?.user?.nationalIdMasked ?? null)
  );
  check(
    !settings.data?.user || !Object.prototype.hasOwnProperty.call(settings.data.user, "nationalId"),
    "settings never carries the raw national ID"
  );
  check(
    settings.data?.farm && Object.prototype.hasOwnProperty.call(settings.data.farm, "premisesRegNo"),
    "settings carries the premises registration number"
  );

  // ── 2. Validation rejects bad input with a reason, not a silent save. ─────
  const badId = await call("PUT", "/api/settings/profile", { nationalId: "abc" });
  check(badId.status === 400, "a non-numeric national ID is refused", `status ${badId.status}`);
  check(
    typeof badId.data?.error === "string" && badId.data.error.includes("numbers"),
    "the refusal explains itself",
    badId.data?.error
  );
  check(badId.data?.field === "nationalId", "the refusal names the field", badId.data?.field);

  const halfGps = await call("PUT", "/api/settings/profile", { latitude: "-1.05" });
  check(halfGps.status === 400, "a lone latitude is refused", `status ${halfGps.status}`);
  check(
    typeof halfGps.data?.error === "string" && halfGps.data.error.includes("Both latitude"),
    "the GPS refusal explains itself",
    halfGps.data?.error
  );

  // ── 3. The full round trip: save, observe, export. ────────────────────────
  const wroteId = !originals.idSet;
  const saveBody = {
    premisesRegNo: "PROBE-TEMP-001",
    latitude: "-1.0524000",
    longitude: "36.9745000",
    ...(wroteId ? { nationalId: "12345678" } : {}),
  };
  const saved = await call("PUT", "/api/settings/profile", saveBody);
  check(saved.status === 200, "valid registration fields save", `status ${saved.status} ${JSON.stringify(saved.data)}`);

  const reread = await call("GET", "/api/settings");
  check(reread.data?.farm?.premisesRegNo === "PROBE-TEMP-001", "premises number round-trips");
  check(
    String(reread.data?.farm?.latitude ?? "").startsWith("-1.0524"),
    "latitude round-trips",
    String(reread.data?.farm?.latitude)
  );
  if (wroteId) {
    check(
      reread.data?.user?.nationalIdMasked === "••••5678",
      "the saved ID appears only as its mask",
      reread.data?.user?.nationalIdMasked
    );
  }

  const doc = await call("GET", "/api/kiamis");
  check(doc.status === 200, "GET /api/kiamis answers 200");
  check(doc.data?.schema === "kiamis-farmer-registration/v1", "the export names its schema", doc.data?.schema);
  check(doc.data?.holding?.premisesRegNo === "PROBE-TEMP-001", "export carries the premises number");
  check(
    doc.data?.holding?.latitude === -1.0524,
    "export carries coordinates as numbers",
    String(doc.data?.holding?.latitude)
  );
  check(Array.isArray(doc.data?.missing), "export states what is still missing", JSON.stringify(doc.data?.missing ?? []).slice(0, 160));
  if (wroteId) {
    check(doc.data?.registration?.nationalId === "12345678", "export carries the full ID (owner's own download)");
    check(
      !(doc.data?.missing ?? []).includes("national ID number"),
      "a recorded ID leaves the missing list"
    );
    check(
      !(doc.data?.missing ?? []).includes("farm coordinates"),
      "recorded coordinates leave the missing list"
    );
  }
  const annual = doc.data?.annualIncomeKes;
  check(
    annual === null || (typeof annual === "number" && Number.isFinite(annual)),
    "annual income is a number or an honest null",
    String(annual)
  );
} finally {
  // ── Restore every original value, whatever happened above. ────────────────
  try {
    const restore = await fetch(`${API}/api/settings/profile`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        premisesRegNo: originals.premises ?? "",
        latitude: originals.lat === null ? "" : String(originals.lat),
        longitude: originals.lng === null ? "" : String(originals.lng),
        ...(originals.idSet ? {} : { nationalId: "" }),
      }),
    });
    console.log(`\nrestored originals (status ${restore.status})`);
    if (probedFarmId !== null) {
      const farm = await prisma.farm.findUnique({ where: { id: probedFarmId }, select: { premisesRegNo: true, latitude: true } });
      console.log(`premises now: ${farm?.premisesRegNo ?? "null"}`);
    }
  } catch (e) {
    console.error("RESTORE FAILED — check farm registration fields", e);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

console.log("");
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} check(s) — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("all KIAMIS groundwork checks passed");
