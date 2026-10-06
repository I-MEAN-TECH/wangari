/**
 * Feed conversion drift — M3's "what will bite you" rule.
 *
 * Defended here: the silence rules (absent data on either side is never a
 * trend, improvement is never an action), the window boundaries, the
 * aggregate-ratio arithmetic, and the exact words — including the money,
 * which must come from the farm's own feed price or fall back to kilos.
 */

import { describe, it, expect } from "vitest";
import {
  feedTrend,
  RECENT_DAYS,
  TREND_WINDOW_DAYS,
  MIN_RECENT_DAYS,
  MIN_BASELINE_DAYS,
  DRIFT_FLOOR,
  type FeedDay,
} from "./feed-trend.js";

const NOW = new Date("2026-10-06T09:00:00+03:00");

/** A recorded day `daysAgo` days before NOW. */
function day(feedUsed: number, output: number, daysAgo: number): FeedDay {
  return { date: new Date(NOW.getTime() - daysAgo * 86400000), feedUsed, output };
}

/** `nBase` baseline days then `nRecent` recent days at the given rates. */
function series(
  baseFeed: number,
  baseOutput: number,
  recentFeed: number,
  recentOutput: number,
  opts: { nBase?: number; nRecent?: number } = {}
): FeedDay[] {
  const nBase = opts.nBase ?? MIN_BASELINE_DAYS;
  const nRecent = opts.nRecent ?? MIN_RECENT_DAYS;
  const base = Array.from({ length: nBase }, (_, i) => day(baseFeed, baseOutput, 10 + i * 3));
  const recent = Array.from({ length: nRecent }, (_, i) => day(recentFeed, recentOutput, 1 + i * 2));
  return [...base, ...recent];
}

const input = (days: FeedDay[], extra: Partial<Parameters<typeof feedTrend>[0]> = {}) =>
  ({ days, unit: "egg", label: "Layers - Pen B", now: NOW, ...extra });

describe("silence — when there is nothing honest to say", () => {
  it("says nothing with no records at all", () => {
    expect(feedTrend(input([]))).toBeNull();
  });

  it(`says nothing with fewer than ${MIN_RECENT_DAYS} recent days`, () => {
    // Two fresh days cannot separate a trend from two odd days.
    expect(feedTrend(input(series(10, 100, 20, 100, { nRecent: 2 })))).toBeNull();
  });

  it(`says nothing with fewer than ${MIN_BASELINE_DAYS} baseline days`, () => {
    expect(feedTrend(input(series(10, 100, 20, 100, { nBase: 3 })))).toBeNull();
  });

  it("says nothing when recent feed was never recorded", () => {
    const days = series(10, 100, 0, 100);
    expect(feedTrend(input(days))).toBeNull();
  });

  it("says nothing when output was never recorded", () => {
    expect(feedTrend(input(series(10, 100, 20, 0)))).toBeNull();
    expect(feedTrend(input(series(10, 0, 20, 100)))).toBeNull();
  });

  it("says nothing when feed per unit improved", () => {
    // 10kg/100 → 8kg/100 is better feed use, not an action.
    expect(feedTrend(input(series(10, 100, 8, 100)))).toBeNull();
  });

  it("says nothing when the worsening is inside the noise floor", () => {
    // +10% with plenty of recorded days — under DRIFT_FLOOR.
    expect(feedTrend(input(series(10, 100, 11, 100)))).toBeNull();
    expect(DRIFT_FLOOR).toBe(0.15);
  });

  it("ignores records older than the trend window", () => {
    const ancient = Array.from({ length: 6 }, (_, i) => day(10, 100, TREND_WINDOW_DAYS + 5 + i));
    const recent = Array.from({ length: MIN_RECENT_DAYS }, (_, i) => day(20, 100, 1 + i * 2));
    // Ancient days would have made a flat baseline; with them excluded the
    // baseline vanishes and the rule stays silent.
    expect(feedTrend(input([...ancient, ...recent]))).toBeNull();
  });
});

describe("the drift — what gets said when the data supports it", () => {
  it("calls a real worsening with the numbers its words claim", () => {
    // Baseline 10kg/100 eggs → 0.1 kg/egg; recent 20kg/100 → 0.2 kg/egg: +100%.
    const t = feedTrend(input(series(10, 100, 20, 100)))!;
    expect(t).not.toBeNull();
    expect(t.changePct).toBeCloseTo(1, 5);
    expect(t.recentRate).toBeCloseTo(0.2, 6);
    expect(t.baselineRate).toBeCloseTo(0.1, 6);
    expect(t.recentDays).toBe(MIN_RECENT_DAYS);
    expect(t.baselineDays).toBe(MIN_BASELINE_DAYS);

    expect(t.title).toBe("Layers - Pen B: feed per egg up 100%");
    expect(t.detail).toContain("0.2 kg of feed per egg");
    expect(t.detail).toContain("0.1 kg");
    expect(t.detail).toContain(`${MIN_RECENT_DAYS + MIN_BASELINE_DAYS} recorded days`);
    expect(t.detail).toContain("spoilage, pests, wet litter");

    // Extra feed: (0.2 − 0.1) × (300 eggs / 3 recent days) × 7 = 70 kg/week.
    expect(t.extraKgPerWeek).toBeCloseTo(70, 6);
    expect(t.extraKesPerWeek).toBeNull(); // no feed price supplied
    expect(t.moneyImpact).toBe("70 kg/week extra feed");
  });

  it("prices the waste from the farm's own feed spend, never a assumed rate", () => {
    const t = feedTrend(input(series(10, 100, 20, 100), { feedCostPerKg: 120 }))!;
    // 70 kg/week × KES 120 = KES 8,400.
    expect(t.extraKesPerWeek).toBeCloseTo(8400, 6);
    expect(t.moneyImpact).toBe("KES 8,400/week wasted at your feed price");
  });

  it("falls back to kilos when the feed price is zero, negative or absent", () => {
    for (const price of [null, undefined, 0, -5, Number.NaN]) {
      const t = feedTrend(input(series(10, 100, 20, 100), { feedCostPerKg: price as any }))!;
      expect(t.extraKesPerWeek).toBeNull();
      expect(t.moneyImpact).toContain("kg/week extra feed");
      expect(t.moneyImpact).not.toContain("KES");
    }
  });

  it("fires at exactly the floor and stays silent just below it", () => {
    // 0.115 / 0.10 = +15% exactly → fires; 0.1149 → silent.
    expect(feedTrend(input(series(10, 100, 11.5, 100)))).not.toBeNull();
    expect(feedTrend(input(series(10, 100, 11.4, 100)))).toBeNull();
  });

  it("uses aggregate ratios — a zero-output day cannot fake an improvement", () => {
    // Days with feed but no eggs (moult, heat) must not divide into the rate
    // as a zero; the aggregate ratio is total feed ÷ total output.
    const days: FeedDay[] = [
      ...Array.from({ length: 4 }, (_, i) => day(10, 100, 12 + i * 3)),
      day(5, 0, 3),   // feed with no output, recent window
      day(5, 0, 5),
      day(10, 100, 1),
    ];
    const t = feedTrend(input(days))!;
    expect(t).not.toBeNull();
    // recent: feed 20, output 100 → 0.2 vs baseline 0.1 → +100%.
    expect(t.recentRate).toBeCloseTo(0.2, 6);
    expect(t.recentDays).toBe(3);
  });
});
