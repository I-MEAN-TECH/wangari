import { describe, it, expect } from "vitest";
import {
  assessColdChain,
  TARGET_TEMP_C,
  MAX_TEMP_C,
  COOLING_TARGET_HOURS,
  type ColdChainReading,
} from "./cold-chain.js";

const HARVEST = new Date("2026-10-03T06:00:00Z");

/** Build a reading `hoursAfter` hours from harvest. */
function at(hoursAfter: number, tempC: number, stage = "coldroom"): ColdChainReading {
  return { tempC, stage, recordedAt: new Date(HARVEST.getTime() + hoursAfter * 3600000) };
}

describe("assessColdChain — state", () => {
  it("reports unknown with no readings rather than a clean chain", () => {
    // The dangerous failure: an unmeasured batch that reads "clean" and ships.
    const r = assessColdChain([]);
    expect(r.state).toBe("unknown");
    expect(r.peakTempC).toBeNull();
    expect(r.message).toMatch(/no temperature readings/i);
  });

  it("handles null and undefined input", () => {
    expect(assessColdChain(null).state).toBe("unknown");
    expect(assessColdChain(undefined).state).toBe("unknown");
  });

  it("calls a steady cold chain clean", () => {
    const r = assessColdChain([at(1, 4), at(3, 4.5), at(6, 5)]);
    expect(r.state).toBe("clean");
    expect(r.peakTempC).toBe(5);
  });

  it("calls a mild wobble an excursion", () => {
    // 6C is over target but inside tolerance: local market, not export.
    const r = assessColdChain([at(1, 4), at(3, 6)]);
    expect(r.state).toBe("excursion");
    expect(r.message).toMatch(/wobbled/i);
  });

  it("calls a temperature past the limit broken", () => {
    const r = assessColdChain([at(1, 4), at(3, 12)]);
    expect(r.state).toBe("broken");
    expect(r.message).toMatch(/broken/i);
    expect(r.message).toContain("12");
  });

  it("does not let a single hot reading of a long series hide the rest", () => {
    const r = assessColdChain([at(1, 4), at(2, 14), at(3, 4), at(4, 4), at(5, 4)]);
    expect(r.state).toBe("broken");
  });
});

describe("assessColdChain — hours above threshold", () => {
  it("counts the duration between warm readings, not the number of them", () => {
    // Two readings 10 hours apart, both warm: one 10-hour excursion. Counting
    // readings would report "2" and a buyer would read that as minutes.
    const r = assessColdChain([at(1, 14), at(11, 15)]);
    expect(r.hoursAboveThreshold).toBe(10);
  });

  it("counts nothing for a chain that never went warm", () => {
    expect(assessColdChain([at(1, 4), at(5, 5)]).hoursAboveThreshold).toBe(0);
  });

  it("ignores the gap from a cool reading to a warm one as part of the excursion", () => {
    // 4C then 12C: we know it was fine at 4C and bad at 12C; the interval is
    // counted because we cannot claim it stayed cold in between.
    const r = assessColdChain([at(1, 4), at(7, 12)]);
    expect(r.hoursAboveThreshold).toBe(6);
  });
});

describe("assessColdChain — time to cool", () => {
  it("measures from harvest to the first reading at target", () => {
    const r = assessColdChain([at(3, 4), at(8, 4)], { harvestDate: HARVEST });
    expect(r.hoursToCool).toBe(3);
    expect(r.cooledInTime).toBe(true);
  });

  it("flags cooling outside the 5-hour window", () => {
    const r = assessColdChain([at(9, 4)], { harvestDate: HARVEST });
    expect(r.hoursToCool).toBe(9);
    expect(r.cooledInTime).toBe(false);
    expect(r.message).toMatch(/5 hours/i);
  });

  it("says nothing about cooling when the harvest date is unknown", () => {
    // Measuring from the first reading would flatter the result, because the
    // first reading is usually taken in the field.
    const r = assessColdChain([at(1, 4), at(2, 4)]);
    expect(r.hoursToCool).toBeNull();
    expect(r.cooledInTime).toBeNull();
  });

  it("leaves cooling unknown when the batch never reached target", () => {
    const r = assessColdChain([at(1, 14), at(2, 14)], { harvestDate: HARVEST });
    expect(r.hoursToCool).toBeNull();
    expect(r.cooledInTime).toBeNull();
  });

  it("uses the first reading to reach target, not a later one", () => {
    const r = assessColdChain([at(2, 4), at(10, 4)], { harvestDate: HARVEST });
    expect(r.hoursToCool).toBe(2);
  });

  it("accepts a harvest date as a string", () => {
    const r = assessColdChain([at(2, 4)], { harvestDate: HARVEST.toISOString() });
    expect(r.hoursToCool).toBe(2);
  });
});

describe("assessColdChain — robustness", () => {
  it("sorts readings taken out of order", () => {
    // Readings arrive from the farmer in whatever order they wrote them.
    const r = assessColdChain([at(9, 4), at(2, 4)], { harvestDate: HARVEST });
    expect(r.hoursToCool).toBe(2);
  });

  it("discards an unreadable timestamp rather than poisoning the series", () => {
    const r = assessColdChain([{ tempC: 4, recordedAt: "not a date" }, at(2, 4)], { harvestDate: HARVEST });
    expect(r.readingCount).toBe(1);
    expect(r.hoursToCool).toBe(2);
  });

  it("discards a non-numeric temperature", () => {
    const r = assessColdChain([{ tempC: NaN, recordedAt: HARVEST }, at(2, 4)]);
    expect(r.readingCount).toBe(1);
    expect(r.peakTempC).toBe(4);
  });

  it("never renders NaN into the message", () => {
    const cases = [
      assessColdChain([{ tempC: NaN, recordedAt: "bad" }]),
      assessColdChain([{ tempC: 4, recordedAt: "bad" }], { harvestDate: HARVEST }),
      assessColdChain([at(1, 4), at(2, 4)], { harvestDate: "bad" }),
    ];
    for (const r of cases) expect(r.message).not.toMatch(/NaN/);
  });

  it("reports a peak and average to one decimal", () => {
    const r = assessColdChain([at(1, 4), at(2, 5), at(3, 6)]);
    expect(r.peakTempC).toBe(6);
    expect(r.averageTempC).toBe(5);
  });

  it("states the thresholds it judged against", () => {
    // A farmer disputing an export rejection needs to see the number, not
    // just be told the chain broke.
    const broken = assessColdChain([at(1, 14)]);
    expect(broken.message).toContain(String(MAX_TEMP_C));
    const clean = assessColdChain([at(1, 4)]);
    expect(clean.message).toContain(String(TARGET_TEMP_C));
  });

  it("never mutates the readings array", () => {
    const readings = [at(9, 4), at(2, 4)];
    const snapshot = JSON.stringify(readings);
    assessColdChain(readings, { harvestDate: HARVEST });
    expect(JSON.stringify(readings)).toBe(snapshot);
  });

  it("keeps the documented cooling target in step with the rule", () => {
    const r = assessColdChain([at(COOLING_TARGET_HOURS, 4)], { harvestDate: HARVEST });
    expect(r.cooledInTime).toBe(true);
  });
});