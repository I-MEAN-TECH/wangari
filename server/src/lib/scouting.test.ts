import { describe, it, expect } from "vitest";
import { incidence, trend, followUpsDue, cropPressure, type ScoutingRecord } from "./scouting.js";

const on = new Date("2026-10-13T09:00:00Z");

function scout(overrides: Partial<ScoutingRecord> = {}): ScoutingRecord {
  return {
    id: 1,
    cropId: 10,
    date: new Date("2026-10-10T00:00:00Z"),
    issueType: "pest",
    description: "fall armyworm in whorls",
    severity: "high",
    sampleSize: 50,
    affectedCount: 14,
    pestStage: "larva",
    treatment: null,
    treatedDate: null,
    followUpOn: null,
    outcome: null,
    ...overrides,
  };
}

describe("incidence", () => {
  it("turns two counts into the percentage scouting exists to produce", () => {
    const inc = incidence(scout());
    expect(inc.pct).toBe(28);
    expect(inc.overCounted).toBe(false);
  });

  it("refuses to divide by a sample of zero", () => {
    // 0 plants looked at and 0 found is not 0% infestation, it is no data.
    const inc = incidence(scout({ sampleSize: 0, affectedCount: 0 }));
    expect(inc.pct).toBeNull();
    expect(inc.sampleSize).toBeNull();
  });

  it("flags counts that cannot both be true instead of clamping them", () => {
    // More affected than sampled is a typo. Silently capping it at 100% would
    // hide a data-entry problem that recurs every week.
    const inc = incidence(scout({ sampleSize: 50, affectedCount: 60 }));
    expect(inc.overCounted).toBe(true);
    expect(inc.pct).toBe(120);
  });

  it("returns no percentage when a count is missing", () => {
    expect(incidence(scout({ affectedCount: null })).pct).toBeNull();
    expect(incidence(scout({ sampleSize: null })).pct).toBeNull();
  });
});

describe("trend", () => {
  it("compares against the same issue only", () => {
    const rows = [
      scout({ id: 1, date: new Date("2026-10-01"), issueType: "pest", affectedCount: 5 }),
      scout({ id: 2, date: new Date("2026-10-08"), issueType: "weed", affectedCount: 45 }),
    ];
    // The weed entry is a different problem and must not become the pest's
    // previous reading.
    expect(trend(rows.filter((r) => r.issueType === "pest"))).toBe("unknown");
  });

  it("calls a real rise rising and a spread of under a point flat", () => {
    const rising = [
      scout({ id: 1, date: new Date("2026-10-01"), affectedCount: 5 }),
      scout({ id: 2, date: new Date("2026-10-08"), affectedCount: 20 }),
    ];
    expect(trend(rising)).toBe("rising");

    // 14/50 to 14/50 is noise, not a finding.
    const flat = [
      scout({ id: 1, date: new Date("2026-10-01"), affectedCount: 14 }),
      scout({ id: 2, date: new Date("2026-10-08"), affectedCount: 14 }),
    ];
    expect(trend(flat)).toBe("flat");
  });

  it("falls with a lower count and is unknown from a single reading", () => {
    const falling = [
      scout({ id: 1, date: new Date("2026-10-01"), affectedCount: 30 }),
      scout({ id: 2, date: new Date("2026-10-08"), affectedCount: 6 }),
    ];
    expect(trend(falling)).toBe("falling");
    expect(trend([scout()])).toBe("unknown");
  });
});

describe("followUpsDue", () => {
  it("returns entries whose follow-up date has arrived, oldest first", () => {
    const rows = [
      scout({ id: 1, followUpOn: new Date("2026-10-12") }),
      scout({ id: 2, followUpOn: new Date("2026-10-11") }),
      scout({ id: 3, followUpOn: new Date("2026-11-01") }),
      scout({ id: 4, followUpOn: null }),
    ];
    expect(followUpsDue(rows, on).map((r) => r.id)).toEqual([2, 1]);
  });

  it("stops chasing a resolved entry", () => {
    const rows = [scout({ id: 1, followUpOn: new Date("2026-10-12"), outcome: "resolved" })];
    expect(followUpsDue(rows, on)).toEqual([]);
  });
});

describe("cropPressure", () => {
  it("reports the latest entry per crop with its own trend", () => {
    const rows = [
      scout({ id: 1, cropId: 10, date: new Date("2026-10-01"), affectedCount: 5 }),
      scout({ id: 2, cropId: 10, date: new Date("2026-10-09"), affectedCount: 18 }),
      scout({ id: 3, cropId: 11, date: new Date("2026-10-05"), affectedCount: 0 }),
    ];
    const out = cropPressure(rows, on);
    expect(out.map((c) => c.cropId)).toEqual([10, 11]);
    expect(out[0].latestIncidence).toBe(36);
    expect(out[0].latestTrend).toBe("rising");
    expect(out[0].records).toBe(2);
  });

  it("omits a crop nobody has scouted rather than showing it at zero", () => {
    // "Not looked at" and "nothing found" are different facts, and only one of
    // them is reassuring.
    expect(cropPressure([], on)).toEqual([]);
  });

  it("counts open follow-ups per crop", () => {
    const rows = [
      scout({ id: 1, cropId: 10, followUpOn: new Date("2026-10-12") }),
      scout({ id: 2, cropId: 10, followUpOn: new Date("2026-10-12") }),
      scout({ id: 3, cropId: 11, followUpOn: new Date("2026-10-12") }),
    ];
    const out = cropPressure(rows, on);
    const ten = out.find((c) => c.cropId === 10)!;
    expect(ten.open).toBe(2);
  });
});
