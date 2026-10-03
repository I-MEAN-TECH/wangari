import { describe, it, expect } from "vitest";

/**
 * Offline read path.
 *
 * The write queue already saves a delivery with no signal and replays it later.
 * What was missing is the other half: with no signal the farmer opened
 * Deliveries and saw an EMPTY screen, so a safely-queued record looked lost.
 * That is worse than no offline support — it teaches the farmer that Wangari
 * loses data, which is the one thing a record book must never do.
 *
 * So the rule these tests pin is narrow and absolute:
 *
 *   **Never let cached data reach the farmer without its age attached.**
 *
 * Anything else is negotiable (how many entries, which key, when to evict).
 * This is not.
 */

import {
  resolveRead,
  freshnessLabel,
  classifyCacheAge,
  STALE_AFTER_MS,
  ABANDON_AFTER_MS,
  type CacheEntry,
} from "./read-cache";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const ago = (ms: number): CacheEntry<any> => ({ data: { litres: 140 }, at: NOW - ms });

describe("the network always wins", () => {
  it("uses the live response and claims no age", () => {
    const r = resolveRead<{ litres: number }>({ ok: true, data: { litres: 12 } }, ago(60_000), NOW);
    expect(r.data).toEqual({ litres: 12 });
    expect(r.source).toBe("network");
    expect(r.label).toBeNull();
    expect(r.ageMs).toBeNull();
  });

  it("prefers the network even when a perfectly fresh cache exists", () => {
    // If we served the cache here, a farmer would never see a corrected number.
    const r = resolveRead({ ok: true, data: "new" }, { data: "old", at: NOW - 1_000 }, NOW);
    expect(r.data).toBe("new");
  });
});

describe("falling back, always with the age attached", () => {
  it("serves the cache when the network fails", () => {
    const r = resolveRead({ ok: false }, ago(3_600_000), NOW);
    expect(r.data).toEqual({ litres: 140 });
    expect(r.source).toBe("cache");
  });

  it("never serves cached data with a null label", () => {
    // Every branch that returns cached data must carry an age. A cached number
    // shown without one is indistinguishable from a live one, and that is the
    // whole failure this file exists to prevent.
    for (const age of [0, 1_000, 60_000, 3_600_000, STALE_AFTER_MS, ABANDON_AFTER_MS, ABANDON_AFTER_MS * 30]) {
      const r = resolveRead({ ok: false }, ago(age), NOW);
      expect(r.label).toBeTruthy();
      expect(r.source).toBe("cache");
    }
  });

  it("reports the age in milliseconds so a banner can say it out loud", () => {
    expect(resolveRead({ ok: false }, ago(5 * 60_000), NOW).ageMs).toBe(300_000);
  });

  it("handles an array payload without turning it into an object", () => {
    // Regression: deliveries, sales and transactions all return bare arrays.
    // Spreading an array into {...d} produces {0:…, 1:…}, which every consumer
    // then reads as an empty list — so the farmer sees "your records are gone"
    // while holding them. The marker has to hang off a copied array.
    const rows = [
      { id: 1, litres: 12 },
      { id: 2, litres: 15 },
    ];
    const r = resolveRead({ ok: false }, { data: rows, at: NOW - 60_000 }, NOW);
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data).toHaveLength(2);
  });

  it("still serves a very old cache rather than an empty screen", () => {
    // The farmer's numbers still exist. An empty screen reads as "your record
    // is gone", which is the belief we are trying to kill.
    const r = resolveRead({ ok: false }, ago(ABANDON_AFTER_MS * 3), NOW);
    expect(r.data).toEqual({ litres: 140 });
    expect(r.age).toBe("abandoned");
    expect(r.label).toContain("day");
  });
});

describe("no cache and no network — an honest empty, not a fake one", () => {
  it("returns null rather than an empty object that would read as zero", () => {
    // `{}` or `{litres: 0}` renders as "you have supplied nothing", which is a
    // claim about the farmer's farm. Null renders as "could not load", which
    // is a claim about the network. Only one of those is true.
    const r = resolveRead({ ok: false }, null, NOW);
    expect(r.data).toBeNull();
    expect(r.source).toBe("none");
    expect(r.age).toBe("none");
  });
});

describe("age is never negative, whatever the clock says", () => {
  it("clamps a cache entry dated in the future", () => {
    // Skewed device clock, or a timezone bug in an old build. Either way a
    // negative age would render as "-3 min ago" and discredit everything else
    // on the screen.
    const future: CacheEntry<any> = { data: { litres: 140 }, at: NOW + 3_600_000 };
    const r = resolveRead({ ok: false }, future, NOW);
    expect(r.ageMs).toBe(0);
    expect(r.label).toBe("just now");
  });
});

describe("freshnessLabel says it the way a farmer would", () => {
  it("uses minutes, hours and days, never seconds", () => {
    expect(freshnessLabel(30_000)).toBe("just now");
    expect(freshnessLabel(5 * 60_000)).toBe("5 min ago");
    expect(freshnessLabel(60 * 60_000)).toBe("1 hr ago");
    expect(freshnessLabel(5 * 3_600_000)).toBe("5 hrs ago");
    expect(freshnessLabel(26 * 3_600_000)).toBe("1 day ago");
    expect(freshnessLabel(72 * 3_600_000)).toBe("3 days ago");
  });

  it("does not say '1 mins' or '1 days'", () => {
    expect(freshnessLabel(60 * 60_000)).toBe("1 hr ago");
    expect(freshnessLabel(24 * 3_600_000)).toBe("1 day ago");
  });

  it("degrades gracefully on a nonsense age", () => {
    expect(freshnessLabel(NaN)).toBe("just now");
    expect(freshnessLabel(-1)).toBe("just now");
  });
});

describe("escalation — the older it gets, the louder we get", () => {
  it("is fresh within a plausible gap between visits", () => {
    expect(classifyCacheAge(1_000)).toBe("fresh");
    expect(classifyCacheAge(STALE_AFTER_MS - 1)).toBe("fresh");
  });

  it("becomes stale past two days", () => {
    expect(classifyCacheAge(STALE_AFTER_MS)).toBe("stale");
  });

  it("becomes abandoned past a week", () => {
    expect(classifyCacheAge(ABANDON_AFTER_MS)).toBe("abandoned");
  });

  it("carries that verdict all the way through resolveRead", () => {
    expect(resolveRead({ ok: false }, ago(3 * 24 * 3_600_000), NOW).age).toBe("stale");
    expect(resolveRead({ ok: false }, ago(10 * 24 * 3_600_000), NOW).age).toBe("abandoned");
  });
});