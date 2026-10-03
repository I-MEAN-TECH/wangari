import { describe, it, expect } from "vitest";
import {
  aggregateGroup,
  describeGroupHealth,
  memberActivity,
  SUPPRESS_BELOW,
  ACTIVITY_WINDOW_DAYS,
  type MemberRow,
} from "./coop-aggregate.js";

function member(over: Partial<MemberRow> = {}): MemberRow {
  return {
    farmId: 1,
    activeDays: 10,
    outputQuantity: 100,
    animalCount: 5,
    cropCount: 2,
    moneyMoved: 5000,
    ...over,
  };
}

describe("aggregateGroup — privacy", () => {
  it("withholds every figure for a group of two", () => {
    // THE reason this module exists. With 2 members, total - own = the other
    // member's exact figure. Emitting the total here IS a privacy breach.
    const agg = aggregateGroup([member(), member({ farmId: 2 })]);
    expect(agg.suppressed).toBe(true);
    expect(agg.totalMoneyMoved).toBe(0);
    expect(agg.totalOutput).toBe(0);
    expect(agg.suppressionReason).toBeTruthy();
  });

  it("withholds for a group of one", () => {
    const agg = aggregateGroup([member()]);
    expect(agg.suppressed).toBe(true);
    expect(agg.totalMoneyMoved).toBe(0);
  });

  it("still counts members even while the figures are withheld", () => {
    // A chair must be able to see who has joined, or the group looks empty and
    // they conclude the feature is broken.
    const agg = aggregateGroup([member(), member({ farmId: 2 })]);
    expect(agg.memberCount).toBe(2);
  });

  it("releases figures at exactly the threshold", () => {
    const rows = Array.from({ length: SUPPRESS_BELOW }, (_, i) => member({ farmId: i + 1 }));
    const agg = aggregateGroup(rows);
    expect(agg.suppressed).toBe(false);
    expect(agg.suppressionReason).toBeNull();
    expect(agg.totalMoneyMoved).toBe(SUPPRESS_BELOW * 5000);
  });

  it("emits no per-member figure at any group size", () => {
    // Scan the returned object: a chair-facing payload must not carry anything
    // that identifies or characterises an individual member.
    for (const n of [1, 2, 3, 10, 50]) {
      const rows = Array.from({ length: n }, (_, i) => member({ farmId: i + 1 }));
      const agg: Record<string, unknown> = aggregateGroup(rows);
      for (const [key, value] of Object.entries(agg)) {
        expect(Array.isArray(value), `${key} must not be a list`).toBe(false);
        // `typeof null === "object"`, so nulls must be excluded before the
        // object check or every optional field trips it.
        if (value !== null) {
          expect(typeof value, `${key} must not be a member-level object`).not.toBe("object");
        }
      }
    }
  });

  it("never includes a farmId in its output", () => {
    const agg = aggregateGroup([member({ farmId: 4242 }), member({ farmId: 7 })]);
    expect(JSON.stringify(agg)).not.toContain("4242");
  });
});

describe("aggregateGroup — arithmetic", () => {
  it("sums the group", () => {
    const rows = [
      member({ activeDays: 20, outputQuantity: 300, animalCount: 10, cropCount: 1, moneyMoved: 40000 }),
      member({ activeDays: 15, outputQuantity: 200, animalCount: 6, cropCount: 3, moneyMoved: 25000 }),
      member({ activeDays: 5, outputQuantity: 100, animalCount: 2, cropCount: 0, moneyMoved: 5000 }),
    ];
    const agg = aggregateGroup(rows);
    expect(agg.suppressed).toBe(false);
    expect(agg.totalOutput).toBe(600);
    expect(agg.totalAnimals).toBe(18);
    expect(agg.totalCrops).toBe(4);
    expect(agg.totalMoneyMoved).toBe(70000);
  });

  it("counts only members who recorded as active", () => {
    const agg = aggregateGroup([
      member({ activeDays: 10 }),
      member({ activeDays: 0 }),
      member({ activeDays: 3 }),
    ]);
    expect(agg.memberCount).toBe(3);
    expect(agg.activeMemberCount).toBe(2);
    expect(agg.activityRate).toBeCloseTo(2 / 3);
  });

  it("returns a null activity rate for an empty group rather than NaN", () => {
    const agg = aggregateGroup([]);
    expect(agg.memberCount).toBe(0);
    expect(agg.activityRate).toBeNull();
    expect(agg.suppressed).toBe(true);
    expect(Number.isNaN(agg.activityRate as unknown as number)).toBe(false);
  });

  // Postgres NUMERIC arrives as a string. The first version of the sum did
  // `rows.reduce((s, r) => s + r.moneyMoved, 0)` and rendered "KES NaN".
  it("adds values that arrive as numeric strings", () => {
    const agg = aggregateGroup([
      member({ activeDays: 1, moneyMoved: "1000.50" as unknown as number }),
      member({ activeDays: 1, moneyMoved: "2000.25" as unknown as number }),
      member({ activeDays: 1, moneyMoved: "500.25" as unknown as number }),
    ]);
    expect(agg.totalMoneyMoved).toBe(3501);
    expect(Number.isNaN(agg.totalMoneyMoved)).toBe(false);
  });

  it("treats an unusable value as zero instead of poisoning the total", () => {
    const agg = aggregateGroup([
      member({ activeDays: 1, moneyMoved: "not a number" as unknown as number }),
      member({ activeDays: 1, moneyMoved: 1000 }),
      member({ activeDays: 1, moneyMoved: 1000 }),
    ]);
    expect(agg.totalMoneyMoved).toBe(2000);
  });

  it("keeps negatives out of a count column", () => {
    // A corrupt -5 animal count should not make the chair believe the co-op
    // has fewer animals than it does.
    const agg = aggregateGroup([
      member({ activeDays: 1, animalCount: -5 }),
      member({ activeDays: 1, animalCount: 4 }),
      member({ activeDays: 1, animalCount: 3 }),
    ]);
    expect(agg.totalAnimals).toBe(2);
  });
});

describe("memberActivity", () => {
  it("calls a member with days in the window active", () => {
    expect(memberActivity(10)).toBe("active");
    expect(memberActivity(ACTIVITY_WINDOW_DAYS)).toBe("active");
  });

  it("calls a member with a couple of days quiet", () => {
    expect(memberActivity(1)).toBe("quiet");
    expect(memberActivity(2)).toBe("quiet");
    expect(memberActivity(6)).toBe("quiet");
  });

  it("needs a quarter of the window before calling a member active", () => {
    expect(memberActivity(7)).toBe("active"); // floor(30 * 0.25)
    expect(memberActivity(6)).toBe("quiet");
  });

  it("calls a member with no days silent", () => {
    expect(memberActivity(0)).toBe("silent");
    expect(memberActivity(-3)).toBe("silent");
    expect(memberActivity(NaN)).toBe("silent");
  });

  // Volume-blind on purpose: a small consistent farmer is as bankable as a
  // large erratic one, and a chair must not learn to chase only the big.
  it("gives the same verdict to a small regular and a large erratic member", () => {
    const consistent = member({ activeDays: 20, moneyMoved: 4000 });
    const erratic = member({ activeDays: 20, moneyMoved: 900000 });
    expect(memberActivity(consistent.activeDays)).toBe(memberActivity(erratic.activeDays));
  });
});

describe("describeGroupHealth", () => {
  it("invites a first invite when there are no members", () => {
    expect(describeGroupHealth(aggregateGroup([]))).toContain("invite");
  });

  it("explains the suppression instead of showing blanks", () => {
    const msg = describeGroupHealth(aggregateGroup([member(), member({ farmId: 2 })]));
    expect(msg).toMatch(/once 3 members/i);
  });

  it("states how many members recorded once released", () => {
    // 4 members, only 3 recording: the chair must see who is missing.
    const rows = [
      member({ farmId: 1, activeDays: 10 }),
      member({ farmId: 2, activeDays: 10 }),
      member({ farmId: 3, activeDays: 10 }),
      member({ farmId: 4, activeDays: 0 }),
    ];
    const msg = describeGroupHealth(aggregateGroup(rows));
    expect(msg).toContain("3 of 4");
  });

  it("never contains a currency figure", () => {
    // The health line is shown next to the totals; leaking an amount here
    // would bypass the suppression flag above.
    for (const n of [1, 2, 3, 5]) {
      const rows = Array.from({ length: n }, (_, i) => member({ farmId: i + 1 }));
      expect(describeGroupHealth(aggregateGroup(rows))).not.toMatch(/KES|\d{3,}/);
    }
  });
});