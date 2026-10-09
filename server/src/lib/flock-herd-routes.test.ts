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

  it("writes the §20 movement record for the animals it moved", () => {
    // The count ledger says the GROUPS changed size. This says WHICH animals
    // moved and where they went — so the farmer describes the move once, by
    // pointing at the animal, and is not sent to the movement form afterwards.
    expect(transferBlock).toMatch(/animalMovement\.createMany/);
    expect(transferBlock).toMatch(/fromPremises:\s*from\.name/);
    expect(transferBlock).toMatch(/toPremises:\s*to\.name/);
  });

  it("takes that reason from the shared vocabulary, not a literal", () => {
    // A bare "group_move" here could drift from the value the UI labels and the
    // export prints. lib/animal-movement.ts owns the word.
    expect(transferBlock).toMatch(/reason:\s*GROUP_MOVE_REASON/);
    expect(src).toMatch(/from "\.\.\/lib\/animal-movement\.js"/);
  });

  it("does not flip the animals' status — a group move is not leaving the farm", () => {
    expect(transferBlock).not.toMatch(/status:\s*"moved"/);
  });

  it("writes it inside the same transaction as the counts", () => {
    // Half a move — animals re-parented but the chain not written, or the other
    // way round — is worse than either one alone.
    const txStart = transferBlock.indexOf("$transaction");
    const movementWrite = transferBlock.indexOf("animalMovement");
    expect(txStart).toBeGreaterThan(-1);
    expect(movementWrite).toBeGreaterThan(txStart);
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

describe("the ANITRAC panel's group move rides the transfer route", () => {
  const panel = read(
    "..",
    "..",
    "wangari-next",
    "src",
    "components",
    "flocks",
    "FlockAnimalsPanel.tsx"
  );

  it("found the panel source", () => {
    // A silent empty read would make every assertion below vacuous.
    expect(panel.length).toBeGreaterThan(0);
  });

  it("moves a tagged animal by naming it, not by a head count", () => {
    // The head-count path is clamped to what the group is recorded as holding.
    // A NAMED animal must not be, or a group whose count has drifted to 0 could
    // never release an animal the farmer is looking at.
    expect(panel).toMatch(/["'`]\/api\/flocks\/transfer["'`]/);
    expect(panel).toMatch(/animalIds/);
    expect(routeIndex("/transfer")).toBeGreaterThan(-1);
  });

  it("takes the animal's own group as the source, so the farmer states it once", () => {
    expect(panel).toMatch(/fromFlockId/);
    expect(panel).toMatch(/a\.flock\?\.id\s*\?\?\s*flockId/);
  });

  it("can name the server-written group move, so the farmer never sees a raw reason", () => {
    // `group_move` is not in the picker (a group is not a premises), but it IS
    // written onto the animal's chain by the server — so the panel has to be
    // able to label it, or the history reads "group_move".
    expect(panel).toMatch(/group_move:\s*"[^"]+"/);
  });

  it("calls every endpoint with the /api prefix", () => {
    // Four calls in this panel once went out without /api, 404'd, and left the
    // entire feature dead while the suite stayed green (docs/gap-analysis.md).
    // Only literal paths are checked, and only ones that name an API resource.
    const literals = [...panel.matchAll(/["'`](\/[^"'`\s]*)/g)].map((m) => m[1]);
    const apiPaths = literals.filter((p) => /^\/(api|animals|flocks)/.test(p));
    expect(apiPaths.length).toBeGreaterThan(0);
    for (const path of apiPaths) {
      expect(path.startsWith("/api/")).toBe(true);
    }
  });
});

describe("offline replay of livestock writes is idempotent", () => {
  it("guards /api/flocks and /api/animals like the other replayable writes", () => {
    expect(indexSource).toMatch(/app\.use\(\s*"\/api\/flocks",\s*idempotencyGuard/);
    expect(indexSource).toMatch(/app\.use\(\s*"\/api\/animals",\s*idempotencyGuard/);
  });
});
