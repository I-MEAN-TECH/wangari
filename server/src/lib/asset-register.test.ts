import { describe, it, expect } from "vitest";
import { assetRegister, type AssetFlock, type EquipmentItem } from "./asset-register.js";

const on = new Date("2026-10-13T00:00:00Z");

function flock(overrides: Partial<AssetFlock> = {}): AssetFlock {
  return {
    id: 1,
    name: "Dairy herd",
    type: "cattle_dairy",
    currentCount: 5,
    initialCount: 5,
    costPerAnimal: 80000,
    totalInvestment: null,
    acquiredOn: new Date("2024-10-13T00:00:00Z"),
    usefulLifeYears: 8,
    salvageValue: null,
    status: "active",
    ...overrides,
  };
}

function item(overrides: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: 1,
    itemName: "Water pump",
    quantity: 1,
    unit: "unit",
    unitCost: 25000,
    category: "equipment",
    ...overrides,
  };
}

describe("assetRegister — livestock", () => {
  it("depreciates straight-line over the farmer's own useful life", () => {
    const r = assetRegister([flock()], [], on);
    const line = r.lines[0];
    // 400,000 over 8 years = 50,000 a year; two years old.
    expect(line.cost).toBe(400000);
    expect(line.ageYears).toBe(2);
    expect(line.annualDepreciation).toBe(50000);
    expect(line.bookValue).toBe(300000);
    expect(line.basis).toBe("straight_line");
  });

  it("states that it depreciated to zero when no end value was given", () => {
    const r = assetRegister([flock()], [], on);
    expect(r.lines[0].note).toContain("to zero");
  });

  it("respects a salvage value the farmer set", () => {
    const r = assetRegister([flock({ salvageValue: 100000 })], [], on);
    // (400,000 − 100,000)/8 = 37,500 a year; 400,000 − 75,000 = 325,000.
    expect(r.lines[0].annualDepreciation).toBe(37500);
    expect(r.lines[0].bookValue).toBe(325000);
    expect(r.lines[0].note).toContain("100,000");
  });

  it("values a herd on the ORIGINAL head count, not the current one", () => {
    // A calf born on the farm was never bought. Counting her would inflate what
    // was actually paid, which is the number this register exists to state.
    const r = assetRegister([flock({ initialCount: 5, currentCount: 9 })], [], on);
    expect(r.lines[0].cost).toBe(400000);
    expect(r.lines[0].units).toBe(9);
  });

  it("prefers a stated total investment over per-head arithmetic", () => {
    const r = assetRegister([flock({ totalInvestment: 500000, costPerAnimal: 1000 })], [], on);
    expect(r.lines[0].cost).toBe(500000);
  });

  it("shows cost and refuses a book value when the clock or the life is missing", () => {
    const noDate = assetRegister([flock({ acquiredOn: null })], [], on).lines[0];
    expect(noDate.basis).toBe("cost_only");
    expect(noDate.bookValue).toBeNull();
    expect(noDate.note).toContain("no purchase date");

    const noLife = assetRegister([flock({ usefulLifeYears: null })], [], on).lines[0];
    expect(noLife.bookValue).toBeNull();
    expect(noLife.note).toContain("no useful life set");
  });

  it("says so plainly when no purchase cost was ever recorded", () => {
    const line = assetRegister([flock({ costPerAnimal: null, totalInvestment: null })], [], on).lines[0];
    expect(line.cost).toBeNull();
    expect(line.bookValue).toBeNull();
    expect(line.note).toContain("No purchase cost recorded");
  });

  it("excludes stock that has been sold — that is money received, not capital", () => {
    const r = assetRegister([flock({ status: "sold" })], [], on);
    expect(r.lines).toHaveLength(0);
    expect(r.totalCost).toBe(0);
  });

  it("never depreciates below the salvage floor", () => {
    const r = assetRegister([flock({ acquiredOn: new Date("2000-01-01T00:00:00Z"), salvageValue: 50000 })], [], on);
    expect(r.lines[0].bookValue).toBe(50000);
  });
});

describe("assetRegister — equipment", () => {
  it("values stock at quantity times unit cost, shown at cost", () => {
    const r = assetRegister([], [item({ quantity: 3, unitCost: 4500 })], on);
    expect(r.lines[0].cost).toBe(13500);
    expect(r.lines[0].bookValue).toBe(13500);
    expect(r.lines[0].basis).toBe("cost_only");
    expect(r.lines[0].units).toBe(3);
  });

  it("ignores stock with no cost, rather than showing it as free", () => {
    const r = assetRegister([], [item({ unitCost: null })], on);
    expect(r.lines[0].cost).toBeNull();
    expect(r.equipment.cost).toBe(0);
  });
});

describe("assetRegister — totals", () => {
  it("totals livestock and equipment separately and counts what it could value", () => {
    const r = assetRegister([flock()], [item()], on);
    expect(r.livestock.cost).toBe(400000);
    expect(r.equipment.cost).toBe(25000);
    expect(r.totalCost).toBe(425000);
    expect(r.totalBookValue).toBe(325000);
    expect(r.depreciable).toBe(1);
    expect(r.costOnly).toBe(1);
  });

  it("carries the caveat that a book value is not a sale price", () => {
    expect(assetRegister([], [], on).basis).toContain("not a sale price");
  });
});
