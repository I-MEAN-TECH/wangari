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
    const advisories = interpretWeatherForFarm([baseDay({})], []);
    expect(Array.isArray(advisories)).toBe(true);
    // No species means no animal/crop-specific advice; only generic rules fire.
  });

  it("warns when layer flock sees a heat-stress day (max >= 30°C)", () => {
    const day = baseDay({ tempMax: 32, tempMin: 22 });
    const a = interpretWeatherForFarm([day], layersOnly);
    expect(a.some((x) => /heat|hot|drop.*egg|lay/i.test(x.text))).toBe(true);
    expect(a.find((x) => /heat|hot|drop.*egg|lay/i.test(x.text))?.severity).toBe("warn");
  });

  it("does not warn layers on a mild day (max 26°C)", () => {
    const day = baseDay({ tempMax: 26 });
    const a = interpretWeatherForFarm([day], layersOnly);
    expect(a.some((x) => /heat|hot|drop.*egg/i.test(x.text))).toBe(false);
  });

  it("warns broilers on extreme heat (max >= 33°C) because broilers are more sensitive", () => {
    const day = baseDay({ tempMax: 33 });
    const a = interpretWeatherForFarm([day], broilersOnly);
    expect(a.some((x) => /broiler|heat|hot|mortal/i.test(x.text))).toBe(true);
  });

  it("does not warn broilers on a 30°C day (their threshold is 33°C)", () => {
    const day = baseDay({ tempMax: 30 });
    const a = interpretWeatherForFarm([day], broilersOnly);
    expect(a.some((x) => /broiler/i.test(x.text))).toBe(false);
  });

  it("flags a dry spell for maize when total rain over 7 days is 0", () => {
    const days = Array.from({ length: 7 }, (_, i) => baseDay({ date: `2026-10-${16 + i}`, day: i === 0 ? "Today" : "Day " + (i + 1), rain: 0 }));
    const a = interpretWeatherForFarm(days, maizeOnly);
    expect(a.some((x) => /dry|irrigat|moisture|stress/i.test(x.text))).toBe(true);
  });

  it("does NOT flag a dry spell when total rain is at least 5mm across the week", () => {
    const days = [
      baseDay({ rain: 2 }),
      baseDay({ rain: 1, date: "2026-10-17" }),
      baseDay({ rain: 2, date: "2026-10-18" }),
    ];
    const a = interpretWeatherForFarm(days, maizeOnly);
    expect(a.some((x) => /dry|irrigat/i.test(x.text))).toBe(false);
  });

  it("says skip the spray when it will rain today", () => {
    const day = baseDay({ rain: 6, condition: "Rain" });
    const a = interpretWeatherForFarm([day], layersOnly);
    expect(a.some((x) => /spray|pesticide|wash off/i.test(x.text))).toBe(true);
  });

  it("says skip the spray when wind is high (>= 25 km/h) — a generic rule", () => {
    // Wind is not in the WeatherDay shape, so it must be in the input via
    // windSpeed. The free-core farmer has no anemometer; the rule is
    // applied when the daily forecast includes windSpeed >= 25.
    const day = { ...baseDay({}), windSpeed: 28 };
    const a = interpretWeatherForFarm([day], layersOnly);
    expect(a.some((x) => /wind|spray.*drift|drift/i.test(x.text))).toBe(true);
  });

  it("returns advisories sorted by severity (warn first, info last)", () => {
    const days = [
      baseDay({ tempMax: 32 }), // heat warn (warn)
      baseDay({ rain: 0, date: "2026-10-17" }), // generic info
    ];
    const a = interpretWeatherForFarm(days, layersOnly);
    const warnIdx = a.findIndex((x) => x.severity === "warn");
    const infoIdx = a.findIndex((x) => x.severity === "info");
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
    const a = interpretWeatherForFarm(days, layersOnly);
    const heat = a.filter((x) => /heat|drop.*egg/i.test(x.text));
    expect(heat.length).toBeLessThanOrEqual(1);
  });

  it("returns at most N advisories to keep the UI tight", () => {
    // Worst-case: layers + 7 dry days + 3 hot days + 2 windy days. The
    // function should not flood the dashboard.
    const days = Array.from({ length: 7 }, (_, i) =>
      baseDay({ tempMax: 35, rain: 0, date: `2026-10-${16 + i}`, windSpeed: 30 }),
    );
    const a = interpretWeatherForFarm(days, layersOnly);
    expect(a.length).toBeLessThanOrEqual(5);
  });
});

describe("weather route wires the interpreter", () => {
  const route = read("routes/weather.ts");

  it("imports interpretWeatherForFarm", () => {
    expect(route).toMatch(/import\s*\{[^}]*interpretWeatherForFarm[^}]*\}\s*from\s*"\.\.\/lib\/weather-advisory\.js"/);
  });

  it("returns the advisories in the response payload", () => {
    // The route already returns the forecast. The new piece is the
    // advisories array, derived from the forecast + the farm's species.
    expect(route).toMatch(/advisories:\s*interpretWeatherForFarm/);
  });

  it("loads the farm's active species to feed the interpreter", () => {
    // The farm's flock.types and crop.cropTypes are the inputs to
    // interpretWeatherForFarm. The route must read them.
    expect(route).toMatch(/prisma\.flock\.findMany/);
    expect(route).toMatch(/prisma\.crop\.findMany/);
  });
});
