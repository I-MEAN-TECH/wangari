import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  interpretWeatherForFarm,
  type WeatherDay,
  type FarmSpecies,
} from "../lib/weather-advisory.js";

/**
 * Crop-and-livestock-aware weather interpretation (Free Core).
 *
 * The weather endpoint returns a 7-day forecast. The free user needs
 * the same forecast reframed as advice for what is on their farm, not
 * as raw numbers. The pure function `interpretWeatherForFarm` takes
 * the forecast plus the species the farm is keeping, and returns
 * a list of advisories — short sentences the farmer can act on.
 *
 * Examples:
 *   - layers + high 32°C → "Eggs likely to drop 5-10% this week from heat"
 *   - maize + 0mm rain for 7 days → "Dry week ahead — irrigate or expect
 *     moisture stress"
 *   - any + rain > 5mm → "Spraying pesticide today will wash off — wait"
 *   - any + wind > 25 km/h → "Skip the spray — spray will drift"
 */

const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

const baseDay = (overrides: Partial<WeatherDay>): WeatherDay => ({
  date: "2026-10-16",
  day: "Today",
  tempMin: 18,
  tempMax: 28,
  rain: 0,
  precipitation: 0,
  weatherCode: 0,
  condition: "Clear",
  description: "Clear sky",
  icon: "sun",
  ...overrides,
});

const layersOnly: FarmSpecies[] = [{ kind: "flock", type: "layers" }];
const broilersOnly: FarmSpecies[] = [{ kind: "flock", type: "broilers" }];
const maizeOnly: FarmSpecies[] = [{ kind: "crop", type: "maize" }];

describe("interpretWeatherForFarm", () => {
  it("returns an empty advisory list for a benign week and a free-core user with no species", () => {
    const r = interpretWeatherForFarm([baseDay({})], []);
    expect(Array.isArray(r.advisories)).toBe(true);
    expect(r.advisories).toHaveLength(0);
  });

  it("warns when layer flock sees a heat-stress day (max >= 30°C)", () => {
    const day = baseDay({ tempMax: 32, tempMin: 22 });
    const r = interpretWeatherForFarm([day], layersOnly);
    expect(r.advisories.some((x) => /heat|hot|drop.*egg|lay/i.test(x.text))).toBe(true);
    expect(r.advisories.find((x) => /heat|hot|drop.*egg|lay/i.test(x.text))?.severity).toBe("warn");
  });

  it("does not warn layers on a mild day (max 26°C)", () => {
    const day = baseDay({ tempMax: 26 });
    const r = interpretWeatherForFarm([day], layersOnly);
    expect(r.advisories.some((x) => /heat|hot|drop.*egg/i.test(x.text))).toBe(false);
  });

  it("warns broilers on extreme heat (max >= 33°C) because broilers are more sensitive", () => {
    const day = baseDay({ tempMax: 33 });
    const r = interpretWeatherForFarm([day], broilersOnly);
    expect(r.advisories.some((x) => /broiler|heat|hot|mortal/i.test(x.text))).toBe(true);
  });

  it("does not warn broilers on a 30°C day (their threshold is 33°C)", () => {
    const day = baseDay({ tempMax: 30 });
    const r = interpretWeatherForFarm([day], broilersOnly);
    expect(r.advisories.some((x) => /broiler/i.test(x.text))).toBe(false);
  });

  it("flags a dry spell for maize when total rain over 7 days is 0", () => {
    const days = Array.from({ length: 7 }, (_, i) => baseDay({ date: `2026-10-${16 + i}`, day: i === 0 ? "Today" : "Day " + (i + 1), rain: 0 }));
    const r = interpretWeatherForFarm(days, maizeOnly);
    expect(r.advisories.some((x) => /dry|irrigat|moisture|stress/i.test(x.text))).toBe(true);
  });

  it("does NOT flag a dry spell when total rain is at least 5mm across the week", () => {
    const days = [
      baseDay({ rain: 2 }),
      baseDay({ rain: 1, date: "2026-10-17" }),
      baseDay({ rain: 2, date: "2026-10-18" }),
    ];
    const r = interpretWeatherForFarm(days, maizeOnly);
    expect(r.advisories.some((x) => /dry|irrigat/i.test(x.text))).toBe(false);
  });

  it("says skip the spray when it will rain today", () => {
    const day = baseDay({ rain: 6, condition: "Rain" });
    const r = interpretWeatherForFarm([day], layersOnly);
    expect(r.advisories.some((x) => /spray|pesticide|wash off/i.test(x.text))).toBe(true);
  });

  it("says skip the spray when wind is high (>= 25 km/h) — a generic rule", () => {
    const day = { ...baseDay({}), windSpeed: 28 };
    const r = interpretWeatherForFarm([day], layersOnly);
    expect(r.advisories.some((x) => /wind|spray.*drift|drift/i.test(x.text))).toBe(true);
  });

  it("returns advisories sorted by severity (warn first, info last)", () => {
    const days = [
      baseDay({ tempMax: 32 }),
      baseDay({ rain: 0, date: "2026-10-17" }),
    ];
    const r = interpretWeatherForFarm(days, layersOnly);
    const warnIdx = r.advisories.findIndex((x) => x.severity === "warn");
    const infoIdx = r.advisories.findIndex((x) => x.severity === "info");
    if (warnIdx >= 0 && infoIdx >= 0) {
      expect(warnIdx).toBeLessThan(infoIdx);
    }
  });

  it("does not duplicate advisories when many days have the same condition", () => {
    const days = [
      baseDay({ tempMax: 32, date: "2026-10-16" }),
      baseDay({ tempMax: 33, date: "2026-10-17" }),
      baseDay({ tempMax: 34, date: "2026-10-18" }),
    ];
    const r = interpretWeatherForFarm(days, layersOnly);
    const heat = r.advisories.filter((x) => /heat|drop.*egg/i.test(x.text));
    expect(heat.length).toBeLessThanOrEqual(1);
  });

  it("returns at most N advisories to keep the UI tight", () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      baseDay({ tempMax: 35, rain: 0, date: `2026-10-${16 + i}`, windSpeed: 30 }),
    );
    const r = interpretWeatherForFarm(days, layersOnly);
    expect(r.advisories.length).toBeLessThanOrEqual(5);
  });
});

describe("nextHeatStress and nextSprayWindow", () => {
  it("returns null nextHeatStress when no hot day in the forecast", () => {
    const days = [baseDay({ tempMax: 25 }), baseDay({ tempMax: 27 })];
    const r = interpretWeatherForFarm(days, layersOnly);
    expect(r.nextHeatStress).toBeNull();
  });

  it("returns the first hot day for nextHeatStress when there is one", () => {
    const days = [
      baseDay({ tempMax: 25, date: "2026-10-16" }),
      baseDay({ tempMax: 32, date: "2026-10-17" }), // first hot
      baseDay({ tempMax: 33, date: "2026-10-18" }),
    ];
    const r = interpretWeatherForFarm(days, layersOnly);
    expect(r.nextHeatStress).not.toBeNull();
    expect(r.nextHeatStress?.date).toBe("2026-10-17");
    expect(r.nextHeatStress?.tempMax).toBe(32);
  });

  it("returns null nextSprayWindow when every day is too wet or too windy", () => {
    const days = [
      baseDay({ rain: 8, windSpeed: 30 }),
      baseDay({ rain: 10, date: "2026-10-17" }),
    ];
    const r = interpretWeatherForFarm(days, layersOnly);
    expect(r.nextSprayWindow).toBeNull();
  });

  it("returns the first dry, calm day for nextSprayWindow", () => {
    const days = [
      baseDay({ rain: 5, windSpeed: 30, date: "2026-10-16" }),
      baseDay({ rain: 0, windSpeed: 8, date: "2026-10-17" }), // ideal
      baseDay({ rain: 0, windSpeed: 5, date: "2026-10-18" }),
    ];
    const r = interpretWeatherForFarm(days, layersOnly);
    expect(r.nextSprayWindow).not.toBeNull();
    expect(r.nextSprayWindow?.date).toBe("2026-10-17");
    expect(r.nextSprayWindow?.windSpeed).toBe(8);
  });

  it("does not look for a heat day when the farm has no heat-sensitive species", () => {
    // Just a crop, no flock. The function has no heat threshold to compare
    // against, so nextHeatStress is null even on a 34°C day.
    const days = [baseDay({ tempMax: 34 })];
    const r = interpretWeatherForFarm(days, [{ kind: "crop", type: "maize" }]);
    expect(r.nextHeatStress).toBeNull();
  });
});

describe("weather route wires the interpreter", () => {
  const route = read("routes/weather.ts");

  it("imports interpretWeatherForFarm", () => {
    expect(route).toMatch(/import\s*\{[^}]*interpretWeatherForFarm[^}]*\}\s*from\s*"\.\.\/lib\/weather-advisory\.js"/);
  });

  it("returns the advisories in the response payload", () => {
    // The route spreads the function result into res.json — the function
    // returns {advisories, nextHeatStress, nextSprayWindow}. Both shapes
    // are in the response. The exact wire pattern was changed from
    // `advisories: interpretWeatherForFarm(...)` to `...interpretWeatherForFarm(...)`
    // when the function grew a second return value; the contract is
    // "the response has all the keys the function returns".
    expect(route).toMatch(/interpretWeatherForFarm/);
    expect(route).toMatch(/\.\.\.interpretWeatherForFarm/);
  });

  it("loads the farm's active species to feed the interpreter", () => {
    // The farm's flock.types and crop.cropTypes are the inputs to
    // interpretWeatherForFarm. The route must read them.
    expect(route).toMatch(/prisma\.flock\.findMany/);
    expect(route).toMatch(/prisma\.crop\.findMany/);
  });
});
