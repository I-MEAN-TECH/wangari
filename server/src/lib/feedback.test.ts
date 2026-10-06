import { describe, it, expect } from "vitest";

/**
 * The feedback instrument.
 *
 * This is the thing that decides whether we ever learn anything true about our
 * own product, so it has three jobs and all three are testable without a
 * database:
 *
 *   1. **Reject nonsense without throwing.** Submissions arrive from a public,
 *      unauthenticated link at an expo booth. Some will be empty, some will
 *      have a rating of 9, some will have invented tags. None may 500.
 *   2. **Reject invented tags.** If anyone can post `best: ["everything"]`,
 *      then "everything is best" tops the chart and the report is worthless.
 *   3. **Never produce NaN.** An average rating over zero ratings, or a
 *      percentage over zero responses, must be `null`. A dashboard that shows
 *      `NaN%` teaches the founder to distrust the whole page.
 *
 * And one constraint that is a product rule, not a technical one:
 * **there is no required free-text field** (module-plan.md §0.1 R1 — no typing).
 * A form that only "works" if a farmer types is a form that collects nothing.
 */

import {
  validateFeedback,
  summariseFeedback,
  RATING_SCALE,
  BEST_TAGS,
  IMPROVE_TAGS,
  SPECIES_OPTIONS,
  type FeedbackInput,
} from "./feedback.js";

const base = (over: Partial<FeedbackInput> = {}): FeedbackInput => ({
  source: "public_link",
  rating: 4,
  best: ["inafanya_kazi_bila_internet"],
  improve: ["mafunzo"],
  species: ["kuku"],
  ...over,
});

describe("the instrument is tap-only", () => {
  it("offers five rating points, each with an icon and a Swahili label", () => {
    expect(RATING_SCALE).toHaveLength(5);
    for (const point of RATING_SCALE) {
      expect(point.value).toBeGreaterThanOrEqual(1);
      expect(point.value).toBeLessThanOrEqual(5);
      expect(point.icon.length).toBeGreaterThan(0);
      expect(point.label.length).toBeGreaterThan(0);
    }
  });

  it("offers a non-empty best-tag and improve-tag vocabulary", () => {
    expect(Object.keys(BEST_TAGS).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(IMPROVE_TAGS).length).toBeGreaterThanOrEqual(4);
  });

  it("offers species options a Kenyan farmer would recognise", () => {
    expect(SPECIES_OPTIONS).toContain("kuku");
    expect(SPECIES_OPTIONS).toContain("mifugo");
    expect(SPECIES_OPTIONS).toContain("mazao");
  });

  it("does not require any free-text field", () => {
    const r = validateFeedback(base({ comment: null }));
    expect(r.ok).toBe(true);
  });
});

describe("validation rejects nonsense without throwing", () => {
  it("rejects a completely empty submission", () => {
    const r = validateFeedback({ source: "public_link" });
    expect(r.ok).toBe(false);
  });

  it("rejects an out-of-range rating but accepts the one it does not know how to read", () => {
    expect(validateFeedback(base({ rating: 9 })).ok).toBe(false);
    expect(validateFeedback(base({ rating: 0 })).ok).toBe(false);
    expect(validateFeedback(base({ rating: 3 })).ok).toBe(true);
  });

  it("does not throw on null, strings, or arrays where a number belongs", () => {
    for (const bad of [null, "four", [], {}, true]) {
      expect(() => validateFeedback(base({ rating: bad as any }))).not.toThrow();
    }
  });

  it("accepts a submission with no rating as long as something was chosen", () => {
    const r = validateFeedback({
      source: "booth",
      rating: null,
      best: ["ni_rahisi"],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown source", () => {
    expect(validateFeedback(base({ source: "carrier_pigeon" as any })).ok).toBe(false);
  });
});

describe("invented tags are dropped, not counted", () => {
  // Both cases below deliberately clear EVERY other field. `base()` populates
  // rating, improve and best, so leaving any of them set lets the submission
  // pass for an unrelated reason and the test never exercises the tag filter —
  // which is exactly how an invented tag ends up being counted.
  it("drops a best-tag that is not in the vocabulary", () => {
    const r = validateFeedback(
      base({ rating: null, best: ["kitu_nisichojua"], improve: [] })
    );
    expect(r.ok).toBe(false);
  });

  it("does not count an invented tag toward 'something was answered'", () => {
    const r = validateFeedback(
      base({ rating: null, best: [], improve: ["totally_made_up"] })
    );
    expect(r.ok).toBe(false);
  });

  it("keeps the valid tags and discards the invented ones", () => {
    const r = validateFeedback(base({ best: ["ni_rahisi", "invented_tag"] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.best).toEqual(["ni_rahisi"]);
  });

  it("de-duplicates a tag sent twice", () => {
    const r = validateFeedback(base({ improve: ["mafunzo", "mafunzo"] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.improve).toEqual(["mafunzo"]);
  });

  it("drops species values it does not recognise", () => {
    const r = validateFeedback(base({ species: ["kuku", "dragon"] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.species).toEqual(["kuku"]);
  });
});

describe("aggregation never divides by zero", () => {
  it("returns null averages and empty maps for no responses", () => {
    const s = summariseFeedback([]);
    expect(s.responses).toBe(0);
    expect(s.averageRating).toBeNull();
    expect(s.bestCounts).toEqual({});
    expect(s.improveCounts).toEqual({});
  });

  it("averages only the ratings that exist", () => {
    const s = summariseFeedback([
      { rating: 5, best: [], improve: [], species: [] },
      { rating: 3, best: [], improve: [], species: [] },
      { rating: null, best: [], improve: [], species: [] },
    ]);
    expect(s.responses).toBe(3);
    expect(s.averageRating).toBe(4);
    expect(s.ratedCount).toBe(2);
  });

  it("reports null, not NaN, when nobody rated", () => {
    const s = summariseFeedback([{ rating: null, best: ["ni_rahisi"], improve: [], species: [] }]);
    expect(s.averageRating).toBeNull();
    expect(Number.isNaN(s.averageRating as any)).toBe(false);
  });

  it("counts tags across responses, most-chosen first", () => {
    const s = summariseFeedback([
      { rating: 5, best: ["ni_rahisi"], improve: [], species: [] },
      { rating: 4, best: ["ni_rahisi", "naona_faida"], improve: [], species: [] },
      { rating: 2, best: ["naona_faida"], improve: ["mafunzo"], species: [] },
    ]);
    expect(s.bestCounts).toEqual({ ni_rahisi: 2, naona_faida: 2 });
    expect(s.bestRanked[0].count).toBe(2);
    expect(s.improveCounts).toEqual({ mafunzo: 1 });
  });

  it("segments by species so a poultry answer is not read as a dairy one", () => {
    const s = summariseFeedback([
      { rating: 5, best: [], improve: [], species: ["kuku"] },
      { rating: 2, best: [], improve: [], species: ["mifugo"] },
    ]);
    expect(s.speciesCounts).toEqual({ kuku: 1, mifugo: 1 });
    expect(s.bySpecies.kuku.responses).toBe(1);
    expect(s.bySpecies.kuku.averageRating).toBe(5);
    expect(s.bySpecies.mifugo.averageRating).toBe(2);
  });

  it("puts a response with no species in an 'unspecified' segment rather than dropping it", () => {
    const s = summariseFeedback([{ rating: 5, best: [], improve: [], species: [] }]);
    expect(s.bySpecies.unspecified.responses).toBe(1);
  });
});
