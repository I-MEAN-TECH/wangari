import { describe, it, expect } from "vitest";
import { buildPlotTrace, type PlotTraceInput } from "./plot-trace.js";

function input(overrides: Partial<PlotTraceInput> = {}): PlotTraceInput {
  return {
    plotId: 1,
    name: "Coffee block C",
    latitude: -0.42,
    longitude: 36.95,
    areaValue: 2.5,
    areaUnit: "acre",
    soilType: "red loam",
    crops: [
      {
        cropId: 11,
        name: "Coffee Block C",
        cropType: "coffee",
        harvests: [
          { harvestId: 1, date: new Date("2026-09-01"), quantityKg: 240, quality: "A" },
          { harvestId: 2, date: new Date("2026-10-01"), quantityKg: 300, quality: "A" },
        ],
        batches: [{ batchId: 21, batchCode: "CB-2026-001", harvestDate: new Date("2026-09-02"), destination: "EU export", grade: "Export" }],
      },
    ],
    ...overrides,
  };
}

describe("buildPlotTrace", () => {
  it("reports a geolocated, exported plot as traceable", () => {
    const trace = buildPlotTrace(input());
    expect(trace.traceable).toBe(true);
    expect(trace.geo).toEqual({ latitude: -0.42, longitude: 36.95, hasCoordinates: true });
    expect(trace.missing).toEqual([]);
    expect(trace.crops[0].harvests).toBe(2);
    expect(trace.crops[0].totalKg).toBe(540);
    expect(trace.crops[0].exported).toBe(true);
    expect(trace.summary).toContain("leaving the farm");
  });

  it("never fabricates coordinates for a plot that has none", () => {
    const trace = buildPlotTrace(input({ latitude: null, longitude: null }));
    expect(trace.traceable).toBe(false);
    expect(trace.geo).toBeNull();
    expect(trace.missing).toContain("plot GPS coordinates — capture them with one tap");
  });

  it("rejects a lone coordinate as the missing-pair error, not a point", () => {
    const trace = buildPlotTrace(input({ longitude: null }));
    expect(trace.traceable).toBe(false);
    expect(trace.geo).toEqual({ latitude: -0.42, longitude: null, hasCoordinates: false });
    expect(trace.missing.some((m) => m.includes("longitude"))).toBe(true);
  });

  it("returns no summary when nothing was ever grown on the plot", () => {
    const trace = buildPlotTrace(input({ crops: [] }));
    expect(trace.summary).toBeNull();
    expect(trace.crops).toEqual([]);
  });

  it("a crop that never left the farm is not marked exported", () => {
    const trace = buildPlotTrace(input({ crops: [{ cropId: 11, name: "Maize", cropType: "maize", harvests: [], batches: [] }] }));
    expect(trace.crops[0].exported).toBe(false);
    expect(trace.crops[0].totalKg).toBe(0);
  });
});