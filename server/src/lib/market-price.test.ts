import { describe, it, expect } from "vitest";
import {
  compareToBenchmark,
  pickBenchmark,
  describeAge,
  benchmarkAgeDays,
  type PricePoint,
} from "./market-price.js";

const NOW = new Date("2026-10-03T08:00:00Z");

function point(over: Partial<PricePoint> = {}): PricePoint {
  return {
    commodity: "milk",
    unit: "litre",
    priceKes: 60,
    region: "Nakuru",
    source: "Dairy cooperative",
    effectiveDate: new Date("2026-10-01"),
    ...over,
  };
}

describe("pickBenchmark", () => {
  it("prefers the farmer's own region", () => {
    const chosen = pickBenchmark(
      [point({ region: "Kisumu", priceKes: 55 }), point({ region: "Nakuru", priceKes: 60 })],
      "Nakuru"
    );
    expect(chosen?.region).toBe("Nakuru");
  });

  // The reason regional beats fresher-national: you can only sell where you are.
  it("prefers a stale regional price over a fresh national one", () => {
    const chosen = pickBenchmark(
      [
        point({ region: "Nakuru", priceKes: 60, effectiveDate: new Date("2026-07-01") }),
        point({ region: null, priceKes: 72, effectiveDate: new Date("2026-10-02") }),
      ],
      "Nakuru"
    );
    expect(chosen?.region).toBe("Nakuru");
  });

  it("falls back to the national default only when no regional price exists", () => {
    const chosen = pickBenchmark(
      [point({ region: null, priceKes: 72 }), point({ region: "Kisumu", priceKes: 55 })],
      "Nakuru"
    );
    expect(chosen?.region).toBeNull();
  });

  it("takes the most recent price within a region", () => {
    const chosen = pickBenchmark(
      [
        point({ priceKes: 50, effectiveDate: new Date("2026-08-01") }),
        point({ priceKes: 65, effectiveDate: new Date("2026-10-01") }),
      ],
      "Nakuru"
    );
    expect(chosen?.priceKes).toBe(65);
  });

  it("matches a region regardless of case and spacing", () => {
    expect(pickBenchmark([point({ region: " nakuru " })], "NAKURU")?.region).toBe(" nakuru ");
  });

  it("ignores a zero or unparseable price", () => {
    expect(pickBenchmark([point({ priceKes: 0 })], "Nakuru")).toBeNull();
    expect(pickBenchmark([point({ priceKes: "x" as unknown as number })], "Nakuru")).toBeNull();
  });

  it("returns null for an empty list rather than throwing", () => {
    expect(pickBenchmark([], "Nakuru")).toBeNull();
    expect(pickBenchmark(null as unknown as PricePoint[], "Nakuru")).toBeNull();
  });

  it("accepts a numeric string from a Postgres DECIMAL column", () => {
    const chosen = pickBenchmark([point({ priceKes: "60.50" as unknown as number })], "Nakuru");
    expect(chosen).toBeTruthy();
    expect(compareToBenchmark(50, [point({ priceKes: "60.50" as unknown as number })], { region: "Nakuru", now: NOW }).benchmark).toBe(60.5);
  });
});

describe("benchmarkAgeDays / describeAge", () => {
  it("measures whole days", () => {
    expect(benchmarkAgeDays(new Date("2026-10-01"), NOW)).toBe(2);
    expect(benchmarkAgeDays(new Date("2026-10-03"), NOW)).toBe(0);
  });

  it("never returns a negative age for a future date", () => {
    // Clock skew between the VPS and the seeding job must not produce "-1 days old".
    expect(benchmarkAgeDays(new Date("2026-10-10"), NOW)).toBe(0);
  });

  it("reports infinity rather than NaN for an unreadable date", () => {
    expect(benchmarkAgeDays("not a date", NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(describeAge("not a date", NOW)).toBe("date unknown");
  });

  it("phrases age in words a farmer can read", () => {
    expect(describeAge(new Date("2026-10-03"), NOW)).toBe("today");
    expect(describeAge(new Date("2026-10-02"), NOW)).toBe("yesterday");
    expect(describeAge(new Date("2026-09-28"), NOW)).toBe("5 days ago");
    expect(describeAge(new Date("2026-09-03"), NOW)).toMatch(/weeks ago/);
    expect(describeAge(new Date("2026-05-03"), NOW)).toMatch(/months ago/);
  });
});

describe("compareToBenchmark", () => {
  const nakuru = [point({ priceKes: 60, unit: "litre" })];

  it("flags a price below the floor", () => {
    const r = compareToBenchmark(50, nakuru, { region: "Nakuru", now: NOW });
    expect(r.verdict).toBe("below");
    expect(r.difference).toBe(-10);
    expect(r.message).toContain("KES 10");
    expect(r.message).toContain("Nakuru");
  });

  it("converts the gap into money on the load when a quantity is given", () => {
    // 10 KES under on 400 litres is the number that changes a decision.
    const r = compareToBenchmark(50, nakuru, { region: "Nakuru", quantity: 400, now: NOW });
    expect(r.potentialKes).toBe(-4000);
    expect(r.message).toContain("4,000");
  });

  it("calls a price at or just above the benchmark fair", () => {
    // 57 on 60 is 95% — near enough that telling a farmer they were underpaid
    // would be noise, and noise is how alerts get ignored.
    expect(compareToBenchmark(57, nakuru, { region: "Nakuru", now: NOW }).verdict).toBe("at");
    expect(compareToBenchmark(60, nakuru, { region: "Nakuru", now: NOW }).verdict).toBe("at");
  });

  it("praises a price above the benchmark", () => {
    const r = compareToBenchmark(70, nakuru, { region: "Nakuru", now: NOW });
    expect(r.verdict).toBe("above");
    expect(r.message).toContain("good price");
  });

  it("asks for a price instead of guessing when none was entered", () => {
    expect(compareToBenchmark(null, nakuru, { region: "Nakuru", now: NOW }).verdict).toBe("unknown");
    expect(compareToBenchmark(0, nakuru, { region: "Nakuru", now: NOW }).verdict).toBe("unknown");
    expect(compareToBenchmark("", nakuru, { region: "Nakuru", now: NOW }).message).toMatch(/offered/i);
  });

  it("says so plainly when there is no reference yet", () => {
    const r = compareToBenchmark(50, [], { region: "Kisumu", now: NOW });
    expect(r.verdict).toBe("unknown");
    expect(r.benchmark).toBeNull();
    expect(r.message).toMatch(/no price reference/i);
  });

  it("marks a stale benchmark as a guide rather than the truth", () => {
    const stale = [point({ effectiveDate: new Date("2026-05-01") })];
    const r = compareToBenchmark(50, stale, { region: "Nakuru", now: NOW });
    expect(r.stale).toBe(true);
    expect(r.message).toMatch(/months ago/);
    expect(r.message).toMatch(/guide/i);
  });

  it("does not mark a fresh benchmark stale", () => {
    const r = compareToBenchmark(50, nakuru, { region: "Nakuru", now: NOW });
    expect(r.stale).toBe(false);
    expect(r.message).not.toMatch(/guide/i);
  });

  it("carries the source through so the farmer can judge it", () => {
    const r = compareToBenchmark(50, nakuru, { region: "Nakuru", now: NOW });
    expect(r.source).toBe("Dairy cooperative");
    expect(r.ageLabel).toBe("2 days ago");
  });

  it("never renders NaN into a sentence", () => {
    // "KES NaN per litre left on the table" is the failure mode this guards.
    const r = compareToBenchmark(50, [point({ priceKes: "0" as unknown as number })], { region: "Nakuru", now: NOW });
    expect(r.message).not.toMatch(/NaN/);
    expect(r.verdict).toBe("unknown");
  });

  it("handles a quantity of zero without inventing money", () => {
    const r = compareToBenchmark(50, nakuru, { region: "Nakuru", quantity: 0, now: NOW });
    expect(r.potentialKes).toBeNull();
  });

  it("uses no emoji, matching the house rule", () => {
    const r = compareToBenchmark(50, nakuru, { region: "Nakuru", quantity: 100, now: NOW });
    expect(r.message).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});