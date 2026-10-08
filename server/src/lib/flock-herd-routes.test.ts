import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The herd-movement routes have invariants that `tsc` cannot see and that no
 * unit test reaches, because they are about ORDER and about what must NOT
 * happen. Express happily registers a literal route after the `:id` catch-all
 * and the literal one then never runs (see route-shadowing.test.ts for the
 * Compare button this cost us). And "a merge archives rather than deletes" is
 * a property of the writes, not of any single function — the only durable way
 * to hold it is to assert it against the source.
 *
 * These are deliberately brittle-in-a-good-way: if someone later swaps the
 * archive for a delete, or drops a side of the transfer, the test says so.
 */

const serverSrc = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts: string[]): string {
  try {
    return readFileSync(join(serverSrc, ...parts), "utf8");
  } catch {
    return "";
  }
}

const src = read("routes", "flocks.ts");
const indexSource = read("index.ts");

/** Line index of the first `router.<verb>("/path")` registration. */
function routeIndex(path: string): number {
  const re = new RegExp(`router\\.(get|post|patch|delete|put)\\(\\s*"${path}"`);
  const m = re.exec(src);
  return m ? m.index : -1;
}

/** The source between two route registrations, so assertions are scoped. */
function block(from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  return a > -1 && b > a ? src.slice(a, b) : "";
}

const transferBlock = block('router.post("/transfer"', 'router.post("/merge"');
const mergeBlock = block('router.post("/merge"', 'router.post("/:id/count"');

describe("the herd routes exist and are not shadowed by /:id", () => {
  it("found the routes in the source", () => {
    // A silent empty/absent read would make every assertion below vacuous.
    expect(src.length).toBeGreaterThan(0);
    expect(indexSource.length).toBeGreaterThan(0);
  });

  it("registers /transfer and /merge before the /:id catch-all", () => {
    const byId = routeIndex("/:id");
    expect(byId).toBeGreaterThan(-1);
    expect(routeIndex("/transfer")).toBeGreaterThan(-1);
    expect(routeIndex("/merge")).toBeGreaterThan(-1);
    expect(routeIndex("/transfer")).toBeLessThan(byId);
    expect(routeIndex("/merge")).toBeLessThan(byId);
  });

  it("serves the per-group count change and the ledger", () => {
    expect(/router\.post\(\s*"\/:id\/count"/.test(src)).toBe(true);
    expect(/router\.get\(\s*"\/:id\/movements"/.test(src)).toBe(true);
  });
});

describe("a transfer writes both groups in one action", () => {
  it("writes a transfer_out row and a transfer_in row", () => {
    expect(transferBlock).toMatch(/reason:\s*"transfer_out"/);
    expect(transferBlock).toMatch(/reason:\s*"transfer_in"/);
  });

  it("updates BOTH flocks inside a single transaction", () => {
    // If the two updates could land separately, a dropped connection would
    // destroy animals: out of one group and never into the other.
    expect(transferBlock).toContain("$transaction");
    expect((transferBlock.match(/prisma\.flock\.update\(/g) || []).length).toBe(2);
  });

  it("uses the ledger's own after-count so the row and the count cannot disagree", () => {
    expect(transferBlock).toMatch(/currentCount:\s*led\.from\.countAfter/);
    expect(transferBlock).toMatch(/currentCount:\s*led\.to\.countAfter/);
  });

  it("refuses a group that is not on this farm and a group merged away", () => {
    expect(src).toMatch(/not on this farm/);
    expect(src).toMatch(/A merged group cannot be used again/);
  });
});

describe("a merge archives, it never deletes", () => {
  it("does not delete the absorbed group", () => {
    expect(mergeBlock).not.toMatch(/flock\.delete/);
  });

  it("archives it and empties its count", () => {
    expect(mergeBlock).toMatch(/status:\s*"merged"/);
    expect(mergeBlock).toMatch(/currentCount:\s*0/);
  });

  it("writes merged_in and merged_out rows", () => {
    expect(mergeBlock).toMatch(/reason:\s*"merged_in"/);
    expect(mergeBlock).toMatch(/reason:\s*"merged_out"/);
  });

  it("re-parents animals and their records, not just the count", () => {
    for (const model of ["animal", "vaccination", "breeding", "healthRecord", "insurancePolicy"]) {
      expect(mergeBlock).toMatch(new RegExp(`tx\\.${model}\\.updateMany`));
    }
  });

  it("asks before combining two different species", () => {
    expect(mergeBlock).toMatch(/confirmMixedSpecies/);
    expect(mergeBlock).toMatch(/needsConfirmation/);
  });
});

describe("archived groups leave the active list", () => {
  it("filters status merged out of the list endpoint", () => {
    expect(src).toMatch(/status:\s*\{\s*not:\s*"merged"\s*\}/);
  });
});

describe("offline replay of livestock writes is idempotent", () => {
  it("guards /api/flocks and /api/animals like the other replayable writes", () => {
    expect(indexSource).toMatch(/app\.use\(\s*"\/api\/flocks",\s*idempotencyGuard/);
    expect(indexSource).toMatch(/app\.use\(\s*"\/api\/animals",\s*idempotencyGuard/);
  });
});
