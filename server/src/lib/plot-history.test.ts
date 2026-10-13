import { describe, it, expect } from "vitest";
import { rotation, yieldVariance, type PlotCrop } from "./plot-history.js";

function crop(overrides: Partial<PlotCrop> = {}): PlotCrop {
  return {
    cropId: 1,
    name: "Maize Field A",
    cropType: "maize",
    variety: "H614",
    areaAcres: 2,
    plantingDate: new Date("2026-03-01"),
    status: "harvested",
    expectedYieldKg: null,
    harvests: [],
    ...overrides,
  };
}

describe("rotation", () => {
  it("orders crops by when they were planted, not by when they were added", () => {
    const history = rotation([
      crop({ cropId: 2, cropType: "beans", plantingDate: new Date("2026-07-01") }),
      crop({ cropId: 1, cropType: "maize", plantingDate: new Date("2026-03-01") }),
    ]);
    expect(history.steps.map((s) => s.cropType)).toEqual(["maize", "beans"]);
  });

  it("puts undated crops last — an unrecorded date is not evidence of being first", () => {
    const history = rotation([
      crop({ cropId: 9, cropType: "kale", plantingDate: null }),
      crop({ cropId: 1, cropType: "maize", plantingDate: new Date("2026-03-01") }),
    ]);
    expect(history.steps.map((s) => s.cropType)).toEqual(["maize", "kale"]);
  });

  it("notes a repeat of the previous crop type as a fact and nothing more", () => {
    const history = rotation([
      crop({ cropId: 1, cropType: "maize", plantingDate: new Date("2026-03-01") }),
      crop({ cropId: 2, cropType: "maize", plantingDate: new Date("2026-07-01") }),
    ]);
    expect(history.steps[1].repeatsPrevious).toBe(true);
    expect(history.steps[0].repeatsPrevious).toBe(false);
  });

  it("measures the fallow gap from the previous crop's last harvest", () => {
    const history = rotation([
      crop({
        cropId: 1,
        cropType: "maize",
        plantingDate: new Date("2026-01-01"),
        harvests: [{ id: 1, date: new Date("2026-06-01"), quantityKg: 1000, quality: "A", salePrice: null }],
      }),
      crop({ cropId: 2, cropType: "beans", plantingDate: new Date("2026-06-21") }),
    ]);
    expect(history.steps[1].fallowDays).toBe(20);
    expect(history.steps[0].fallowDays).toBeNull();
  });

  it("totals the plot's harvest and lists the types grown in sequence", () => {
    const history = rotation([
      crop({
        cropId: 1,
        cropType: "maize",
        harvests: [
          { id: 1, date: new Date("2026-06-01"), quantityKg: 900, quality: "A", salePrice: 40000 },
          { id: 2, date: new Date("2026-06-15"), quantityKg: 200, quality: "B", salePrice: 6000 },
        ],
      }),
      crop({ cropId: 2, cropType: "beans", plantingDate: new Date("2026-07-01") }),
    ]);
    expect(history.totalHarvestedKg).toBe(1100);
    expect(history.steps[0].lastHarvest).toEqual(new Date("2026-06-15"));
    expect(history.cropTypesGrown).toEqual(["maize", "beans"]);
    expect(history.seasonsRecorded).toBe(2);
  });

  it("keeps a failed season in the rotation", () => {
    const history = rotation([crop({ status: "failed", harvests: [] })]);
    expect(history.steps).toHaveLength(1);
    expect(history.steps[0].status).toBe("failed");
    expect(history.steps[0].harvestedKg).toBe(0);
  });
});

describe("yieldVariance", () => {
  it("compares the harvest only against the farmer's own expectation", () => {
    const v = yieldVariance(
      crop({
        expectedYieldKg: 2000,
        harvests: [{ id: 1, date: new Date("2026-06-01"), quantityKg: 1700, quality: "A", salePrice: null }],
      }),
      2
    );
    expect(v.harvestedKg).toBe(1700);
    expect(v.expectedKg).toBe(2000);
    expect(v.varianceKg).toBe(-300);
    expect(v.variancePct).toBe(-15);
  });

  it("offers no variance at all when the farmer stated no expectation", () => {
    // No imported variety potential, and no zero either — a missing expectation
    // is not an expectation of nothing.
    const v = yieldVariance(crop({ expectedYieldKg: null, harvests: [{ id: 1, date: new Date(), quantityKg: 800, quality: null, salePrice: null }] }), 2);
    expect(v.expectedKg).toBeNull();
    expect(v.varianceKg).toBeNull();
    expect(v.variancePct).toBeNull();
  });

  it("uses the plot area as a fallback denominator and says which it used", () => {
    const v = yieldVariance(crop({ areaAcres: null, harvests: [{ id: 1, date: new Date(), quantityKg: 1000, quality: null, salePrice: null }] }), 4);
    expect(v.perAcreBasis).toBe("plot");
    expect(v.perAcreKg).toBe(250);
  });

  it("prefers the crop's own acreage over the plot's", () => {
    const v = yieldVariance(crop({ areaAcres: 2, harvests: [{ id: 1, date: new Date(), quantityKg: 1000, quality: null, salePrice: null }] }), 8);
    expect(v.perAcreBasis).toBe("crop");
    expect(v.perAcreKg).toBe(500);
  });

  it("produces no per-acre figure when no area is known", () => {
    const v = yieldVariance(crop({ areaAcres: null, harvests: [] }), null);
    expect(v.perAcreBasis).toBeNull();
    expect(v.perAcreKg).toBeNull();
  });

  it("always marks the derived figures as estimates", () => {
    const v = yieldVariance(crop(), 2);
    expect(v.isEstimate).toBe(true);
  });

  it("exposes how many picks the variance came from", () => {
    const v = yieldVariance(crop({ harvests: [{ id: 1, date: new Date(), quantityKg: 50, quality: null, salePrice: null }] }), 2);
    expect(v.harvestCount).toBe(1);
  });
});
