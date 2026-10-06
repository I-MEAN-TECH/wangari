/**
 * Does the feedback endpoint work on the live server — including the ways it
 * must REFUSE?
 *
 * Run ON THE VPS:  node /home/saasapp/app/server/deploy/probe-feedback.mjs
 *
 * ## Why this is a probe and not just the unit tests
 *
 * The unit tests cover {@link validateFeedback} and {@link summariseFeedback}
 * directly. They cannot tell us that the deployed route actually *calls* the
 * validator, that the limiter does not block the first request, that the store
 * round-trips the tag array, or that `/api/admin/feedback` refuses an
 * unauthenticated caller. Those are the ways a correct validator on top of a
 * wrong route ships to production.
 *
 * ## Why cleanup is unconditional
 *
 * A probe row left in this table is not merely untidy: it corrupts the exact
 * numbers the table exists to measure. The first version of this probe deleted
 * only the submission it *expected* to succeed, and a case it expected to be
 * rejected was accepted instead — so it wrote a stray row into production and
 * reported a count mismatch that pointed at the wrong thing.
 *
 * So it now records the id watermark before it starts and deletes everything
 * above it in a `finally` block, whatever happened. A failed assertion must not
 * also be a data-loss and corruption event.
 */

import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("/home/saasapp/app/server/node_modules/@prisma/client");

const API = "http://127.0.0.1:8010";
const ENV_FILE = "/home/saasapp/app/.env";

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

const prisma = new PrismaClient({ datasources: { db: { url: envValue("DATABASE_URL") } } });

const post = (body) =>
  fetch(`${API}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

let watermark = 0;
let baseline = 0;

try {
  // ── The watermark. Everything above this id was created by this run.
  const newest = await prisma.feedback.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  watermark = newest?.id ?? 0;
  baseline = await prisma.feedback.count();
  console.log(`baseline: ${baseline} row(s), id watermark ${watermark}`);
  console.log("");

  // ── The instrument: the client must not hardcode the vocabulary.
  const inst = await fetch(`${API}/api/feedback/instrument`);
  check(inst.status === 200, "GET /api/feedback/instrument -> 200", `got ${inst.status}`);
  const instBody = await inst.json();
  check(
    Array.isArray(instBody.ratingScale) && instBody.ratingScale.length === 5,
    "instrument exposes 5 rating points"
  );
  check(
    Array.isArray(instBody.bestTags) &&
      instBody.bestTags.length >= 4 &&
      instBody.bestTags.every((t) => t.key && t.label && t.icon),
    "every best tag arrives with a key, a label and an icon"
  );
  check(
    Array.isArray(instBody.species) && instBody.species.includes("kuku"),
    "instrument exposes species options"
  );

  // ── A real submission.
  const okRes = await post({
    source: "booth",
    rating: 5,
    best: ["ni_rahisi"],
    improve: ["mafunzo"],
    species: ["kuku"],
    comment: "PROBE",
  });
  check(okRes.status === 201, "POST a valid submission -> 201", `got ${okRes.status}`);
  const okBody = await okRes.json();

  // ── The refusals. Each of these must NOT create a row.
  const bad1 = await post({ source: "booth", rating: null, best: ["everything"], improve: [] });
  check(bad1.status === 400, "an invented tag alone is refused -> 400", `got ${bad1.status}`);

  const bad2 = await post({ source: "booth", rating: 9 });
  check(bad2.status === 400, "rating out of range is refused -> 400", `got ${bad2.status}`);

  const bad3 = await post({ source: "public_link" });
  check(bad3.status === 400, "an empty submission is refused -> 400", `got ${bad3.status}`);

  // An unknown source is NOT refused: a farmer's opinion must not be thrown
  // away over a metadata field. The invariant is that the unrecognised string
  // is never what gets stored.
  const odd = await post({ source: "carrier_pigeon", rating: 4 });
  check(odd.status === 201, "an unknown source is accepted (lenient by design)", `got ${odd.status}`);
  if (odd.status === 201) {
    const oddBody = await odd.json();
    const oddRow = await prisma.feedback.findUnique({ where: { id: oddBody.id } });
    check(
      ["in_app", "public_link", "booth"].includes(oddRow?.source),
      "the unrecognised source string is never stored raw",
      `stored ${JSON.stringify(oddRow?.source)}`
    );
  }

  // ── The store actually round-trips.
  const row = await prisma.feedback.findUnique({ where: { id: okBody.id } });
  check(!!row, "the valid submission is stored");
  check(row?.rating === 5, "rating round-trips", `got ${row?.rating}`);
  check(
    JSON.stringify(row?.best) === JSON.stringify(["ni_rahisi"]),
    "the best tag round-trips as a key",
    `got ${JSON.stringify(row?.best)}`
  );
  check(
    row?.farmId === null && row?.userId === null,
    "an anonymous submission stores no identity"
  );
  check(
    !!row?.ipHash && row.ipHash.length === 32,
    "the address is stored as a 32-char hash, never as an address"
  );

  // ── Authorisation on the admin side.
  const admin = await fetch(`${API}/api/admin/feedback`);
  check(admin.status === 401, "GET /api/admin/feedback without a token -> 401", `got ${admin.status}`);
} catch (e) {
  console.error("");
  console.error(`ERROR: ${e.message}`);
  failures.push(e.message);
} finally {
  // Unconditional. See the header: a probe that only cleans up on the happy
  // path corrupts the data it came to verify.
  const removed = await prisma.feedback.deleteMany({ where: { id: { gt: watermark } } });
  const after = await prisma.feedback.count();
  console.log("");
  console.log(`cleanup: removed ${removed.count} probe row(s); table has ${after} (baseline ${baseline})`);
  check(after === baseline, "the feedback table is back to its baseline");
  await prisma.$disconnect();
}

console.log("");
if (failures.length) {
  console.log(`FAILED (${failures.length}): ${failures.join(" | ")}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
