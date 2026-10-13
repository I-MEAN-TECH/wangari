import { describe, it, expect } from "vitest";
import {
  outstandingOn,
  scoreMatch,
  proposeMatches,
  reconciliationSummary,
  type IncomeTransaction,
  type OpenDelivery,
} from "./reconciliation.js";

const on = new Date("2026-10-13T09:00:00Z");

function txn(overrides: Partial<IncomeTransaction> = {}): IncomeTransaction {
  return {
    id: 1,
    date: new Date("2026-10-05"),
    amount: 1000,
    description: "M-Pesa from Githunguri dairy",
    paymentMethod: "mpesa",
    reference: null,
    deliveryId: null,
    matchedAt: null,
    matchedBy: null,
    ...overrides,
  };
}

function delivery(overrides: Partial<OpenDelivery> = {}): OpenDelivery {
  return {
    id: 1,
    date: new Date("2026-10-01"),
    buyer: "Githunguri",
    commodity: "milk",
    receiptRef: null,
    expectedPay: 1000,
    deductions: 0,
    paidAmount: null,
    ...overrides,
  };
}

describe("outstandingOn", () => {
  it("nets off what the buyer withheld and what they already sent", () => {
    expect(outstandingOn(delivery({ expectedPay: 1000, deductions: 150, paidAmount: 200 }))).toBe(650);
  });

  it("never reports a negative balance", () => {
    expect(outstandingOn(delivery({ expectedPay: 1000, paidAmount: 1200 }))).toBe(0);
  });

  it("has no balance at all when no expected pay was recorded", () => {
    expect(outstandingOn(delivery({ expectedPay: null }))).toBeNull();
  });
});

describe("scoreMatch", () => {
  it("scores an exact amount as strong evidence, not proof", () => {
    const p = scoreMatch(txn(), delivery(), on);
    expect(p.score).toBeGreaterThanOrEqual(0.5);
    expect(p.confidence).toBe("likely");
    expect(p.reasons.some((r) => r.kind === "amount")).toBe(true);
  });

  it("prefers a matching receipt number over an amount, which repeats", () => {
    const withRef = scoreMatch(
      txn({ amount: 37, reference: "SLIP-4471" }),
      delivery({ expectedPay: 1000, receiptRef: "4471" }),
      on
    );
    const withoutRef = scoreMatch(txn({ amount: 37 }), delivery({ expectedPay: 1000 }), on);
    expect(withRef.score).toBeGreaterThan(withoutRef.score);
    expect(withRef.reasons.some((r) => r.kind === "reference")).toBe(true);
  });

  it("counts a payment made BEFORE the delivery against nothing", () => {
    // Allowing it would let one late payment silently settle a delivery made
    // afterwards.
    const p = scoreMatch(txn({ date: new Date("2026-09-01") }), delivery({ date: new Date("2026-10-01") }), on);
    expect(p.reasons.some((r) => r.kind === "timing")).toBe(false);
    expect(p.daysApart).toBe(-30);
  });

  it("is worth more when the payment follows quickly", () => {
    const quick = scoreMatch(txn({ date: new Date("2026-10-10") }), delivery(), on);
    const slow = scoreMatch(txn({ date: new Date("2026-12-20") }), delivery(), on);
    expect(quick.score).toBeGreaterThan(slow.score);
  });
});

describe("proposeMatches", () => {
  it("proposes at most one transaction per delivery, best first", () => {
    const out = proposeMatches(
      [txn({ id: 1 }), txn({ id: 2 })],
      [delivery({ id: 10 })],
      {}
    );
    expect(out).toHaveLength(1);
    expect(out[0].deliveryId).toBe(10);
  });

  it("never re-proposes money the farmer already confirmed", () => {
    const out = proposeMatches(
      [txn({ id: 1, deliveryId: 10, matchedAt: on, matchedBy: "manual" })],
      [delivery({ id: 10 })],
      {}
    );
    expect(out).toEqual([]);
  });

  it("keeps a partial payment in play — that is the case that needs the link", () => {
    const out = proposeMatches([txn({ amount: 400 })], [delivery({ expectedPay: 1000 })], {});
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("maybe");
    expect(out[0].amountDifference).toBe(-600);
  });

  it("drops a pair that shares nothing at all", () => {
    const out = proposeMatches(
      [txn({ amount: 5000, description: "Unrelated", date: new Date("2026-10-20") })],
      [delivery({ expectedPay: 1000 })],
      {}
    );
    expect(out).toEqual([]);
  });

  it("will not reach past the maximum lag", () => {
    const out = proposeMatches(
      [txn({ date: new Date("2027-06-01") })],
      [delivery()],
      { maxDaysAfter: 30 }
    );
    expect(out).toEqual([]);
  });
});

describe("reconciliationSummary", () => {
  it("separates matched money from money with no delivery behind it", () => {
    const summary = reconciliationSummary(
      [txn({ id: 1, amount: 1000, deliveryId: 10 }), txn({ id: 2, amount: 500 })],
      [delivery({ id: 10, expectedPay: 1000 }), delivery({ id: 11, expectedPay: 2000 })],
      []
    );
    expect(summary.matched).toBe(1);
    expect(summary.matchedValue).toBe(1000);
    expect(summary.unmatchedTransactions).toBe(1);
    expect(summary.unmatchedValue).toBe(500);
    expect(summary.unmatchedDeliveryValue).toBe(2000);
  });

  it("counts a fully paid delivery as settled even without a link", () => {
    // Requiring a link before declaring money received would tell a farmer they
    // are owed money they already have.
    const summary = reconciliationSummary(
      [],
      [delivery({ id: 10, expectedPay: 1000, paidAmount: 1000 })],
      []
    );
    expect(summary.settled).toBe(1);
    expect(summary.unmatchedDeliveries).toBe(0);
  });

  it("counts the proposals it was given", () => {
    const summary = reconciliationSummary([txn()], [delivery()], [
      { transactionId: 1, deliveryId: 1, score: 1, confidence: "likely", amountDifference: 0, daysApart: 4, reasons: [] },
    ]);
    expect(summary.proposals).toBe(1);
  });
});
