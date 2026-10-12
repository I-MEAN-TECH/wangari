import { describe, it, expect } from "vitest";
import {
  payoutLine,
  payoutSummary,
  effectiveUnitPriceKes,
  milkQualityView,
  type DeliveryRow,
} from "./delivery-quality.js";

const DAY = 86400000;

/**
 * The rows are shaped exactly like the Prisma rows a route would pass:
 * Date objects, decimal numbers already `Number()`d, deductions as children.
 */
const row = (over: Partial<DeliveryRow> = {}): DeliveryRow => ({
  commodity: "milk",
  quantity: 100,
  unit: "litres",
  unitPrice: 45,
  expectedPay: null,
  paidAmount: null,
  date: new Date("2026-09-01"),
  payBy: null,
  deductions: [],
  ...over,
});

describe("payoutLine — one delivery, the whole truth", () => {
  it("falls back to unitPrice × quantity when the slip has no gross", () => {
    const l = payoutLine(row({ expectedPay: null, unitPrice: 45 }));
    expect(l.gross).toBe(4500);
    expect(l.netExpected).toBe(4500);
    expect(l.outstanding).toBe(4500);
  });

  it("subtracts every deduction to reach the net the slip should show", () => {
    const l = payoutLine(row({ expectedPay: 4500, deductions: [{ label: "AI service", amount: 200, creditor: "co-op" }, { label: "Transport", amount: 50 }] }));
    expect(l.deductionTotal).toBe(250);
    expect(l.netExpected).toBe(4250);
    expect(l.outstanding).toBe(4250);
  });

  it("a payment inside the net clears the outstanding only by what it covered", () => {
    const l = payoutLine(row({ expectedPay: 4500, deductions: [{ label: "Agrovet credit", amount: 500 }], paidAmount: 3500 }));
    expect(l.netExpected).toBe(4000);
    expect(l.outstanding).toBe(500);
  });

  it("overpayment shows negative outstanding, never zero flavour-painted", () => {
    const l = payoutLine(row({ expectedPay: 1000, paidAmount: 1200 }));
    expect(l.outstanding).toBe(-200);
  });

  it("untouched simple rows round to clean money", () => {
    const l = payoutLine(row({ unitPrice: 43.5, quantity: 80 }));
    expect(l.gross).toBe(3480);
  });
});

describe("arrears — only a passed date creates them", () => {
  const on = new Date("2026-10-01");

  it("no expected date means no clock, so no arrears even if unpaid", () => {
    const l = payoutLine(row({ payBy: null }), on);
    expect(l.isArrears).toBe(false);
    expect(l.daysOverdue).toBeNull();
  });

  it("unpaid past the date is arrears, counted in whole days", () => {
    const l = payoutLine(row({ payBy: new Date("2026-09-25"), expectedPay: 4500 }), on);
    expect(l.isArrears).toBe(true);
    expect(l.daysOverdue).toBe(6);
  });

  it("unpaid but within its own payment date is NOT arrears yet", () => {
    const l = payoutLine(row({ payBy: new Date("2026-10-05"), expectedPay: 4500 }), on);
    expect(l.isArrears).toBe(false);
  });

  it("paid in full on time never becomes arrears regardless of dates", () => {
    const l = payoutLine(row({ payBy: new Date("2026-09-10"), expectedPay: 4500, paidAmount: 4500 }), on);
    expect(l.isArrears).toBe(false);
  });

  it("a deduction-covered balance that still owed something past date IS arrears", () => {
    // net 4250, paid 4000 → 250 outstanding, due date passed → arrears
    const l = payoutLine(row({ payBy: new Date("2026-09-20"), expectedPay: 4500, deductions: [{ label: "x", amount: 250 }], paidAmount: 4000 }), on);
    expect(l.isArrears).toBe(true);
    expect(l.outstanding).toBe(250);
  });

  it("dust-below-a-cent does not count as arrears (tolerance, not pedantry)", () => {
    const l = payoutLine(row({ payBy: new Date("2026-09-20"), expectedPay: 4500, paidAmount: 4499.995 }), on);
    expect(l.isArrears).toBe(false);
  });
});

describe("payoutSummary — the running totals the farmer takes to the co-op", () => {
  const on = new Date("2026-10-01");
  const rows: DeliveryRow[] = [
    row({ date: new Date("2026-09-01"), payBy: new Date("2026-09-20"), expectedPay: 4500, deductions: [{ label: "AI", amount: 200, creditor: "co-op" }] }),
    row({ date: new Date("2026-09-10"), payBy: new Date("2026-09-30"), expectedPay: 3200, paidAmount: 3200 }),
    row({ date: new Date("2026-09-20"), payBy: new Date("2026-09-27"), expectedPay: 2000, deductions: [{ label: "Loan installment", amount: 1000, creditor: "SACCO" }] }),
  ];

  it("sums gross / deductions / net / paid truthfully", () => {
    const s = payoutSummary(rows, on);
    expect(s.gross).toBe(9700);
    expect(s.deductions).toBe(1200);
    expect(s.netExpected).toBe(8500);
    expect(s.paid).toBe(3200);
    expect(s.outstanding).toBe(5300);
  });

  it("arrears count the two slipped deliveries and total exactly them", () => {
    const s = payoutSummary(rows, on);
    // paid one is clear; two unpaid past date: (4500-200) + (2000-1000) = 5300
    expect(s.arrearsCount).toBe(2);
    expect(s.arrearsTotal).toBe(5300);
    expect(s.oldestArrearsDays).toBe(11); // the 09-20 one
  });

  it("groups deductions by creditor — the co-op vs my-loan distinction", () => {
    const s = payoutSummary(rows, on);
    expect(s.deductionsByCreditor["co-op"]).toBe(200);
    expect(s.deductionsByCreditor["SACCO"]).toBe(1000);
  });

  it("empty farm has honest zeros, not NaNs", () => {
    const s = payoutSummary([], on);
    expect(s.gross).toBe(0);
    expect(s.arrearsCount).toBe(0);
    expect(s.oldestArrearsDays).toBeNull();
    expect(s.deductionsByCreditor).toEqual({});
  });
});

describe("effectiveUnitPriceKes — what a litre actually earned", () => {
  it("deductions lower the effective rate below the slip rate", () => {
    // only arithmetic that isn't policy: 4250 over 100 litres is 42.50, not 45
    const r = effectiveUnitPriceKes(row({ unitPrice: 45, expectedPay: 4500, deductions: [{ label: "AI", amount: 250 }] }));
    expect(r).toBe(42.5);
  });

  it("a clean delivery's effective rate equals the agreed rate", () => {
    const r = effectiveUnitPriceKes(row({ unitPrice: 45 }));
    expect(r).toBe(45);
  });

  it("no quantity or no gross → null, the honest 'not enough recorded'", () => {
    expect(effectiveUnitPriceKes(row({ quantity: 0, unitPrice: 45 }))).toBeNull();
    expect(effectiveUnitPriceKes(row({ unitPrice: null, expectedPay: null }))).toBeNull();
  });
});

describe("milkQualityView — the QBMP parameters without pretending to grade", () => {
  it("returns exactly what was tested and null for what was not", () => {
    const v = milkQualityView(row({ fatPct: 3.4, snfPct: 8.6 }));
    expect(v.fatPct).toBe(3.4);
    expect(v.snfPct).toBe(8.6);
    expect(v.addedWaterPct).toBeNull();
    expect(v.tpc).toBeNull();
    expect(v.impliedFatKg).toBe(3.4); // 100 kg-litres × 3.4%
    expect(v.waterPenaltyLitres).toBeNull();
  });

  it("all-null quality (an untouched row) stays untouched", () => {
    const v = milkQualityView(row());
    expect(v.fatPct).toBeNull();
    expect(v.impliedFatKg).toBeNull();
    expect(v.waterPenaltyLitres).toBeNull();
  });

  it("measured added water implies litres removed, payable-volume arithmetic", () => {
    const v = milkQualityView(row({ quantity: 200, addedWaterPct: 10 }));
    expect(v.waterPenaltyLitres).toBe(20);
  });

  it("implied fat is per-delivery, on a messy quantity too", () => {
    const v = milkQualityView(row({ quantity: 173, fatPct: 3.25 }));
    expect(v.impliedFatKg).toBe(5.62); // 173 × 3.25 / 100, rounded to paisa
  });
});

/**
 * The integration seam: the route must feed THESE rows in. A test quietly
 * running against a from/routes copy would rot separately from the lib, so
 * instead we lock the two sides together by source — the route uses the lib's
 * own functions, not a re-implemented copy.
 */
describe("the route uses this lib, not its own copy", () => {
  it("deliveries.ts delegates its statement maths to delivery-quality.ts", () => {
    const fs = require("node:fs");
    const src = fs.readFileSync(require("node:path").join(__dirname, "..", "routes", "deliveries.ts"), "utf8");
    expect(src).toContain('from "../lib/delivery-quality.js"');
  });
});
