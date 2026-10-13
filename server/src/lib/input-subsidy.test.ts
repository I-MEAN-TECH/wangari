import { describe, it, expect } from "vitest";
import { subsidySplit, voucherTotals, inputCostLine, type VoucherRecord } from "./input-subsidy.js";

function voucher(overrides: Partial<VoucherRecord> = {}): VoucherRecord {
  return {
    id: 1,
    program: "nfsp",
    dealer: "Nakuru agrovet",
    voucherValue: 3000,
    farmerContribution: 2000,
    quantityKg: 50,
    inputName: "DAP fertiliser",
    redeemedOn: new Date("2026-03-10"),
    cropId: 5,
    plotId: 2,
    ...overrides,
  };
}

describe("subsidySplit", () => {
  it("keeps the cash the farmer paid apart from the value the programme covered", () => {
    const s = subsidySplit(voucher());
    expect(s.cashPaid).toBe(2000);
    expect(s.subsidyValue).toBe(3000);
    expect(s.totalValue).toBe(5000);
    expect(s.subsidySharePct).toBe(60);
  });

  it("reports no share rather than a division by zero on a free-standing voucher", () => {
    const s = subsidySplit(voucher({ voucherValue: 0, farmerContribution: 0 }));
    expect(s.subsidySharePct).toBeNull();
  });
});

describe("voucherTotals", () => {
  it("totals cash and subsidy separately and prices cash per kg", () => {
    const totals = voucherTotals([
      voucher({ id: 1, voucherValue: 3000, farmerContribution: 2000, quantityKg: 50 }),
      voucher({ id: 2, voucherValue: 1000, farmerContribution: 1000, quantityKg: 25 }),
    ]);
    expect(totals.cashPaid).toBe(3000);
    // The subsidy is NOT income and is never added to cash.
    expect(totals.subsidyValue).toBe(4000);
    expect(totals.totalValue).toBe(7000);
    // 3000 cash over 75 kg — the money that must be earned back.
    expect(totals.cashPerKg).toBe(40);
  });

  it("prices per kg only from the vouchers whose quantity is known", () => {
    // The second voucher's cash still counts in the totals, but it cannot be
    // priced — dividing its money by the first bag's kilos would produce a figure
    // with no meaning at all.
    const totals = voucherTotals([
      voucher({ id: 1, farmerContribution: 2000, quantityKg: 50 }),
      voucher({ id: 2, farmerContribution: 5000, quantityKg: null }),
    ]);
    expect(totals.cashPerKg).toBe(40);
    expect(totals.cashPaid).toBe(7000);
  });

  it("groups by programme, largest subsidy first", () => {
    const totals = voucherTotals([
      voucher({ id: 1, program: "nfsp", voucherValue: 3000 }),
      voucher({ id: 2, program: "county", voucherValue: 500 }),
      voucher({ id: 3, program: "nfsp", voucherValue: 1000 }),
    ]);
    expect(totals.byProgram[0].program).toBe("nfsp");
    expect(totals.byProgram[0].redemptions).toBe(2);
    expect(totals.byProgram[0].subsidyValue).toBe(4000);
    expect(totals.byProgram[1].program).toBe("county");
  });

  it("returns zeroes for a farm that has never redeemed one", () => {
    const totals = voucherTotals([]);
    expect(totals.redemptions).toBe(0);
    expect(totals.subsidyValue).toBe(0);
    expect(totals.cashPerKg).toBeNull();
  });
});

describe("inputCostLine", () => {
  it("books only the cash as cost and discloses the subsidy in the label", () => {
    const line = inputCostLine(voucher());
    expect(line.cashCost).toBe(2000);
    expect(line.nonCashValue).toBe(3000);
    expect(line.nonCash).toBe(false);
    expect(line.description).toContain("Nakuru agrovet");
    expect(line.description).toContain("subsidy: KES 3,000");
  });

  it("marks a fully subsidised input as non-cash so nothing is booked as an expense", () => {
    // No money left the farm. Writing this as an expense would create a cost that
    // never happened and understate the season's real profit.
    const line = inputCostLine(voucher({ voucherValue: 5000, farmerContribution: 0 }));
    expect(line.cashCost).toBe(0);
    expect(line.nonCash).toBe(true);
  });
});
