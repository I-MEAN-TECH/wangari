/**
 * Unit economics — M4's cost vs price verdicts.
 *
 * The tests that matter most here are the ones about *absence*: a cost of 0
 * and a price of 0 must never produce a profit claim. Every branch that can
 * print "profit" is asserted against its arithmetic, and the wording itself
 * is asserted against the numbers, because the wording is the product.
 */

import { describe, it, expect } from "vitest";
import {
  unitEconomics,
  commodityForEnterprise,
  benchmarkToCostUnit,
  THIN_MARGIN_FRACTION,
} from "./unit-economics.js";

describe("absence of data never claims a margin", () => {
  it("cost 0 with a price is 'no cost recorded', not free money", () => {
    const e = unitEconomics({ costPerUnit: 0, ownPricePerUnit: 71, marketPricePerUnit: null, unit: "litre" });
    expect(e.verdict).toBe("no-cost");
    expect(e.profitPerUnit).toBeNull();
    expect(e.headline).toContain("No cost recorded");
    expect(e.headline).not.toMatch(/profit/i);
  });

  it("cost null (no output) is also 'no cost recorded'", () => {
    const e = unitEconomics({ costPerUnit: null, ownPricePerUnit: 5, marketPricePerUnit: null, unit: "egg" });
    expect(e.verdict).toBe("no-cost");
    expect(e.profitPerUnit).toBeNull();
  });

  it("price 0 is an absence of sales, not a sale at zero", () => {
    const e = unitEconomics({ costPerUnit: 4, ownPricePerUnit: 0, marketPricePerUnit: 0, unit: "egg" });
    expect(e.verdict).toBe("no-price");
    expect(e.priceSource).toBeNull();
    expect(e.headline).toContain("price unknown");
    expect(e.detail).toContain("KES 4");
  });

  it("null prices are 'no price', with the cost still shown honestly", () => {
    const e = unitEconomics({ costPerUnit: 4.2, ownPricePerUnit: null, marketPricePerUnit: null, unit: "egg" });
    expect(e.verdict).toBe("no-price");
    expect(e.costPerUnit).toBe(4.2);
    expect(e.pricePerUnit).toBeNull();
    expect(e.detail).toContain("Record a sale");
  });

  it("echoes both prices back, normalised — the screen shows all three columns", () => {
    const e = unitEconomics({ costPerUnit: 4, ownPricePerUnit: 6, marketPricePerUnit: 0, unit: "egg" });
    expect(e.ownPricePerUnit).toBe(6);
    expect(e.marketPricePerUnit).toBeNull(); // a 0 benchmark is not a price
    const none = unitEconomics({ costPerUnit: 4, ownPricePerUnit: 0, marketPricePerUnit: null, unit: "egg" });
    expect(none.ownPricePerUnit).toBeNull();
  });
});

describe("the verdict ladder", () => {
  const base = { costPerUnit: 10, unit: "kg" };

  it("healthy profit is profitable, with the arithmetic in the words", () => {
    const e = unitEconomics({ ...base, ownPricePerUnit: 20, marketPricePerUnit: null });
    expect(e.verdict).toBe("profitable");
    expect(e.priceSource).toBe("own");
    expect(e.profitPerUnit).toBe(10);
    expect(e.headline).toBe("KES 10 profit per kg");
    expect(e.detail).toContain("50% margin");
    expect(e.detail).toContain("you keep KES 10 per kg");
  });

  it("15% margin is the line: at or above it is profitable, below it is thin", () => {
    expect(THIN_MARGIN_FRACTION).toBe(0.15);
    const at = unitEconomics({ costPerUnit: 85, ownPricePerUnit: 100, marketPricePerUnit: null, unit: "kg" });
    expect(at.profitPerUnit).toBe(15);
    expect(at.verdict).toBe("profitable"); // exactly 15% — the boundary counts as good

    const below = unitEconomics({ costPerUnit: 86, ownPricePerUnit: 100, marketPricePerUnit: null, unit: "kg" });
    expect(below.verdict).toBe("thin"); // 14% — one bad week from nothing
    expect(below.detail).toContain("14% margin");

    const barely = unitEconomics({ costPerUnit: 10, ownPricePerUnit: 11, marketPricePerUnit: null, unit: "kg" });
    expect(barely.verdict).toBe("thin");
  });

  it("a loss is losing, and the shortfall is what the headline says", () => {
    const e = unitEconomics({ ...base, ownPricePerUnit: 7, marketPricePerUnit: null });
    expect(e.verdict).toBe("losing");
    expect(e.profitPerUnit).toBe(-3);
    expect(e.headline).toBe("KES 3 short per kg");
    expect(e.detail).toContain("KES 3 behind on every kg");
  });

  it("an exact break-even is thin, not profitable", () => {
    const e = unitEconomics({ ...base, ownPricePerUnit: 10, marketPricePerUnit: null });
    expect(e.verdict).toBe("thin");
    expect(e.profitPerUnit).toBe(0);
    expect(e.headline).toContain("Only KES 0 profit");
  });
});

describe("which price is talking", () => {
  it("the farm's own realised price wins over the county benchmark", () => {
    const e = unitEconomics({ costPerUnit: 4, ownPricePerUnit: 6, marketPricePerUnit: 9, unit: "egg" });
    expect(e.priceSource).toBe("own");
    expect(e.pricePerUnit).toBe(6);
    expect(e.profitPerUnit).toBe(2);
    expect(e.detail).toContain("your records say you earn");
  });

  it("the benchmark speaks only when the farm's own books are silent", () => {
    const e = unitEconomics({ costPerUnit: 4, ownPricePerUnit: null, marketPricePerUnit: 9, unit: "egg" });
    expect(e.priceSource).toBe("market");
    expect(e.pricePerUnit).toBe(9);
    expect(e.detail).toContain("the county pays");
  });
});

describe("commodity mapping — only defensible conversions", () => {
  it("prices eggs per tray against cost per egg", () => {
    const m = commodityForEnterprise({ unit: "egg", species: "layers" })!;
    expect(m).toEqual({ commodity: "eggs", benchmarkUnit: "tray", costUnitsPerBenchmarkUnit: 30 });
  });

  it("prices milk directly", () => {
    expect(commodityForEnterprise({ unit: "litre", species: "cattle_dairy" })!.commodity).toBe("milk");
  });

  it("maps beef and known kg crops", () => {
    expect(commodityForEnterprise({ unit: "kg", species: "cattle_beef" })!.commodity).toBe("beef");
    expect(commodityForEnterprise({ unit: "kg", cropType: "Arabica Coffee" })!.commodity).toBe("coffee");
    expect(commodityForEnterprise({ unit: "kg", cropType: "irish potatoes" })!.commodity).toBe("potatoes");
    expect(commodityForEnterprise({ unit: "kg", cropType: "Hass Avocado" })!.commodity).toBe("avocado");
  });

  it("refuses units it cannot convert honestly", () => {
    // Goat is priced per head against a per-kg cost; maize per unknown bag.
    expect(commodityForEnterprise({ unit: "kg", species: "goats" })).toBeNull();
    expect(commodityForEnterprise({ unit: "kg", cropType: "maize" })).toBeNull();
    expect(commodityForEnterprise({ unit: null })).toBeNull();
    expect(commodityForEnterprise({ unit: "kg", species: "fish", cropType: "kale" })).toBeNull();
  });
});

describe("benchmark conversion", () => {
  const trayMap = { commodity: "eggs", benchmarkUnit: "tray", costUnitsPerBenchmarkUnit: 30 };

  it("divides a tray price into a per-egg price", () => {
    expect(benchmarkToCostUnit(120, "tray", trayMap)).toBeCloseTo(4, 6);
    // Farmers post "trays" as often as "tray" — the plural must not break it.
    expect(benchmarkToCostUnit(120, "Trays", trayMap)).toBeCloseTo(4, 6);
  });

  it("refuses a quote in a unit we did not assume", () => {
    expect(benchmarkToCostUnit(120, "crate", trayMap)).toBeNull();
    expect(benchmarkToCostUnit(120, "kg", trayMap)).toBeNull();
    expect(benchmarkToCostUnit(120, null, trayMap)).toBeNull();
  });

  it("refuses a zero or unparseable price", () => {
    expect(benchmarkToCostUnit(0, "tray", trayMap)).toBeNull();
    expect(benchmarkToCostUnit(-5, "tray", trayMap)).toBeNull();
    expect(benchmarkToCostUnit(Number.NaN, "tray", trayMap)).toBeNull();
  });
});
