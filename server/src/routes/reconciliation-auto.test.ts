import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findAutoConfirmMatches,
  type IncomeTransaction,
  type OpenDelivery,
} from "../lib/reconciliation.js";

/**
 * M-Pesa auto-reconcile: proposals on every new income transaction,
 * auto-confirm only when reference AND amount match exactly.
 *
 * The new piece is the auto-confirm path. Proposals already exist; the
 * farmer has been confirming matches by hand. The auto-confirm kicks in
 * only for the safe subset: the receipt's reference number matches the
 * delivery's receiptRef exactly, AND the receipt amount equals the
 * outstanding balance to the cent. Anything fuzzy stays as a proposal.
 *
 * Why this is safe: a payment that matches both a unique reference AND
 * an exact amount is overwhelmingly the same payment. Three farmers
 * delivering 12 litres can produce three identical amount-only
 * receipts; they cannot produce three identical amount+reference
 * receipts. The reference is the buyer's own slip number, unique to
 * the day.
 */

const baseTxn = (overrides: Partial<IncomeTransaction>): IncomeTransaction => ({
  id: 1,
  date: new Date("2026-10-15"),
  amount: 4200,
  description: "M-Pesa",
  paymentMethod: "mpesa",
  reference: "QGH8X4K2M1",
  deliveryId: null,
  matchedAt: null,
  matchedBy: null,
  ...overrides,
});

const baseDelivery = (overrides: Partial<OpenDelivery>): OpenDelivery => ({
  id: 10,
  date: new Date("2026-10-10"),
  buyer: "Brookside",
  commodity: "milk",
  receiptRef: "QGH8X4K2M1",
  expectedPay: 4200,
  deductions: 0,
  paidAmount: 0,
  ...overrides,
});

describe("findAutoConfirmMatches", () => {
  it("returns the match when reference AND amount both match exactly", () => {
    const r = findAutoConfirmMatches([baseTxn({})], [baseDelivery({})]);
    expect(r).toHaveLength(1);
    expect(r[0].transactionId).toBe(1);
    expect(r[0].deliveryId).toBe(10);
  });

  it("does NOT match when amount differs (e.g. deduction taken by buyer)", () => {
    const r = findAutoConfirmMatches(
      [baseTxn({ amount: 4150 })],
      [baseDelivery({ expectedPay: 4200 })],
    );
    expect(r).toHaveLength(0);
  });

  it("does NOT match when reference is missing on either side", () => {
    const r = findAutoConfirmMatches(
      [baseTxn({ reference: null })],
      [baseDelivery({ receiptRef: "QGH8X4K2M1" })],
    );
    expect(r).toHaveLength(0);

    const r2 = findAutoConfirmMatches(
      [baseTxn({})],
      [baseDelivery({ receiptRef: null })],
    );
    expect(r2).toHaveLength(0);
  });

  it("does NOT match when reference differs", () => {
    const r = findAutoConfirmMatches(
      [baseTxn({ reference: "QGH8X4K2M1" })],
      [baseDelivery({ receiptRef: "DIFF12345" })],
    );
    expect(r).toHaveLength(0);
  });

  it("does NOT match an already-matched transaction (matchedBy != null)", () => {
    const r = findAutoConfirmMatches(
      [baseTxn({ matchedBy: "manual", matchedAt: new Date(), deliveryId: 10 })],
      [baseDelivery({})],
    );
    expect(r).toHaveLength(0);
  });

  it("does NOT match a delivery with a positive paidAmount (already paid)", () => {
    const r = findAutoConfirmMatches(
      [baseTxn({})],
      [baseDelivery({ paidAmount: 4200 })],
    );
    expect(r).toHaveLength(0);
  });

  it("matches against outstanding balance, not gross expected", () => {
    // A delivery with expectedPay 4200 and 50 already paid has 4150
    // outstanding. A 4150 receipt with the same reference is the
    // perfect match.
    const r = findAutoConfirmMatches(
      [baseTxn({ amount: 4150, reference: "QGH8X4K2M1" })],
      [baseDelivery({ expectedPay: 4200, paidAmount: 50 })],
    );
    expect(r).toHaveLength(1);
  });

  it("does NOT match when payment is dated before the delivery (impossible chronology)", () => {
    const r = findAutoConfirmMatches(
      [baseTxn({ date: new Date("2026-10-09") })],
      [baseDelivery({ date: new Date("2026-10-10") })],
    );
    expect(r).toHaveLength(0);
  });

  it("returns one match per transaction (idempotent on multiple calls)", () => {
    const txn = baseTxn({});
    const del = baseDelivery({});
    const r1 = findAutoConfirmMatches([txn], [del]);
    // The cron won't see the same txn twice because the route will
    // update matchedBy on confirm, but the function itself is pure —
    // two calls return two identical match objects.
    const r2 = findAutoConfirmMatches([txn], [del]);
    expect(r1).toEqual(r2);
  });
});

describe("the auto-reconcile cron route wires findAutoConfirmMatches", () => {
  // The route lives at server/src/routes/reconciliation-auto.ts and is
  // mounted under /api/cron so Vercel can schedule it.
  const route = readFileSync(
    join(process.cwd(), "src", "routes", "reconciliation-auto.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("imports findAutoConfirmMatches", () => {
    expect(route).toMatch(
      /import\s*\{[^}]*findAutoConfirmMatches[^}]*\}\s*from\s*"\.\.\/lib\/reconciliation\.js"/,
    );
  });

  it("applies each match in a database write that sets matchedBy='auto'", () => {
    expect(route).toMatch(/matchedBy:\s*['"]auto['"]/);
  });

  it("scans the lookback window (default 14 days) so it does not re-process history", () => {
    expect(route).toMatch(/LOOKBACK_DAYS/);
    expect(route).toMatch(/since/);
  });
});
