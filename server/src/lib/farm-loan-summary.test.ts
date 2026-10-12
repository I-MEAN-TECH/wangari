import { describe, it, expect } from "vitest";
import { summarizeFarmLoan, buildInstalmentSchedule, paidInstalmentCount, type FarmLoanSummaryInput } from "./farm-loan-summary.js";

function dmy(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function base(overrides: Partial<FarmLoanSummaryInput> = {}): FarmLoanSummaryInput {
  return {
    principal: 120_000,
    amountPaid: 30_000,
    firstInstalmentDue: new Date("2026-01-15"),
    instalmentCount: 12,
    instalmentAmount: 10_000,
    status: "active",
    today: new Date("2026-10-12"),
    ...overrides,
  };
}

describe("buildInstalmentSchedule", () => {
  it("produces one date per instalment, monthly from the first due date", () => {
    const dates = buildInstalmentSchedule(new Date("2026-01-15"), 3, 10_000);
    expect(dates).toHaveLength(3);
    expect(dmy(dates[0])).toBe("2026-01-15");
    expect(dmy(dates[1])).toBe("2026-02-15");
    expect(dmy(dates[2])).toBe("2026-03-15");
  });

  it("returns an empty list when there is no plan", () => {
    expect(buildInstalmentSchedule(null, 12, 10_000)).toEqual([]);
    expect(buildInstalmentSchedule(new Date(), null, 10_000)).toEqual([]);
    expect(buildInstalmentSchedule(new Date(), 0, 10_000)).toEqual([]);
  });
});

describe("paidInstalmentCount", () => {
  it("floors the payment to whole instalments", () => {
    expect(paidInstalmentCount(25_000, 10_000)).toBe(2);
    expect(paidInstalmentCount(30_000, 10_000)).toBe(3);
  });

  it("returns null when there is no per-instalment amount", () => {
    expect(paidInstalmentCount(30_000, null)).toBeNull();
  });
});

describe("summarizeFarmLoan", () => {
  it("reports balance and paid percentage honestly", () => {
    const s = summarizeFarmLoan(base());
    expect(s.balance).toBe(90_000);
    expect(s.paidPct).toBe(25);
  });

  it("caps amountPaid at principal so balance never goes negative", () => {
    const s = summarizeFarmLoan(base({ amountPaid: 150_000 }));
    expect(s.balance).toBe(0);
    expect(s.paidPct).toBe(100);
  });

  it("flags the next unpaid instalment", () => {
    // 30,000 paid => 3 instalments covered => instalment 4 (2026-04-15) is next
    const s = summarizeFarmLoan(base());
    expect(s.nextInstalmentDue && dmy(s.nextInstalmentDue)).toBe("2026-04-15");
  });

  it("counts missed instalments as past-due dates not covered by payments", () => {
    // today = 2026-10-12. Instalments 1-3 paid. Instalments 4-9 are past due
    // (Apr-Sep 15), instalment 10 (Oct 15) is in the future relative to Oct 12.
    // Past due unpaid: 4 (Apr), 5 (May), 6 (Jun), 7 (Jul), 8 (Aug), 9 (Sep) = 6
    const s = summarizeFarmLoan(base());
    expect(s.missedInstalments).toBe(6);
    expect(s.isArrears).toBe(true);
    expect(s.daysInArrears).toBeGreaterThan(0);
  });

  it("a loan with no instalment plan is never marked in arrears", () => {
    const s = summarizeFarmLoan(base({ firstInstalmentDue: null, instalmentCount: null, instalmentAmount: null }));
    expect(s.schedule).toEqual([]);
    expect(s.missedInstalments).toBe(0);
    expect(s.isArrears).toBe(false);
    expect(s.nextInstalmentDue).toBeNull();
    expect(s.balance).toBe(90_000);
  });

  it("a fully paid loan has no next instalment and no arrears", () => {
    const s = summarizeFarmLoan(base({ amountPaid: 120_000, status: "settled" }));
    expect(s.nextInstalmentDue).toBeNull();
    expect(s.missedInstalments).toBe(0);
    expect(s.isArrears).toBe(false);
    expect(s.balance).toBe(0);
  });

  it("marks each schedule line as paid or missed consistently", () => {
    const s = summarizeFarmLoan(base({ amountPaid: 20_000 }));
    expect(s.schedule[0].paid).toBe(true); // instalment 1
    expect(s.schedule[1].paid).toBe(true); // instalment 2
    expect(s.schedule[2].paid).toBe(false); // instalment 3, due 2026-03-15 < today => missed
    expect(s.schedule[2].missed).toBe(true);
  });
});
