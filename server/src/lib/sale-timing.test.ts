/**
 * Sale timing — the market-price × production join (M3).
 *
 * Two things are defended here:
 *
 *  1. The arithmetic (windows, thresholds, weekly stake).
 *  2. The words. The title/detail/moneyImpact strings are what a farmer
 *     actually reads, so every claim in them — percentages, sample sizes,
 *     regional labelling — is asserted directly. A trend message that says
 *     "14%" while the data says 9% is a bug the type checker cannot catch.
 *
 * Silence is a result too: half the tests below assert that NOTHING is said
 * when the data cannot carry the claim.
 */

import { describe, it, expect } from "vitest";
import {
  saleTiming,
  BASELINE_DAYS,
  RECENT_DAYS,
  MIN_RECENT_POINTS,
  MIN_BASELINE_POINTS,
  TREND_FLOOR,
  type SaleTimingInput,
} from "./sale-timing.js";
import type { PricePoint } from "./market-price.js";

const NOW = new Date("2026-10-06T09:00:00+03:00");

/** An offer recorded `daysAgo` days before NOW. */
function offer(price: number, daysAgo: number, region: string | null = "Kiambu"): PricePoint {
  return {
    commodity: "eggs",
    unit: "tray",
    priceKes: price,
    region,
    source: "Recorded by farmer",
    effectiveDate: new Date(NOW.getTime() - daysAgo * 86400000),
  };
}

/** Baseline offers (older than the recent window) + fresh ones, all in county. */
function series(baselinePrices: number[], recentPrices: number[], region: string | null = "Kiambu"): PricePoint[] {
  const baseline = baselinePrices.map((p, i) => offer(p, 60 + i * 10, region));
  const recent = recentPrices.map((p, i) => offer(p, 5 + i * 7, region));
  return [...baseline, ...recent];
}

const base: Omit<SaleTimingInput, "points"> = {
  commodity: "eggs",
  label: "Egg",
  region: "Kiambu",
  weeklyUnits: 40, // trays per week
  now: NOW,
};

const input = (points: PricePoint[], extra: Partial<SaleTimingInput> = {}): SaleTimingInput => ({
  ...base,
  points,
  ...extra,
});

describe("silence — when there is nothing honest to say", () => {
  it("says nothing with no price data at all", () => {
    expect(saleTiming(input([]))).toBeNull();
  });

  it("says nothing when the farm has no output to attach money to", () => {
    expect(saleTiming(input(series([100, 100, 100], [140, 140]), { weeklyUnits: 0 }))).toBeNull();
    expect(saleTiming(input(series([100, 100, 100], [140, 140]), { weeklyUnits: Number.NaN }))).toBeNull();
  });

  it(`says nothing with fewer than ${MIN_RECENT_POINTS} recent offers`, () => {
    // One fresh offer is a rumour, not a trend.
    expect(saleTiming(input(series([95, 100, 105], [140])))).toBeNull();
  });

  it(`says nothing with fewer than ${MIN_BASELINE_POINTS} baseline offers`, () => {
    expect(saleTiming(input(series([100, 100], [140, 145])))).toBeNull();
  });

  it("says nothing when the move is inside the noise floor", () => {
    // +9% with plenty of data on both sides — still under TREND_FLOOR.
    expect(saleTiming(input(series([100, 100, 100, 100], [109, 109])))).toBeNull();
  });

  it("says nothing when every offer is older than the baseline window", () => {
    const ancient = [400, 410, 420, 430].map((p) => offer(p, BASELINE_DAYS + 30));
    expect(saleTiming(input([...ancient, ...[500, 500].map((p) => offer(p, BASELINE_DAYS + 1))]))).toBeNull();
  });

  it("says nothing when the prices are zero or unparseable", () => {
    expect(saleTiming(input([offer(0, 10), offer(0, 20), offer(0, 60), offer(0, 70), offer(0, 80)]))).toBeNull();
  });
});

describe("the move — what gets said when the data supports it", () => {
  it("calls a real rise, with the numbers the message claims", () => {
    // Baseline ~100, recent ~120 → +20%.
    const insight = saleTiming(input(series([100, 100, 100, 100], [120, 120])))!;
    expect(insight).not.toBeNull();
    expect(insight.direction).toBe("up");
    expect(insight.changePct).toBeCloseTo(0.2, 5);
    expect(insight.title).toContain("Egg price up 20%");
    expect(insight.title).toContain("in Kiambu");
    expect(insight.recentAvg).toBeCloseTo(120, 5);
    expect(insight.baselineAvg).toBeCloseTo(100, 5);
    // 20 KES/tray move × 40 trays/week = KES 800/week.
    expect(insight.weeklyStakeKes).toBeCloseTo(800, 5);
    expect(insight.moneyImpact).toBe("KES 800/week at your current output");
    expect(insight.sampleSize).toBe(6);
    // The evidence line must carry both averages and the sample size.
    expect(insight.detail).toContain("KES 120 per tray");
    expect(insight.detail).toContain("KES 100");
    expect(insight.detail).toContain("4 offers");
    expect(insight.detail).toContain("leaving money behind");
  });

  it("calls a real fall and points the farmer at the offer, not at panic", () => {
    const insight = saleTiming(input(series([100, 100, 100, 100], [80, 80])))!;
    expect(insight.direction).toBe("down");
    expect(insight.changePct).toBeCloseTo(0.2, 5);
    expect(insight.title).toContain("Egg price down 20% in Kiambu");
    expect(insight.weeklyStakeKes).toBeCloseTo(800, 5);
    expect(insight.detail).toContain("Check every offer against the going rate");
  });

  it("fires at exactly the floor and stays silent just below it", () => {
    // +10% exactly → fires; +9% → silent. The floor is a line, not a vibe.
    expect(saleTiming(input(series([100, 100, 100, 100], [110, 110])))).not.toBeNull();
    expect(saleTiming(input(series([100, 100, 100, 100], [109, 109])))).toBeNull();
    expect(TREND_FLOOR).toBe(0.1);
  });

  it("counts a future-dated offer as fresh rather than discarding it", () => {
    const future: PricePoint = { ...offer(130, 0), effectiveDate: new Date(NOW.getTime() + 86400000) };
    const insight = saleTiming(input([...series([100, 100, 100, 100], [125]), future]))!;
    expect(insight).not.toBeNull();
    expect(insight.sampleSize).toBe(6);
  });

  it("quotes the unit from the newest offer", () => {
    const points = series([100, 100, 100, 100], [130, 130]);
    const newest = points.reduce((a, b) =>
      new Date(a.effectiveDate).getTime() > new Date(b.effectiveDate).getTime() ? a : b
    );
    newest.unit = "crate";
    const insight = saleTiming(input(points))!;
    expect(insight.unit).toBe("crate");
    expect(insight.detail).toContain("per crate");
  });
});

describe("the regional rule — a farmer can only sell where he is", () => {
  it("uses the county pool outright, even when national numbers disagree", () => {
    // County says +20%; national says −50%. The county wins completely —
    // mixing the pools would invent a trend no farmer can act on.
    const county = series([100, 100, 100, 100], [120, 120], "Kiambu");
    const national = series([100, 100, 100, 100], [50, 50], null);
    const insight = saleTiming(input([...county, ...national]))!;
    expect(insight.direction).toBe("up");
    expect(insight.changePct).toBeCloseTo(0.2, 5);
    expect(insight.sourceLabel).toBe("Kiambu");
    expect(insight.detail).toContain("Recorded by farmers in Kiambu");
  });

  it("falls back to national offers only when the county has none, and says so", () => {
    const national = series([100, 100, 100, 100], [130, 130], null);
    const insight = saleTiming(input(national))!;
    expect(insight.sourceLabel).toBe("nationally");
    expect(insight.title).toContain("up 30% nationally");
    expect(insight.detail).toContain("No offers recorded in your county yet");
  });

  it("ignores other counties' offers when its own county has data", () => {
    const county = series([100, 100, 100, 100], [130, 130], "Kiambu");
    const elsewhere = series([100, 100, 100, 100], [60, 60], "Nakuru");
    const insight = saleTiming(input([...county, ...elsewhere]))!;
    expect(insight.changePct).toBeCloseTo(0.3, 5);
    expect(insight.sampleSize).toBe(6);
  });
});

describe("window hygiene", () => {
  it("files a 45-day-old offer under baseline, not recent", () => {
    // The spike at 45 days is old news. Counted as "recent" it would produce a
    // fake +13% surge; correctly aged into the baseline it leaves the recent
    // month flat, and the rule says nothing. Both readings are asserted.
    const points = [
      ...[100, 100, 100, 100].map((p, i) => offer(p, 60 + i * 10)),
      offer(140, 45),
      offer(100, 5),
      offer(100, 12),
    ];
    const recentIf45WereRecent = (100 + 100 + 140) / 3;
    const baselineMean = (100 * 4) / 4;
    expect(recentIf45WereRecent / baselineMean - 1).toBeGreaterThan(TREND_FLOOR); // would have fired
    expect(saleTiming(input(points))).toBeNull(); // correctly does not
  });

  it("keeps BASELINE_DAYS wide enough to hold a quarter of history", () => {
    expect(BASELINE_DAYS).toBeGreaterThan(RECENT_DAYS);
    expect(BASELINE_DAYS).toBeGreaterThanOrEqual(90);
  });
});
