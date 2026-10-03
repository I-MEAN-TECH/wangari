import { describe, it, expect } from "vitest";
import {
  weatherActions,
  rainInWindow,
  firstHeavyRainDay,
  type ForecastDay,
} from "./weather-rules.js";

function day(date: string, rain: number, tempMax = 28, tempMin = 15): ForecastDay {
  return { date, rain, tempMax, tempMin };
}

function ids(forecast: ForecastDay[]): string[] {
  return weatherActions(forecast).map((a) => a.id);
}

describe("firstHeavyRainDay", () => {
  it("returns the earliest qualifying day, not the wettest", () => {
    // Acting on day 1 protects the crop; waiting for day 3 does not.
    const f = [day("2026-10-04", 0), day("2026-10-05", 6), day("2026-10-06", 40)];
    expect(firstHeavyRainDay(f, 5)).toBe(1);
  });

  it("returns -1 when nothing reaches the threshold", () => {
    expect(firstHeavyRainDay([day("2026-10-04", 4.9)], 5)).toBe(-1);
  });

  it("treats exactly the threshold as qualifying", () => {
    expect(firstHeavyRainDay([day("2026-10-04", 5)], 5)).toBe(0);
  });

  it("ignores a non-numeric rainfall reading", () => {
    const f = [day("2026-10-04", NaN), day("2026-10-05", 8)];
    expect(firstHeavyRainDay(f, 5)).toBe(1);
  });
});

describe("rainInWindow", () => {
  it("sums only the requested window", () => {
    const f = [day("a", 1), day("b", 2), day("c", 3), day("d", 4)];
    expect(rainInWindow(f, 0, 2)).toBe(3);
    expect(rainInWindow(f, 2, 2)).toBe(7);
  });

  it("returns zero for an empty forecast", () => {
    expect(rainInWindow([], 0, 5)).toBe(0);
  });
});

describe("weatherActions", () => {
  it("returns nothing without a forecast rather than throwing", () => {
    expect(weatherActions(null)).toEqual([]);
    expect(weatherActions(undefined)).toEqual([]);
    expect(weatherActions([])).toEqual([]);
  });

  it("returns nothing for a calendar with no significant weather", () => {
    // The rules must not manufacture work. A mild, evenly rainy week is a week
    // to get on with the farm, not a week needing a decision. (Light rain every
    // day is "nothing to decide"; light rain in a clear 7-day window IS a dry
    // spell, and the next test covers that side.)
    const calm = [
      day("2026-10-04", 2, 24, 14),
      day("2026-10-05", 1, 24, 14),
      day("2026-10-06", 2, 24, 14),
      day("2026-10-07", 1, 24, 14),
      day("2026-10-08", 2, 24, 14),
    ];
    expect(ids(calm)).toEqual([]);
  });

  describe("rain", () => {
    it("tells the farmer to hold irrigation the day it rains", () => {
      // Index 0 is today, so rain on day 0 means rain is falling right now.
      const f = [day("2026-10-04", 18, 24, 16), day("2026-10-05", 0, 26, 15)];
      expect(ids(f)).toContain("rain-today");
      // The same rain must not also be announced as coming.
      expect(ids(f)).not.toContain("rain-soon");
    });

    it("counts the days until rain and uses the singular correctly", () => {
      const one = weatherActions([day("a", 0), day("b", 10)]);
      const oneRain = one.find((a) => a.id === "rain-soon");
      expect(oneRain?.title).toContain("in 1 day ");

      const two = weatherActions([day("a", 0), day("b", 0), day("c", 10)]);
      const twoRain = two.find((a) => a.id === "rain-soon");
      expect(twoRain?.title).toContain("in 2 days");
    });

    it("escalates to high priority when rain is imminent", () => {
      const soon = weatherActions([day("a", 0), day("b", 12)]);
      expect(soon.find((a) => a.id === "rain-soon")?.priority).toBe("high");

      const later = weatherActions([day("a", 0), day("b", 0), day("c", 0), day("d", 0), day("e", 12)]);
      expect(later.find((a) => a.id === "rain-soon")?.priority).toBe("medium");
    });

    it("warns about heavy rain and exposure only above a much bigger number", () => {
      // 18mm is worth holding irrigation for; it is not worth a spoilage warning.
      const moderate = [day("a", 0), day("b", 18)];
      expect(ids(moderate)).not.toContain("heavy-rain");

      const heavy = [day("a", 0), day("b", 42)];
      expect(ids(heavy)).toContain("heavy-rain");
    });

    it("gives both the irrigation and the exposure warning on the same heavy day", () => {
      // Two different jobs: one is about the field, one is about produce that
      // spoils. A farmer who acts on only the first still loses the crop.
      const f = [day("a", 0), day("b", 42)];
      const found = ids(f);
      expect(found).toContain("rain-soon");
      expect(found).toContain("heavy-rain");
    });
  });

  describe("dry spell", () => {
    // The dry-spell rule needs the full 7-day window, so a real dry spell is
    // spelled out in full rather than abbreviated to three days.
    const dry = [
      day("2026-10-04", 0, 31, 18),
      day("2026-10-05", 0, 32, 19),
      day("2026-10-06", 0, 33, 19),
      day("2026-10-07", 0, 32, 19),
      day("2026-10-08", 0, 31, 18),
      day("2026-10-09", 0, 30, 17),
      day("2026-10-10", 0, 29, 16),
    ];

    it("detects a dry spell and tells the farmer to act before it starts", () => {
      expect(ids(dry)).toContain("dry-spell");
    });

    it("raises the priority when the dry spell is also hot", () => {
      expect(weatherActions(dry).find((a) => a.id === "dry-spell")?.priority).toBe("high");

      const coolDry = [
        day("a", 0, 22, 12),
        day("b", 0, 22, 12),
        day("c", 0, 23, 12),
        day("d", 0, 22, 12),
        day("e", 0, 22, 12),
        day("f", 0, 23, 12),
        day("g", 0, 22, 12),
      ];
      expect(weatherActions(coolDry).find((a) => a.id === "dry-spell")?.priority).toBe("medium");
    });

    it("does not call a single dry forecast day a dry spell", () => {
      expect(ids([day("a", 0, 32, 18)])).not.toContain("dry-spell");
    });

    it("does not call a 6-day forecast a full dry-spell window", () => {
      const sixDays = Array.from({ length: 6 }, (_, i) => day(`d${i}`, 0, 32, 18));
      expect(ids(sixDays)).not.toContain("dry-spell");
    });

    it("does not fire a dry spell when rain is in the window", () => {
      const wet = [
        day("a", 0, 32, 18),
        day("b", 0, 32, 18),
        day("c", 14, 32, 18),
        day("d", 0, 32, 18),
        day("e", 0, 33, 19),
        day("f", 0, 32, 18),
        day("g", 0, 32, 18),
      ];
      expect(ids(wet)).not.toContain("dry-spell");
    });

    it("waits for the full window before crying wolf", () => {
      // Three clear days with the forecast still running is not a dry spell.
      // Calling it one would fire every dry morning and be ignored by Friday.
      const partial = [day("a", 0, 32, 18), day("b", 0, 32, 18), day("c", 0, 33, 19)];
      expect(ids(partial)).not.toContain("dry-spell");
    });
  });

  describe("heat and cold", () => {
    it("flags a heat spell only when it lasts", () => {
      const oneHot = [day("a", 0, 39, 20), day("b", 3, 30, 18)];
      expect(ids(oneHot)).not.toContain("heat-stress");

      const sustained = [day("a", 0, 36, 21), day("b", 0, 38, 22), day("c", 0, 35, 20)];
      const hot = weatherActions(sustained).find((a) => a.id === "heat-stress");
      expect(hot).toBeTruthy();
      expect(hot?.priority).toBe("high");
    });

    it("warns about a cold night at 6C or below", () => {
      expect(ids([day("a", 0, 20, 6)])).toContain("cold-risk");
      expect(ids([day("a", 0, 20, 9)])).not.toContain("cold-risk");
    });

    it("mentions the actual temperature it reacted to", () => {
      const cold = weatherActions([day("2026-10-04", 0, 20, 4)]);
      expect(cold.find((a) => a.id === "cold-risk")?.title).toContain("4");
    });
  });

  describe("drying window", () => {
    it("offers a good drying window in the clear days BETWEEN two rains", () => {
      // A drying window and a dry spell are deliberately different things: the
      // first is a gap between rains worth using, the second is a drought
      // warning. A clear week therefore reads as a dry spell, not as an
      // invitation to cut and dry.
      const gapBetweenRains = [
        day("a", 22, 24, 16),
        day("b", 0, 27, 14),
        day("c", 0, 28, 15),
        day("d", 0, 29, 15),
        day("e", 0, 27, 14),
        day("f", 18, 23, 15),
        day("g", 0, 26, 14),
      ];
      const found = ids(gapBetweenRains);
      expect(found).toContain("drying-window");
      expect(found).not.toContain("dry-spell");
    });

    it("does not claim a drying window from a short forecast", () => {
      // Three clear days with more forecast to come is not yet a verdict.
      const short = [day("a", 0, 27, 14), day("b", 0, 28, 15), day("c", 0, 29, 15)];
      expect(ids(short)).not.toContain("drying-window");
    });

    it("does not offer a drying window on very hot days", () => {
      // 38C bleaches produce on the ground rather than curing it.
      const hot = [
        day("a", 20, 24, 16),
        day("b", 0, 38, 20),
        day("c", 0, 39, 21),
        day("d", 0, 37, 19),
        day("e", 15, 26, 17),
      ];
      expect(ids(hot)).not.toContain("drying-window");
    });
  });

  it("gives every action a link, a button and a farm-facing sentence", () => {
    const f = [
      day("a", 0, 36, 21),
      day("b", 0, 37, 22),
      day("c", 12, 30, 18),
      day("d", 0, 30, 17),
    ];
    const actions = weatherActions(f);
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.title.length).toBeGreaterThan(8);
      expect(a.detail.length).toBeGreaterThan(20);
      expect(a.href.startsWith("/")).toBe(true);
      expect(a.cta.length).toBeGreaterThan(3);
      expect(["critical", "high", "medium", "info"]).toContain(a.priority);
    }
  });

  it("never emits a dayIndex outside the forecast", () => {
    const f = [day("a", 0, 20, 4), day("b", 30, 36, 22), day("c", 0, 38, 23)];
    for (const a of weatherActions(f)) {
      expect(a.dayIndex).toBeGreaterThanOrEqual(-1);
      expect(a.dayIndex).toBeLessThan(f.length);
    }
  });

  it("uses no emoji, matching the house rule", () => {
    const f = [day("a", 0, 36, 21), day("b", 40, 30, 18)];
    for (const a of weatherActions(f)) {
      expect(a.title).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it("does not mutate the forecast it is given", () => {
    const f = [day("a", 0, 28, 15), day("b", 12, 26, 16)];
    const snapshot = JSON.stringify(f);
    weatherActions(f);
    expect(JSON.stringify(f)).toBe(snapshot);
  });
});