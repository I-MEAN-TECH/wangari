import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Batches are sub-groups inside ONE flock — "the original 300" vs "the 200
 * bought in October" — for a farmer who wants a single flock total but still
 * wants to tell the two apart internally. Same reasoning as
 * flock-herd-routes.test.ts: Express route ORDER and "archive, don't delete"
 * are properties of the source, not of any pure function, so they are pinned
 * here by reading the route file directly.
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

function routeIndex(method: string, path: string): number {
  const re = new RegExp(`router\\.${method}\\(\\s*"${path.replace(/[/:]/g, (c) => `\\${c}`)}"`);
  const m = re.exec(src);
  return m ? m.index : -1;
}

function block(from: string, to: string): string {
  const a = src.indexOf(from);
  const b = to ? src.indexOf(to) : src.length;
  return a > -1 && b > a ? src.slice(a, b) : "";
}

describe("batch routes exist and are not shadowed by /:id", () => {
  it("found the routes in the source", () => {
    expect(src.length).toBeGreaterThan(0);
    expect(indexSource.length).toBeGreaterThan(0);
  });

  it("registers every batch route before the /:id catch-all", () => {
    const byId = routeIndex("get", "/:id");
    expect(byId).toBeGreaterThan(-1);
    expect(routeIndex("get", "/:id/batches")).toBeGreaterThan(-1);
    expect(routeIndex("post", "/:id/batches")).toBeGreaterThan(-1);
    expect(routeIndex("patch", "/batches/:batchId")).toBeGreaterThan(-1);
    expect(routeIndex("post", "/batches/transfer")).toBeGreaterThan(-1);
    expect(routeIndex("post", "/batches/merge")).toBeGreaterThan(-1);
    expect(routeIndex("delete", "/batches/:batchId")).toBeGreaterThan(-1);

    for (const idx of [
      routeIndex("get", "/:id/batches"),
      routeIndex("post", "/:id/batches"),
      routeIndex("patch", "/batches/:batchId"),
      routeIndex("post", "/batches/transfer"),
      routeIndex("post", "/batches/merge"),
      routeIndex("delete", "/batches/:batchId"),
    ]) {
      expect(idx).toBeLessThan(byId);
    }
  });
});

describe("a flock merge can keep the absorbed group as a batch instead of flattening it away", () => {
  const mergeBlock = block('router.post("/merge"', 'router.post("/:id/count"');

  it("accepts an asBatch flag", () => {
    expect(mergeBlock).toMatch(/asBatch/);
  });

  it("creates the batch BEFORE re-parenting animals, and re-parents into it in the same write", () => {
    const createIdx = mergeBlock.indexOf("tx.flockBatch.create");
    const animalMoveIdx = mergeBlock.indexOf("tx.animal.updateMany");
    expect(createIdx).toBeGreaterThan(-1);
    expect(animalMoveIdx).toBeGreaterThan(-1);
    // Creating first, then moving animals WITH batchId in the same call, is
    // what stops the target's own pre-existing batch-less animals from being
    // swept into the new batch by a later, broader "batch-less" query.
    expect(createIdx).toBeLessThan(animalMoveIdx);
    expect(mergeBlock).toMatch(/data:\s*\{\s*flockId:\s*target\.id,\s*\.\.\.\(newBatchId[^}]*\}/);
  });

  it("never re-batches the target's animals by a bare 'batch-less' filter", () => {
    // A where clause of { flockId: target.id, batchId: null } would also catch
    // animals the target already had before this merge, not just the ones
    // that just moved in. That bug must not come back.
    expect(mergeBlock).not.toMatch(/flockId:\s*target\.id,\s*batchId:\s*null/);
  });

  it("only creates a batch when head actually moved", () => {
    expect(mergeBlock).toMatch(/if\s*\(asBatch\s*&&\s*led\.target\.delta\s*>\s*0\)/);
  });

  it("can set the surviving group's location in the same transaction", () => {
    // "Three branches, now one location" — the farmer should not have to make
    // a second trip to edit the flock after merging.
    expect(mergeBlock).toMatch(/newLocation/);
    expect(mergeBlock).toMatch(/location:\s*newLocation/);
  });
});

describe("batch transfer and merge are scoped to ONE flock", () => {
  const transferBlock = block('router.post("/batches/transfer"', 'router.post("/batches/merge"');
  const mergeBlock = block('router.post("/batches/merge"', 'router.delete("/batches/:batchId"');

  it("refuses a transfer between batches of different flocks", () => {
    expect(transferBlock).toMatch(/different flocks/);
    expect(transferBlock).toMatch(/from\.flockId\s*!==\s*to\.flockId/);
  });

  it("refuses a merge between batches of different flocks", () => {
    expect(mergeBlock).toMatch(/different flocks/);
    expect(mergeBlock).toMatch(/source\.flockId\s*!==\s*target\.flockId/);
  });

  it("moves tagged animals along with a batch transfer", () => {
    expect(transferBlock).toMatch(/animal\.updateMany/);
  });

  it("a batch merge archives rather than deletes", () => {
    expect(mergeBlock).not.toMatch(/flockBatch\.delete/);
    expect(mergeBlock).toMatch(/status:\s*"merged"/);
  });
});

describe("creating a batch can record new stock in the SAME transaction", () => {
  const createBlock = block('router.post("/:id/batches"', 'router.patch("/batches/:batchId"');

  it("found the block", () => {
    expect(createBlock.length).toBeGreaterThan(200);
  });

  it("asks the caller to say whether head actually arrived", () => {
    // Two modes: relabelling stock the flock already holds, or recording an
    // arrival. The client must choose, because the two move the flock total
    // by different amounts.
    expect(createBlock).toMatch(/addToFlock/);
  });

  it("writes the flock total and the ledger row in one transaction", () => {
    // The old contract was "create the batch, then POST /:id/count from the
    // client". Two client calls are not atomic, and an offline device replays
    // them separately — so a dropped signal left a 200-bird batch inside a
    // flock still totalling 300. Both writes now share one $transaction.
    expect(createBlock).toMatch(/prisma\.\$transaction/);
    expect(createBlock).toMatch(/flockMovement\.create/);
    expect(createBlock).toMatch(/flock\.update/);
  });

  it("writes NO ledger row when the batch is only a relabel", () => {
    // A row that says something happened when nothing did is worse than no
    // row: it makes the ledger untrustworthy for the events that matter.
    const spreadIdx = createBlock.indexOf("...(addToFlock");
    expect(spreadIdx).toBeGreaterThan(-1);
    expect(createBlock).toMatch(/:\s*\[\]/);
  });

  it("refuses a zero-head arrival, pointing at relabelling instead", () => {
    expect(createBlock).toMatch(/Enter how many head arrived/);
  });

  it("validates the reason against the closed set of herd reasons", () => {
    expect(createBlock).toMatch(/isHerdReason\(reason\)/);
  });

  it("records the delta that actually landed, after clamping", () => {
    // Same rule as POST /:id/count — the ledger must reconcile with the count
    // it sits beside, so the recorded delta is the post-clamp one.
    expect(createBlock).toMatch(/delta:\s*countAfter\s*-\s*countBefore/);
  });

  it("lets the farmer say the animals were BORN, not just bought", () => {
    // Defaulting every arrival to "purchase" puts a cost against an animal
    // that cost nothing, which then reads wrong in the profit figures.
    expect(createBlock).toMatch(/req\.body\?\.reason \?\? "purchase"/);
  });

  it("refuses to record a death or a sale as a new group", () => {
    // Those are not arrivals. Calling them one would inflate the flock total
    // at the exact moment head left the farm.
    expect(createBlock).toMatch(/sale.*death|death.*sale/);
    expect(createBlock).toMatch(/Record a sale or a death against the group/);
  });
});

/**
 * The drift this closes: a death recorded against the flock ALONE drops the
 * flock total while every group keeps its old count. From then on the parts
 * do not add up to the whole, and nothing on the panel can fix it — moving
 * head between two groups leaves their sum exactly where it was.
 */
describe("a count change can be attributed to ONE group", () => {
  const countBlock = block('router.post("/:id/count"', 'router.get("/:id/movements"');

  it("found the block", () => {
    expect(countBlock.length).toBeGreaterThan(300);
  });

  it("accepts an optional batchId", () => {
    expect(countBlock).toMatch(/batchId/);
  });

  it("refuses a group that belongs to a different flock", () => {
    // Otherwise a farmer could move another flock's head by naming its batch.
    expect(countBlock).toMatch(/belongs to a different flock/);
  });

  it("moves BOTH the flock and the group in one transaction", () => {
    expect(countBlock).toMatch(/prisma\.\$transaction/);
    expect(countBlock).toMatch(/flock\.update/);
    expect(countBlock).toMatch(/flockBatch\.update/);
  });

  it("clamps the group by the SAME delta as the flock", () => {
    // If the flock clamped at zero but the group did not, the group would
    // still hold head that no longer exist.
    expect(countBlock).toMatch(/applyDelta\(batch\.currentCount,\s*delta\)/);
  });

  it("names the group in the ledger note", () => {
    // "3 died" and "3 died in Bought-in-October" are different records, and
    // only one of them is useful six months later.
    expect(countBlock).toMatch(/batch\.name/);
  });

  it("writes no group update when no group was named", () => {
    // Optional means genuinely optional — a flock with no groups keeps working.
    expect(countBlock).toMatch(/\?\s*\[prisma\.flockBatch\.update/);
    expect(countBlock).toMatch(/: \[\]/);
  });

  it("returns the group's before and after so the screen can show it", () => {
    expect(countBlock).toMatch(/countBefore:\s*batchBefore/);
    expect(countBlock).toMatch(/countAfter:\s*batchAfter/);
  });
});

describe("dissolving a batch returns its animals to the flock's general pool", () => {
  const deleteBlock = block('router.delete("/batches/:batchId"', 'router.get("/:id"');

  it("clears batchId rather than deleting the animals", () => {
    expect(deleteBlock).toMatch(/batchId:\s*null/);
    expect(deleteBlock).not.toMatch(/animal\.delete/);
  });

  it("archives the batch rather than deleting it", () => {
    expect(deleteBlock).not.toMatch(/flockBatch\.delete/);
    expect(deleteBlock).toMatch(/status:\s*"merged"/);
  });
});

describe("a flock's own batches are rejected by a merged flock's loadBatch guard", () => {
  it("refuses a merged batch the same way a merged flock is refused", () => {
    expect(src).toMatch(/A merged batch cannot be used again/);
  });
});

describe("offline replay still guards the whole /api/flocks surface, batches included", () => {
  it("the idempotency guard is mounted on the shared prefix, not per-route", () => {
    expect(indexSource).toMatch(/app\.use\(\s*"\/api\/flocks",\s*idempotencyGuard/);
  });
});
