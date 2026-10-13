import { describe, it, expect } from "vitest";
import {
  withdrawalStatus,
  isInsideWithdrawal,
  activeWithdrawals,
  unrecordedWithdrawals,
  withdrawalAdvice,
  type WithdrawalRecord,
} from "./withdrawal.js";

const DAY = 86400000;
const on = new Date("2026-10-13T09:00:00Z");

function rec(overrides: Partial<WithdrawalRecord> = {}): WithdrawalRecord {
  return {
    id: 1,
    animalId: 7,
    flockId: 2,
    condition: "mastitis",
    action: "Intramammary tube",
    observedAt: new Date("2026-10-10T00:00:00Z"),
    withdrawalUntil: new Date("2026-10-16T00:00:00Z"),
    withdrawalNote: "milk 5 days",
    ...overrides,
  };
}

describe("withdrawalStatus", () => {
  it("counts the last protected day as still inside the window", () => {
    // The window ENDS on the stored date. Getting this off by one is a rejected
    // consignment, so it is asserted on the boundary itself.
    const s = withdrawalStatus(rec({ withdrawalUntil: new Date("2026-10-13T00:00:00Z") }), on);
    expect(s.state).toBe("inside");
    expect(s.daysRemaining).toBe(1);
  });

  it("clears on the day after", () => {
    const s = withdrawalStatus(rec({ withdrawalUntil: new Date("2026-10-12T00:00:00Z") }), on);
    expect(s.state).toBe("cleared");
    expect(s.daysRemaining).toBe(0);
  });

  it("reports an unrecorded window rather than assuming it is safe", () => {
    const s = withdrawalStatus(rec({ withdrawalUntil: null }), on);
    expect(s.state).toBe("unrecorded");
    expect(s.daysRemaining).toBeNull();
    expect(isInsideWithdrawal(s.record, on)).toBe(false);
  });

  it("counts whole days from a mid-day timestamp without drifting", () => {
    // 2026-10-13 09:00 against a window ending 2026-10-16: today plus three.
    const s = withdrawalStatus(rec(), on);
    expect(s.daysRemaining).toBe(4);
    const threeDays = withdrawalStatus(rec(), new Date(on.getTime() + 3 * DAY));
    expect(threeDays.daysRemaining).toBe(1);
  });
});

describe("activeWithdrawals", () => {
  it("returns only the animals still inside, soonest to clear first", () => {
    const rows = [
      rec({ id: 1, animalId: 1, withdrawalUntil: new Date("2026-10-20T00:00:00Z") }),
      rec({ id: 2, animalId: 2, withdrawalUntil: new Date("2026-10-14T00:00:00Z") }),
      rec({ id: 3, animalId: 3, withdrawalUntil: new Date("2026-10-01T00:00:00Z") }),
      rec({ id: 4, animalId: 4, withdrawalUntil: null }),
    ];
    const active = activeWithdrawals(rows, on);
    expect(active.map((s) => s.record.animalId)).toEqual([2, 1]);
  });

  it("lists treatments with no date so they can be chased", () => {
    const rows = [rec({ id: 9, withdrawalUntil: null }), rec({ id: 10 })];
    expect(unrecordedWithdrawals(rows, on).map((s) => s.record.id)).toEqual([9]);
  });
});

describe("withdrawalAdvice", () => {
  it("says nothing about a product the window does not protect", () => {
    // A maize delivery has no withdrawal rule. A generic warning here would teach
    // the farmer to ignore the one that matters.
    const advice = withdrawalAdvice([rec()], "maize", on);
    expect(advice.blocked).toBe(false);
    expect(advice.message).toBeNull();
  });

  it("blocks the sale and names the date the first animal clears", () => {
    const advice = withdrawalAdvice([rec()], "milk", on);
    expect(advice.blocked).toBe(true);
    expect(advice.animals).toHaveLength(1);
    expect(advice.message).toContain("do not sell this milk yet");
    expect(advice.message).toContain("2026-10-16");
  });

  it("advises asking the vet when a recent treatment has no date", () => {
    const advice = withdrawalAdvice([rec({ withdrawalUntil: null })], "milk", on);
    expect(advice.blocked).toBe(false);
    expect(advice.unrecorded).toHaveLength(1);
    expect(advice.message).toContain("ask your vet");
  });

  it("ignores an unrecorded treatment from long ago", () => {
    // Outside the 30-day window it is no longer plausibly relevant, and dragging
    // every historical record into today's warning is how a warning gets tuned out.
    const old = rec({ withdrawalUntil: null, observedAt: new Date("2026-06-01T00:00:00Z") });
    const advice = withdrawalAdvice([old], "milk", on);
    expect(advice.unrecorded).toHaveLength(0);
    expect(advice.message).toBeNull();
  });

  it("prefers the blocked warning over the unrecorded one", () => {
    const advice = withdrawalAdvice([rec(), rec({ id: 2, withdrawalUntil: null })], "eggs", on);
    expect(advice.blocked).toBe(true);
    expect(advice.unrecorded).toHaveLength(1);
    expect(advice.message).toContain("do not sell these eggs yet");
  });
});
