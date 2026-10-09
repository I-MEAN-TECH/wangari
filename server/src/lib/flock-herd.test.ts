import { describe, it, expect } from "vitest";
import {
  applyDelta,
  movableHead,
  movedHead,
  transferLedger,
  mergeLedger,
  isHerdReason,
  speciesCompatible,
  HERD_REASONS,
} from "./flock-herd.js";

describe("applyDelta", () => {
  it("adds and subtracts", () => {
    expect(applyDelta(40, -7)).toBe(33);
    expect(applyDelta(40, 5)).toBe(45);
  });

  it("never goes below zero — you cannot own minus three cows", () => {
    expect(applyDelta(3, -5)).toBe(0);
    expect(applyDelta(0, -1)).toBe(0);
  });

  it("treats junk as zero rather than NaN", () => {
    expect(applyDelta(NaN, 5)).toBe(5);
    expect(applyDelta(10, NaN)).toBe(10);
  });
});

describe("movableHead", () => {
  it("cannot move more than the group holds", () => {
    expect(movableHead(3, 5)).toBe(3);
  });

  it("moves exactly what is asked when there is enough", () => {
    expect(movableHead(40, 12)).toBe(12);
  });

  it("never returns a negative move", () => {
    expect(movableHead(10, -4)).toBe(0);
    expect(movableHead(-2, 5)).toBe(0);
  });
});

describe("movedHead", () => {
  it("believes tagged animals even when the group's count is stale", () => {
    // The farmer is pointing at real animals; the count saying zero must not
    // block the move — that is the two-step this exists to remove.
    expect(movedHead({ available: 0, requested: 1, identified: 1 })).toBe(1);
    expect(movedHead({ available: 3, requested: 5, identified: 5 })).toBe(5);
  });

  it("clamps a bare head count to what the group is recorded as holding", () => {
    expect(movedHead({ available: 3, requested: 5, identified: null })).toBe(3);
    expect(movedHead({ available: 40, requested: 12, identified: null })).toBe(12);
  });

  it("never returns a negative or fractional move", () => {
    expect(movedHead({ available: 10, requested: 4, identified: -4 })).toBe(0);
    expect(movedHead({ available: 10, requested: 4, identified: 2.7 })).toBe(2);
  });

  it("a tagged move still cannot push the count below zero", () => {
    // Believing the animals does not license a negative herd: the clamp lives
    // in transferLedger, on both sides of the event.
    const moved = movedHead({ available: 3, requested: 5, identified: 5 });
    const { from, to } = transferLedger(3, 0, moved);
    expect(from.countAfter).toBe(0);
    expect(to.countAfter).toBe(5);
    // The two sides still agree on how many animals moved.
    expect(from.delta).toBe(-5);
    expect(to.delta).toBe(5);
  });
});

describe("a transfer conserves the farm's total head count", () => {
  it("the source delta is the exact negative of the target delta", () => {
    const { from, to } = transferLedger(40, 12, 7);
    expect(from.delta).toBe(-7);
    expect(to.delta).toBe(7);
    expect(from.delta + to.delta).toBe(0);
    expect(from.countAfter).toBe(33);
    expect(to.countAfter).toBe(19);
  });

  it("conserves the total even when the source count is understated", () => {
    // Farmer recorded 3 but is moving 5 — we move what exists and clamp.
    const moved = movableHead(3, 5);
    const { from, to } = transferLedger(3, 0, moved);
    expect(from.countAfter).toBe(0);
    expect(to.countAfter).toBe(3);
    expect(from.countAfter + to.countAfter).toBe(3);
  });
});

describe("a merge conserves head count and empties the source", () => {
  it("target gains exactly what the source held", () => {
    const { source, target } = mergeLedger(25, 40);
    expect(source.countAfter).toBe(0);
    expect(source.delta).toBe(-25);
    expect(target.countAfter).toBe(65);
    expect(target.delta).toBe(25);
    expect(source.countAfter + target.countAfter).toBe(65);
  });

  it("a merge of an empty group changes nothing", () => {
    const { source, target } = mergeLedger(0, 40);
    expect(source.delta).toBe(0);
    expect(target.countAfter).toBe(40);
  });
});

describe("herd reasons", () => {
  it("is a closed set so the ledger cannot drift into synonyms", () => {
    expect([...HERD_REASONS]).toContain("transfer_in");
    expect([...HERD_REASONS]).toContain("merged_out");
    expect(new Set(HERD_REASONS).size).toBe(HERD_REASONS.length);
  });

  it("rejects free text", () => {
    expect(isHerdReason("bought")).toBe(false);
    expect(isHerdReason("purchase")).toBe(true);
    expect(isHerdReason(7)).toBe(false);
  });
});

describe("mixed-species guard", () => {
  it("allows a merge of the same category", () => {
    expect(speciesCompatible("cattle", "cattle").compatible).toBe(true);
  });

  it("allows a merge when a category is unknown — absent data must not block", () => {
    expect(speciesCompatible(null, "cattle").compatible).toBe(true);
    expect(speciesCompatible("poultry", undefined).compatible).toBe(true);
  });

  it("flags differing categories with a note", () => {
    const r = speciesCompatible("poultry", "cattle");
    expect(r.compatible).toBe(false);
    expect(r.note).toMatch(/cattle/);
  });
});
