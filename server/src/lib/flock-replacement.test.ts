/**
 * Flock replacement timing — M3's third rule.
 *
 * Defended here: the silence rules (no hatchDate, no card; young flocks say
 * nothing; future dates are typos, not trends), the phase boundaries at 64/72/80
 * weeks, layers-only honesty (the rule never guesses for broilers or cattle —
 * that is the caller's job to filter), and the exact words — including that the
 * money only ever comes from the farm's own recorded stocking cost.
 */

import { describe, it, expect } from "vitest";
import {
  flockReplacement,
  REPLACE_WINDOW_WEEKS,
  REPLACE_WINDOW_END_WEEKS,
  PLAN_AHEAD_WEEKS,
  LAY_START_WEEKS,
  type FlockReplacementInput,
} from "./flock-replacement.js";

const NOW = new Date("2026-10-06T09:00:00+03:00");
const WEEK = 7 * 86400000;

const input = (over: Partial<FlockReplacementInput> = {}): FlockReplacementInput => ({
  // 66 weeks by default — inside the planning phase, so every test that does
  // not opt out of speaking gets a card.
  arrivedAt: new Date(NOW.getTime() - 66 * WEEK),
  label: "Layers - Pen B",
  currentCount: 500,
  now: NOW,
  ...over,
});

describe("silence — when there is nothing honest to say", () => {
  it("says nothing while the flock is younger than the plan-ahead mark", () => {
    // A 40-week-old flock is 32 weeks from the window: no decision this month.
    expect(flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - 40 * WEEK) }))).toBeNull();
  });

  it(`says nothing until ${REPLACE_WINDOW_WEEKS - PLAN_AHEAD_WEEKS} weeks — the boundary itself is the first word`, () => {
    const at = REPLACE_WINDOW_WEEKS - PLAN_AHEAD_WEEKS; // 64 weeks
    expect(flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - (at - 1) * WEEK) }))).toBeNull();
    expect(flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - at * WEEK) }))).not.toBeNull();
  });

  it("says nothing without an arrival date — absent data is never a guess", () => {
    expect(flockReplacement(input({ arrivedAt: undefined as unknown as Date }))).toBeNull();
    expect(flockReplacement(input({ arrivedAt: "" as unknown as Date }))).toBeNull();
  });

  it("treats a future arrival date as an intake typo, not a trend", () => {
    expect(flockReplacement(input({ arrivedAt: new Date(NOW.getTime() + 2 * WEEK) }))).toBeNull();
  });

  it("says nothing for an empty flock — there are no birds to replace", () => {
    expect(flockReplacement(input({ currentCount: 0 }))).toBeNull();
    expect(flockReplacement(input({ currentCount: -3 }))).toBeNull();
  });
});

describe("the three phases and their exact words", () => {
  it("at 64-71 weeks it speaks in the planning voice, with runway named", () => {
    const r = flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - 66 * WEEK) }))!;
    expect(r.phase).toBe("planning");
    expect(r.weeksToWindow).toBe(REPLACE_WINDOW_WEEKS - 66);
    expect(r.title).toContain("plan replacement of 500 layers");
    expect(r.title).toContain("6 weeks to the drop");
    expect(r.detail).toContain("weeks since arrival");
    expect(r.detail).toContain(`week ${REPLACE_WINDOW_WEEKS}`);
    expect(r.detail).toContain("point-of-lay pullets");
  });

  it("at 72-79 weeks it is inside the window and the verbs change", () => {
    const r = flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - 74 * WEEK) }))!;
    expect(r.phase).toBe("window");
    expect(r.weeksToWindow).toBe(REPLACE_WINDOW_WEEKS - 74);
    expect(r.title).toContain("the lay drop starts now");
    expect(r.detail).toContain("Decide this month");
  });

  it(`at ${REPLACE_WINDOW_END_WEEKS}+ weeks it is overdue and names the trade`, () => {
    const r = flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - 85 * WEEK) }))!;
    expect(r.phase).toBe("overdue");
    expect(r.title).toContain("past the usual replacement age");
    expect(r.detail).toContain("feed bought for eggs that are not coming");
  });
});

describe("the age is derived, never claimed", () => {
  it(`counts weeks from arrival, floor-rounded (${LAY_START_WEEKS} weeks is the lay start, not the age)`, () => {
    // 66 weeks and 3 days must read as 66 weeks, not 67.
    const r = flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - (66 * WEEK + 3 * 86400000)) }))!;
    expect(r.ageWeeks).toBe(66);
  });

  it("carries the arrived-vs-age caveat in the detail", () => {
    const r = flockReplacement(input({ arrivedAt: new Date(NOW.getTime() - 66 * WEEK) }))!;
    expect(r.detail).toContain("counted from the day you got the birds");
  });
});

describe("the money is derived from the farm's own records, never assumed", () => {
  it("uses totalInvestment when recorded", () => {
    const r = flockReplacement(input({ totalInvestment: 150000 }))!;
    expect(r.replacementCostKes).toBe(150000);
    expect(r.moneyImpact).toContain("KES 150,000");
  });

  it("falls back to costPerAnimal × current count", () => {
    const r = flockReplacement(input({ costPerAnimal: 350 }))!;
    expect(r.replacementCostKes).toBe(350 * 500);
    expect(r.moneyImpact).toContain("KES 175,000");
  });

  it("prefers totalInvestment over the per-animal estimate", () => {
    const r = flockReplacement(input({ totalInvestment: 150000, costPerAnimal: 350 }))!;
    expect(r.replacementCostKes).toBe(150000);
  });

  it("says nothing about money when the records hold none", () => {
    const r = flockReplacement(input({}))!;
    expect(r.replacementCostKes).toBeNull();
    expect(r.moneyImpact).toBeUndefined();
  });

  it("ignores zero and negative costs", () => {
    const r = flockReplacement(input({ costPerAnimal: 0, totalInvestment: -5 }))!;
    expect(r.replacementCostKes).toBeNull();
    expect(r.moneyImpact).toBeUndefined();
  });
});
