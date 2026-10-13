import { describe, it, expect } from "vitest";
import { realisedPrice, byBuyer, qualityVsPrice, byGrade, type PricedDelivery } from "./price-realised.js";

function delivery(overrides: Partial<PricedDelivery> = {}): PricedDelivery {
  return {
    id: 1,
    date: new Date("2026-10-01"),
    commodity: "milk",
    quantity: 20,
    unit: "litres",
    unitPrice: 50,
    buyer: "Githunguri",
    fatPct: 3.8,
    snfPct: 8.5,
    expectedPay: 1000,
    paidAmount: null,
    status: "pending",
    ...overrides,
  };
}

describe("realisedPrice", () => {
  it("averages only over the quantity that actually carried a price", () => {
    const r = realisedPrice([
      delivery({ id: 1, quantity: 20, unitPrice: 50 }),
      delivery({ id: 2, quantity: 10, unitPrice: null }),
    ]);
    // 1000 over the 20 priced litres — NOT over 30, which would invent a lower
    // price by treating an unpriced litre as a free one.
    expect(r.pricePerUnit).toBe(50);
    expect(r.pricedQuantity).toBe(20);
    expect(r.unpricedQuantity).toBe(10);
    expect(r.quantity).toBe(30);
    expect(r.value).toBe(1000);
  });

  it("reports no price at all when nothing was priced", () => {
    const r = realisedPrice([delivery({ unitPrice: null })]);
    expect(r.pricePerUnit).toBeNull();
    expect(r.unpricedQuantity).toBe(20);
  });

  it("names the unit only when every delivery agrees on it", () => {
    expect(realisedPrice([delivery()]).unit).toBe("litres");
    expect(realisedPrice([delivery({ id: 1 }), delivery({ id: 2, unit: "kg" })]).unit).toBeNull();
  });
});

describe("byBuyer", () => {
  it("never averages litres together with kilos", () => {
    const out = byBuyer([
      delivery({ id: 1, buyer: "Brookside", commodity: "milk", quantity: 20, unitPrice: 50 }),
      delivery({ id: 2, buyer: "Brookside", commodity: "coffee_cherry", quantity: 100, unit: "kg", unitPrice: 90 }),
    ]);
    expect(out).toHaveLength(2);
    const milk = out.find((b) => b.commodity === "milk")!;
    expect(milk.pricePerUnit).toBe(50);
    expect(milk.deliveries).toBe(1);
  });

  it("puts the worst-paid buyer first — the line a farmer acts on", () => {
    const out = byBuyer([
      delivery({ id: 1, buyer: "Good payer", unitPrice: 55 }),
      delivery({ id: 2, buyer: "Bad payer", unitPrice: 38 }),
    ]);
    expect(out[0].buyer).toBe("Bad payer");
    expect(out[1].buyer).toBe("Good payer");
  });
});

describe("qualityVsPrice", () => {
  it("says nothing from fewer than three paired readings", () => {
    // Two points make a line through everything and through nothing.
    const out = qualityVsPrice([
      delivery({ id: 1, fatPct: 3.2, unitPrice: 40 }),
      delivery({ id: 2, fatPct: 4.2, unitPrice: 55 }),
    ]);
    expect(out.medianFatPct).toBeNull();
    expect(out.atOrAbove.deliveries).toBe(0);
    expect(out.basis).toContain("Your co-op's payment bands may differ");
  });

  it("splits on the farmer's own median fat, not an imported standard", () => {
    const out = qualityVsPrice([
      delivery({ id: 1, fatPct: 3.0, unitPrice: 40 }),
      delivery({ id: 2, fatPct: 3.5, unitPrice: 45 }),
      delivery({ id: 3, fatPct: 4.0, unitPrice: 55 }),
      delivery({ id: 4, fatPct: 4.5, unitPrice: 60 }),
    ]);
    // Median of 3.0/3.5/4.0/4.5 is 3.75.
    expect(out.medianFatPct).toBe(3.75);
    expect(out.atOrAbove.deliveries).toBe(2);
    expect(out.below.deliveries).toBe(2);
    expect(out.atOrAbove.pricePerUnit).toBe(57.5);
    expect(out.below.pricePerUnit).toBe(42.5);
  });

  it("ignores deliveries with no fat reading or no price", () => {
    const out = qualityVsPrice([
      delivery({ id: 1, fatPct: null }),
      delivery({ id: 2, unitPrice: null }),
      delivery({ id: 3 }),
    ]);
    expect(out.pairs.map((p) => p.deliveryId)).toEqual([3]);
  });

  it("only ever compares within the commodity asked about", () => {
    const out = qualityVsPrice([
      delivery({ id: 1 }),
      delivery({ id: 2, commodity: "coffee_cherry", unit: "kg" }),
      delivery({ id: 3 }),
      delivery({ id: 4 }),
    ]);
    expect(out.pairs.every((p) => p.deliveryId !== 2)).toBe(true);
  });
});

describe("byGrade", () => {
  it("prices each grade of each crop separately", () => {
    const out = byGrade([
      { cropType: "coffee_cherry", quality: "A", quantityKg: 100, salePrice: 12000 },
      { cropType: "coffee_cherry", quality: "B", quantityKg: 100, salePrice: 7000 },
    ]);
    const a = out.find((g) => g.grade === "A")!;
    expect(a.pricePerKg).toBe(120);
    expect(out.find((g) => g.grade === "B")!.pricePerKg).toBe(70);
  });

  it("keeps ungraded volume visible instead of dropping it", () => {
    // How much of the crop is NOT graded is usually where the money is lost.
    const out = byGrade([{ cropType: "avocado", quality: null, quantityKg: 300, salePrice: null }]);
    expect(out[0].grade).toBe("ungraded");
    expect(out[0].quantityKg).toBe(300);
    expect(out[0].pricePerKg).toBeNull();
  });

  it("excludes unsold volume from the per-kg figure", () => {
    const out = byGrade([
      { cropType: "maize", quality: "A", quantityKg: 100, salePrice: 4000 },
      { cropType: "maize", quality: "A", quantityKg: 100, salePrice: null },
    ]);
    expect(out[0].quantityKg).toBe(200);
    expect(out[0].pricedQuantityKg).toBe(100);
    expect(out[0].pricePerKg).toBe(40);
  });
});
