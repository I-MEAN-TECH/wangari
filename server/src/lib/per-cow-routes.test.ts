import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Per-cow capture has invariants `tsc` cannot see, and they are the ones that
 * cost real money if they drift:
 *
 *  - **Per-cow rows must never be written into `daily_production`.** That table
 *    is uniquely keyed on `(flock_id, date)` and the daily ritual upserts
 *    against it. A nullable `animal_id` on it looks harmless and is not: a
 *    unique index treats NULLs as distinct, so the flock-level rows would stop
 *    being guarded and every daily upsert would start inserting duplicates.
 *    This is not hypothetical — it is what an earlier pass of this very work
 *    did, and the test exists so it cannot come back.
 *  - **The upsert key must match the schema's unique key.** A mismatch is a
 *    runtime crash in production and invisible in types.
 *  - **A per-cow write must be scoped to the farm.** Otherwise an animalId from
 *    another farm writes a yield row into a stranger's herd.
 *  - **The date must be pinned to a day** before it becomes part of that key,
 *    or the same calendar day with a clock time is a different row.
 *
 * These assert against the source, like flock-herd-routes.test.ts, because
 * they are properties of the writes and of route ORDER, not of any function.
 */

const serverSrc = join(dirname(fileURLToPath(import.meta.url)), "..");
// `prisma/` and `migrations/` sit one level above `src/`, not inside it.
const serverRoot = join(serverSrc, "..");

function read(...parts: string[]): string {
  try {
    // Line endings are normalised: the working tree is CRLF on Windows and a
    // multi-line assertion would otherwise fail for the wrong reason.
    return readFileSync(join(serverSrc, ...parts), "utf8").replace(/\r\n/g, "\n");
  } catch {
    return "";
  }
}

function readRoot(...parts: string[]): string {
  try {
    return readFileSync(join(serverRoot, ...parts), "utf8").replace(/\r\n/g, "\n");
  } catch {
    return "";
  }
}

const src = read("routes", "production.ts");
const schema = readRoot("prisma", "schema.prisma");
const migration = readRoot(
  "prisma", "migrations", "20261012100000_dairy_quality_payments", "migration.sql",
);

/** The model block for a named Prisma model. */
function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return "";
  const end = schema.indexOf("\n}", start);
  return end > start ? schema.slice(start, end) : "";
}

/** The source between two route registrations, so assertions stay scoped. */
function block(from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  return a > -1 && b > a ? src.slice(a, b) : "";
}

const postAnimal = block('router.post("/animal"', 'router.delete("/animal/:id"');
const getAnimals = block('router.get("/animals"', 'router.get("/repro"');
const getRepro = block('router.get("/repro"', "export default router");

describe("per-cow capture is its own table, not a nullable column", () => {
  it("reads the files (an empty read would make every assertion vacuous)", () => {
    expect(src.length).toBeGreaterThan(0);
    expect(schema.length).toBeGreaterThan(0);
    expect(migration.length).toBeGreaterThan(0);
  });

  it("keeps animal_id OFF daily_production — the nightly flock upsert depends on that key", () => {
    expect(modelBlock("DailyProduction")).not.toContain("animalId");
    expect(modelBlock("DailyProduction")).toContain("@@unique([flockId, date])");
    expect(migration).not.toContain("daily_production\" ADD COLUMN \"animal_id");
  });

  it("keys per-cow rows by animal + day + milking, with every part NOT NULL or defaulted", () => {
    const model = modelBlock("AnimalProduction");
    expect(model).toContain("@@unique([animalId, date, session])");
    // The reason the key holds: no nullable member.
    expect(model).toContain("@default(\"full_day\")");
    expect(migration).toContain("CREATE UNIQUE INDEX \"animal_production_animal_id_date_session_key\"");
    expect(migration).toContain("CREATE TABLE \"animal_production\"");
  });

  it("uses the exact compound key the schema declares in its upsert", () => {
    expect(postAnimal).toContain("animalId_date_session");
  });
});

describe("POST /api/production/animal — recording one cow's milking", () => {
  it("validates the animal belongs to THIS farm before writing", () => {
    expect(postAnimal).toContain("prisma.animal.findFirst");
    expect(postAnimal).toContain("farmId: req.user!.farmId!");
    expect(postAnimal).toContain("animalId is not an animal on this farm");
  });

  it("pins the date to a day before it becomes part of the key", () => {
    expect(src).toContain("Date.UTC(d.getUTCFullYear()");
    expect(postAnimal).toContain("const day = dayOf(");
  });

  it("refuses a negative litre figure instead of storing a minus", () => {
    expect(postAnimal).toContain("litres < 0");
    expect(postAnimal).toContain("400");
  });

  it("corrects a re-posted milking rather than adding a second row", () => {
    expect(postAnimal).toContain("prisma.animalProduction.upsert");
  });

  it("scopes the delete to the farm, so one farm cannot clear another's row", () => {
    const del = block('router.delete("/animal/:id"', 'router.get("/animals"');
    expect(del).toContain("prisma.animalProduction.deleteMany");
    expect(del).toContain("farmId: req.user!.farmId!");
  });

  it("registers the per-cow routes before the /:id catch-all", () => {
    const byId = src.indexOf('router.delete("/:id"');
    expect(byId).toBeGreaterThan(-1);
    expect(src.indexOf('router.post("/animal"')).toBeLessThan(byId);
    expect(src.indexOf('router.delete("/animal/:id"')).toBeLessThan(byId);
  });
});

describe("the two grains of fact stay apart", () => {
  it("never writes to daily_production from a per-cow endpoint", () => {
    const perCow = postAnimal + block('router.delete("/animal/:id"', "export default router");
    expect(perCow).not.toContain("dailyProduction.upsert");
    expect(perCow).not.toContain("dailyProduction.update");
  });

  it("reads the flock total only to measure coverage, never to derive a per-cow figure", () => {
    expect(getAnimals).toContain("milkCollected");
    // The arithmetic itself is the lib's, and the lib is what the route calls.
    expect(getAnimals).toContain("coverage(herd, milking,");
    expect(getAnimals).toContain("herdSummary(herd, milking, days)");
  });

  it("keeps an unrecorded cow in the herd list rather than dropping her", () => {
    expect(getAnimals).toContain("summary.cows.map");
  });
});

describe("the routes delegate their maths to the tested libs", () => {
  it("imports the per-cow lib rather than growing its own copy", () => {
    expect(src).toContain('from "../lib/per-cow-yield.js"');
  });

  it("imports the reproduction lib, which had no route at all before this", () => {
    expect(src).toContain('from "../lib/repro-timeline.js"');
    expect(getRepro).toContain("herdRepro(events)");
    expect(getRepro).toContain("allCows(events)");
  });

  it("scopes the reproduction timeline to the farm", () => {
    expect(getRepro).toContain("prisma.breeding.findMany");
    expect(getRepro).toContain("farmId: req.user!.farmId!");
  });
});
