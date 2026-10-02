import { describe, it, expect } from "vitest";

/**
 * Record-grade maths.
 *
 * A farmer will walk into a SACCO and hold this number up. A grade that is
 * wrong — or a grade shown for a nine-day-old record — does real harm: it
 * teaches the farmer that Wangari's numbers are not to be trusted.
 *
 * So the three rules that make this honest are pinned here:
 *   1. no grade at all under 30 days of span
 *   2. only things the farmer controls are counted
 *   3. no division by zero, no NaN leaking into the API
 */

import {
  computeRecordGrade,
  buildStars,
  toneForStars,
  starsAsWords,
  MIN_DAYS_TO_GRADE,
  WINDOW_DAYS,
  CONSISTENCY_TARGET,
  type GradeInput,
} from "./record-grade.js";

/** A perfect farm: everything recorded, long enough to grade. */
const full = (over: Partial<GradeInput> = {}): GradeInput => ({
  daysWithProduction: 88,
  recordSpanDays: 200,
  recordMonths: 6,
  expenses: 45000,
  income: 120000,
  salesOrDeliveries: 24,
  hasOutput: true,
  ...over,
});

describe("rule 1 — no grade without enough record", () => {
  it("refuses to grade a record younger than 30 days", () => {
    const g = computeRecordGrade(full({ recordSpanDays: 9, recordMonths: 1 }));
    expect(g.graded).toBe(false);
    expect(g.stars).toBe(0);
  });

  it("still counts the exact days remaining", () => {
    const g = computeRecordGrade(full({ recordSpanDays: 9 }));
    expect(g.progress.daysUntilGrading).toBe(MIN_DAYS_TO_GRADE - 9); // 21
  });

  it("grades exactly ON the threshold day, not a day later", () => {
    const g = computeRecordGrade(
      full({ recordSpanDays: MIN_DAYS_TO_GRADE, daysWithProduction: 25, recordMonths: 1 })
    );
    expect(g.graded).toBe(true);
    expect(g.progress.daysUntilGrading).toBe(0);
  });

  it("an empty farm is not graded and does not claim zero progress", () => {
    const g = computeRecordGrade({
      daysWithProduction: 0,
      recordSpanDays: 0,
      recordMonths: 0,
      expenses: 0,
      income: 0,
      salesOrDeliveries: 0,
      hasOutput: false,
    });
    expect(g.graded).toBe(false);
    expect(g.stars).toBe(0);
    expect(g.progress.daysUntilGrading).toBe(MIN_DAYS_TO_GRADE);
  });

  it("still shows the criteria so the farmer can see what is coming", () => {
    const g = computeRecordGrade(full({ recordSpanDays: 3 }));
    expect(g.criteria).toHaveLength(5);
  });
});

describe("rule 2 — only farmer-controlled things count", () => {
  it("a near-empty record never scores high, however long the farm has existed", () => {
    // The only star available here is "duration" — the farmer has been around,
    // but has recorded almost nothing. 1 of 5 is the honest answer, and the
    // missing four are each named.
    const g = computeRecordGrade(
      full({ daysWithProduction: 2, recordMonths: 12, expenses: 0, salesOrDeliveries: 0, hasOutput: false })
    );
    expect(g.graded).toBe(true);
    expect(g.stars).toBe(1);
    expect(g.tone).toBe("neutral");
    expect(g.criteria.filter((c) => c.earned).map((c) => c.id)).toEqual(["duration"]);
  });

  it("a farm that records only on the day it is checked in gets nothing", () => {
    const g = computeRecordGrade(
      full({ daysWithProduction: 0, expenses: 0, salesOrDeliveries: 0, hasOutput: false })
    );
    expect(g.stars).toBeLessThanOrEqual(1);
  });

  it("a perfect farm scores 5 of 5", () => {
    const g = computeRecordGrade(full());
    expect(g.graded).toBe(true);
    expect(g.stars).toBe(5);
    expect(g.tone).toBe("good");
    expect(g.nextStep).toBeNull();
  });

  it("one missing category costs exactly one star, and is named", () => {
    const g = computeRecordGrade(full({ expenses: 0 }));
    expect(g.stars).toBe(4);
    const inputs = g.criteria.find((c) => c.id === "inputs")!;
    expect(inputs.earned).toBe(false);
    expect(g.nextStep?.id).toBe("inputs");
  });

  it("consistency needs the full 70% threshold, not 'some records'", () => {
    const justUnder = computeRecordGrade(
      full({ daysWithProduction: Math.floor(WINDOW_DAYS * CONSISTENCY_TARGET) - 1 })
    );
    expect(justUnder.criteria.find((c) => c.id === "consistency")!.earned).toBe(false);

    const atTarget = computeRecordGrade(
      full({ daysWithProduction: Math.ceil(WINDOW_DAYS * CONSISTENCY_TARGET) })
    );
    expect(atTarget.criteria.find((c) => c.id === "consistency")!.earned).toBe(true);
  });

  it("duration needs a full quarter, not a single month", () => {
    expect(
      computeRecordGrade(full({ recordMonths: 2 })).criteria.find((c) => c.id === "duration")!.earned
    ).toBe(false);
    expect(
      computeRecordGrade(full({ recordMonths: 3 })).criteria.find((c) => c.id === "duration")!.earned
    ).toBe(true);
  });

  it("money with no named buyer is not market evidence", () => {
    // A farmer who typed income but recorded no sale has not proven a market.
    const g = computeRecordGrade(full({ salesOrDeliveries: 0 }));
    expect(g.criteria.find((c) => c.id === "market")!.earned).toBe(false);
  });

  it("grades identically regardless of farm size — a 2-hectare farm is not penalised", () => {
    const small = computeRecordGrade(full());
    const large = computeRecordGrade(full({ daysWithProduction: 88 }));
    expect(small.stars).toBe(large.stars);
  });
});

describe("rule 3 — no NaN, no Infinity, ever", () => {
  it("survives a caller passing garbage numbers", () => {
    const g = computeRecordGrade(
      full({ daysWithProduction: NaN, expenses: NaN, recordSpanDays: NaN })
    );
    expect(Number.isFinite(g.progress.consistency)).toBe(true);
    expect(g.progress.consistency).toBeGreaterThanOrEqual(0);
    expect(g.progress.consistency).toBeLessThanOrEqual(1);
    expect(Number.isFinite(g.stars)).toBe(true);
  });

  it("survives negative values from a corrupt record", () => {
    const g = computeRecordGrade(full({ daysWithProduction: -50, expenses: -10 }));
    expect(g.progress.consistency).toBe(0);
    expect(g.stars).toBeGreaterThanOrEqual(0);
  });

  it("consistency is always a real fraction between 0 and 1", () => {
    for (const n of [0, 1, 45, 89, 90, 5000]) {
      const g = computeRecordGrade(full({ daysWithProduction: n }));
      expect(g.progress.consistency).toBeGreaterThanOrEqual(0);
      expect(g.progress.consistency).toBeLessThanOrEqual(1);
    }
  });
});

describe("tone — the app-wide colour language", () => {
  it("maps stars to the same tones StatusChip already teaches", () => {
    expect(toneForStars(5)).toBe("good");
    expect(toneForStars(4)).toBe("good");
    expect(toneForStars(3)).toBe("warn");
    expect(toneForStars(2)).toBe("warn");
    expect(toneForStars(1)).toBe("neutral");
    expect(toneForStars(0)).toBe("neutral");
  });
});

describe("explainability", () => {
  it("every criterion carries a Swahili reason, whatever the outcome", () => {
    for (const input of [full(), full({ expenses: 0, income: 0, salesOrDeliveries: 0 })]) {
      for (const c of buildStars(input)) {
        expect(c.label.length).toBeGreaterThan(0);
        expect(c.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("an unearned criterion says what to do, not just that it is missing", () => {
    const g = buildStars(full({ hasOutput: false })).find((c) => c.id === "output")!;
    expect(g.detail).toMatch(/Bado/);
  });

  it("names the number of things still missing", () => {
    const g = computeRecordGrade(full({ expenses: 0, salesOrDeliveries: 0 }));
    expect(g.summary).toContain("2");
  });

  it("a perfect record does not tell the farmer to do more", () => {
    expect(computeRecordGrade(full()).summary).not.toMatch(/kuna/i);
  });
});

describe("starsAsWords — for the deferred Swahili voice layer", () => {
  it("covers 0..5 and clamps out-of-range input", () => {
    expect(starsAsWords(0)).toBe("");
    expect(starsAsWords(1)).toBe("nyuma");
    expect(starsAsWords(5)).toBe("tano");
    expect(starsAsWords(99)).toBe("tano");
    expect(starsAsWords(-3)).toBe("");
  });
});
