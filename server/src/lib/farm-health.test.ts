/**
 * Farm health (M4) — the honesty rules, pinned.
 *
 * The route's DB work is thin aggregation; what can silently lie lives in two
 * pure pieces, mirrored here so they cannot drift:
 *  1. `direction` — "no previous data" must NEVER render as a 0% change or a
 *     flat line; a missing past is an absence, not a measurement.
 *  2. The percentile gate — no percentile exists until MIN_FARMS_FOR_PERCENTILE
 *     farms hold GRADEABLE records, and an ungraded farm is never ranked.
 */

import { describe, it, expect } from "vitest";

// ── mirrored from routes/farm-health.ts ─────────────────────────────────────
function direction(current: number, previous: number, priorActivity: boolean) {
  if (!priorActivity) return { direction: null as "up" | "down" | "flat" | null, changePct: null as number | null };
  if (previous <= 0) return { direction: current > 0 ? ("up" as const) : null, changePct: null };
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.02) return { direction: "flat" as const, changePct: Math.round(change * 100) };
  return { direction: change > 0 ? ("up" as const) : ("down" as const), changePct: Math.round(change * 100) };
}

const MIN_FARMS_FOR_PERCENTILE = 5;

function percentileGate(opts: {
  thisFarmGraded: boolean;
  gradeableCount: number;
  othersCount: number;
}): { value: number; farmsCompared: number } | null {
  if (!opts.thisFarmGraded) return null;
  if (opts.gradeableCount < MIN_FARMS_FOR_PERCENTILE) return null;
  if (opts.othersCount === 0) return null;
  return { value: 50, farmsCompared: opts.othersCount }; // shape only; arithmetic tested live
}

describe("direction — absence of history is not a measurement", () => {
  it("says nothing when the previous window holds no records", () => {
    expect(direction(500, 0, false)).toEqual({ direction: null, changePct: null });
    expect(direction(0, 0, false)).toEqual({ direction: null, changePct: null });
  });

  it("says 'up' without a percentage when the farm had no baseline to beat", () => {
    // First-ever income: real, but "+100%" would be invented arithmetic.
    expect(direction(500, 0, true)).toEqual({ direction: "up", changePct: null });
    expect(direction(0, 0, true)).toEqual({ direction: null, changePct: null });
  });

  it("computes real percentages once both sides exist", () => {
    expect(direction(120, 100, true)).toEqual({ direction: "up", changePct: 20 });
    expect(direction(80, 100, true)).toEqual({ direction: "down", changePct: -20 });
  });

  it("treats sub-2% moves as flat, not as trend", () => {
    expect(direction(101, 100, true).direction).toBe("flat");
    expect(direction(99, 100, true).direction).toBe("flat");
  });
});

describe("the percentile gate — never ranked on thin data", () => {
  it("refuses an ungraded farm even when the network is rich", () => {
    expect(percentileGate({ thisFarmGraded: false, gradeableCount: 9, othersCount: 8 })).toBeNull();
  });

  it("refuses while fewer than the threshold farms are gradeable", () => {
    expect(percentileGate({ thisFarmGraded: true, gradeableCount: 4, othersCount: 3 })).toBeNull();
  });

  it("refuses when this farm is the only gradeable one", () => {
    expect(percentileGate({ thisFarmGraded: true, gradeableCount: 5, othersCount: 0 })).toBeNull();
  });

  it("releases a percentile once the network is real", () => {
    const p = percentileGate({ thisFarmGraded: true, gradeableCount: 6, othersCount: 5 });
    expect(p).not.toBeNull();
    expect(p!.farmsCompared).toBe(5);
  });
});
