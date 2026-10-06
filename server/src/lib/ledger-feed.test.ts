import { describe, it, expect } from "vitest";

/**
 * Allocating a shared feed bill to the flocks that ate it.
 *
 * ## The bug this pins
 *
 * A farmer logs one expense: `animal_feed`, KES 30,000, not tied to any flock.
 * Meanwhile `DailyProduction.feedUsed` tells us three flocks ate it. The
 * obvious next step is to spread the 30,000 across those flocks by kilos
 * consumed — and that is exactly where the old code went wrong:
 *
 *     e.feedCost = (kg / totalFeedKg) * max(totalFeedExpense, e.feedCost);
 *
 * It **set** the flock's feed cost and left the original expense sitting on
 * "general" untouched. So the flocks reported 30,000 of feed and the farm
 * still reported 30,000 of feed. `summary.totalCosts` read **60,000 for a
 * 30,000 bill**, and every margin on the screen was computed against it.
 *
 * A farmer reading a profit figure that is wrong by the size of his largest
 * cost line is worse off than one reading no figure at all. So the rule is:
 *
 *   **allocation MOVES cost. It never creates it.**
 *
 * The invariant every test below defends: the sum of feedCost across all
 * enterprises is identical before and after.
 */

import { allocateFeedPool, type FeedAllocatable } from "./ledger-feed.js";

const sum = (xs: FeedAllocatable[]) => xs.reduce((s, x) => s + x.feedCost, 0);

const ent = (
  key: string,
  kind: FeedAllocatable["kind"],
  feedCost: number,
  kgConsumed = 0
): FeedAllocatable => ({ key, kind, feedCost, kgConsumed });

describe("the invariant — allocation never changes the total", () => {
  it("keeps the farm's feed total identical when splitting one bill", () => {
    const items = [
      ent("general", "general", 30000),
      ent("flock-1", "flock", 0, 100),
      ent("flock-2", "flock", 0, 200),
    ];
    const after = allocateFeedPool(items);
    const total = items.reduce((s, i) => s + after.get(i.key)!, 0);
    expect(total).toBe(sum(items));
    expect(sum(items)).toBe(30000);
  });

  it("does not double-count when only one flock consumed anything", () => {
    const items = [
      ent("general", "general", 30000),
      ent("flock-1", "flock", 0, 500),
    ];
    const after = allocateFeedPool(items);
    expect(after.get("flock-1")).toBe(30000);
    expect(after.get("general")).toBe(0);
    const total = [...after.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(30000);
  });
});

describe("the split follows kilos consumed", () => {
  it("gives a third and two thirds for 100kg and 200kg", () => {
    const items = [
      ent("general", "general", 30000),
      ent("flock-1", "flock", 0, 100),
      ent("flock-2", "flock", 0, 200),
    ];
    const after = allocateFeedPool(items);
    expect(after.get("flock-1")).toBeCloseTo(10000, 6);
    expect(after.get("flock-2")).toBeCloseTo(20000, 6);
    expect(after.get("general")).toBeCloseTo(0, 6);
  });

  it("splits evenly when both flocks ate the same", () => {
    const items = [
      ent("general", "general", 1000),
      ent("flock-1", "flock", 0, 50),
      ent("flock-2", "flock", 0, 50),
    ];
    const after = allocateFeedPool(items);
    expect(after.get("flock-1")).toBeCloseTo(500, 6);
    expect(after.get("flock-2")).toBeCloseTo(500, 6);
  });
});

describe("a flock that already has its own feed cost is left alone", () => {
  it("does not allocate to an already-attributed flock, and its cost is untouched", () => {
    const items = [
      ent("general", "general", 30000),
      ent("flock-1", "flock", 5000, 100), // already has its own feed expense
      ent("flock-2", "flock", 0, 100),
    ];
    const after = allocateFeedPool(items);
    expect(after.get("flock-1")).toBe(5000);
    // flock-2 takes the whole pool, since it is the only unattributed consumer.
    expect(after.get("flock-2")).toBe(30000);
    const total = [...after.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(35000);
  });
});

describe("nothing to do means change nothing", () => {
  it("returns the input unchanged when no flock consumed any feed", () => {
    const items = [ent("general", "general", 30000), ent("flock-1", "flock", 0, 0)];
    const after = allocateFeedPool(items);
    expect(after.get("general")).toBe(30000);
    expect(after.get("flock-1")).toBe(0);
  });

  it("returns the input unchanged when there is no pool to allocate", () => {
    const items = [ent("flock-1", "flock", 0, 100), ent("flock-2", "flock", 0, 100)];
    const after = allocateFeedPool(items);
    expect(after.get("flock-1")).toBe(0);
    expect(after.get("flock-2")).toBe(0);
  });

  it("handles an empty list without throwing", () => {
    expect(() => allocateFeedPool([])).not.toThrow();
    expect(allocateFeedPool([]).size).toBe(0);
  });
});

describe("the deduction never drives a holder negative", () => {
  it("floors each holder at zero when the pool is spread across several holders", () => {
    const items = [
      ent("general", "general", 100),
      ent("crop-1", "crop", 200),
      ent("flock-1", "flock", 0, 300),
    ];
    const after = allocateFeedPool(items);
    for (const v of after.values()) expect(v).toBeGreaterThanOrEqual(0);
    const total = [...after.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(300);
  });
});

describe("a single result never exceeds what was actually spent", () => {
  it("caps the allocated amount at the pool", () => {
    const items = [
      ent("general", "general", 1000),
      ent("flock-1", "flock", 0, 100),
      ent("flock-2", "flock", 0, 100),
    ];
    const after = allocateFeedPool(items);
    expect(after.get("flock-1")!).toBeLessThanOrEqual(1000);
    expect(after.get("flock-2")!).toBeLessThanOrEqual(1000);
  });
});
