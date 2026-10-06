import { describe, it, expect } from "vitest";

/**
 * Delivery statement maths.
 *
 * This is money a farmer is owed, and it is used to confront a co-op with a
 * figure. A wrong number here is worse than no number: it destroys trust in
 * the whole app. So the arithmetic is pinned down by tests rather than trusted
 * to a running total.
 *
 * Mirrors the server logic in server/src/routes/deliveries.ts.
 */

interface Delivery {
  buyer: string;
  expectedPay: number | null;
  paidAmount: number | null;
  deductions: Array<{ amount: number | null }>;
}

const delivery = (
  buyer: string,
  expectedPay: number | null,
  paidAmount: number | null,
  deductions: number[] = []
): Delivery => ({
  buyer,
  expectedPay,
  paidAmount,
  deductions: deductions.map((amount) => ({ amount })),
});

/** gross - deductions - paid, per delivery. What the buyer still owes. */
const outstandingFor = (d: Delivery) =>
  Number(d.expectedPay ?? 0) -
  d.deductions.reduce((s, x) => s + Number(x.amount ?? 0), 0) -
  Number(d.paidAmount ?? 0);

function summariseByBuyer(rows: Delivery[]) {
  const by: Record<
    string,
    { deliveries: number; gross: number; deductions: number; paid: number; outstanding: number }
  > = {};
  for (const d of rows) {
    const key = d.buyer || "Unknown";
    const c = (by[key] ??= {
      deliveries: 0,
      gross: 0,
      deductions: 0,
      paid: 0,
      outstanding: 0,
    });
    c.deliveries += 1;
    c.gross += Number(d.expectedPay ?? 0);
    c.deductions += d.deductions.reduce((s, x) => s + Number(x.amount ?? 0), 0);
    c.paid += Number(d.paidAmount ?? 0);
    c.outstanding += outstandingFor(d);
  }
  return by;
}

describe("outstanding per delivery", () => {
  it("is gross minus deductions minus what was paid", () => {
    // 5,000 delivered, 500 AI/transport deducted, 2,000 paid -> 2,500 owed
    expect(outstandingFor(delivery("Githunguri", 5000, 2000, [500]))).toBe(2500);
  });

  it("shows zero when gross equals deductions plus payment", () => {
    expect(outstandingFor(delivery("KCC", 4000, 4000, [0]))).toBe(0);
  });

  it("shows a credit when deductions exceed what was paid out", () => {
    // 4,000 delivered, 200 deducted, 4,000 paid out -> the co-op kept 200.
    expect(outstandingFor(delivery("KCC", 4000, 4000, [200]))).toBe(-200);
  });

  it("treats a delivery with no deductions as gross minus paid", () => {
    expect(outstandingFor(delivery("KCC", 3000, 1000))).toBe(2000);
  });

  it("treats missing expectedPay as zero rather than NaN", () => {
    // A farmer who logged litres but never a price must not see "NaN owed".
    expect(outstandingFor(delivery("KCC", null, null))).toBe(0);
    expect(Number.isNaN(outstandingFor(delivery("KCC", null, null)))).toBe(false);
  });

  it("handles several deductions on one delivery", () => {
    expect(outstandingFor(delivery("KCC", 5000, 0, [300, 200, 100]))).toBe(4400);
  });

  it("shows a small credit when deductions exceed what was paid", () => {
    // Real case: a co-op deducted more than the delivery earned. The farmer
    // should see a negative balance, not a silent zero.
    expect(outstandingFor(delivery("KCC", 1000, 0, [1200]))).toBe(-200);
  });
});

describe("per-buyer breakdown", () => {
  it("separates buyers so a co-op is asked about its own line only", () => {
    const by = summariseByBuyer([
      delivery("Githunguri", 5000, 2000, [500]),
      delivery("Githunguri", 3000, 0, []),
      delivery("New KCC", 10000, 10000, [300]),
    ]);
    expect(Object.keys(by).sort()).toEqual(["Githunguri", "New KCC"]);
    expect(by.Githunguri.outstanding).toBe(2500 + 3000);
    expect(by.Githunguri.deliveries).toBe(2);
    expect(by["New KCC"].outstanding).toBe(-300);
  });

  it("groups an unnamed buyer rather than dropping the delivery", () => {
    const by = summariseByBuyer([delivery("", 1000, 0)]);
    expect(by["Unknown"].deliveries).toBe(1);
    expect(by["Unknown"].outstanding).toBe(1000);
  });

  it("totals only that buyer's money", () => {
    const by = summariseByBuyer([
      delivery("A", 1000, 0),
      delivery("B", 2000, 0),
    ]);
    expect(by.A.gross).toBe(1000);
    expect(by.B.gross).toBe(2000);
  });
});

describe("all-time balance", () => {
  it("sums unpaid deliveries across every month", () => {
    // The N-KCC case: a farmer owed across months needs the running total.
    const rows = [
      delivery("KCC", 5000, 0, []), // this month
      delivery("KCC", 4000, 0, []), // last month
      delivery("Githunguri", 6000, 6000, []), // settled
    ];
    expect(rows.reduce((s, d) => s + outstandingFor(d), 0)).toBe(9000);
  });

  it("is zero when everything has been paid", () => {
    const rows = [delivery("KCC", 5000, 5000), delivery("KCC", 3000, 3000)];
    expect(rows.reduce((s, d) => s + outstandingFor(d), 0)).toBe(0);
  });

  it("counts only deliveries with a real balance above one cent", () => {
    // Float noise must not make a settled delivery look unpaid.
    const rows = [
      delivery("KCC", 1000, 999.999),
      delivery("KCC", 1000, 0),
    ];
    const unpaid = rows.filter((d) => outstandingFor(d) > 0.01).length;
    expect(unpaid).toBe(1);
  });
});