/**
 * Crop-and-livestock-aware weather interpretation (Free Core).
 *
 * The 7-day forecast from /api/weather is reframed as advice for what
 * the farm is actually keeping. The function is pure: same input,
 * same output, no DB access. The route layer loads the farm's species
 * and feeds them in.
 *
 * Thresholds are conservative, sourced from common smallholder practice
 * (Kenya climate, KALRO extension notes), not university-grade agronomy.
 * A wrong number costs the farmer money; an absent number costs nothing.
 */

export interface WeatherDay {
  date: string;
  day: string;
  tempMin: number;
  tempMax: number;
  rain: number;
  precipitation: number;
  weatherCode: number;
  condition: string;
  description: string;
  icon: "sun" | "cloud" | "rain";
  /** Open-Meteo daily peak wind speed in km/h. Optional. */
  windSpeed?: number;
}

export type FarmSpecies =
  | { kind: "flock"; type: string }
  | { kind: "crop"; type: string };

export type AdvisorySeverity = "warn" | "info";

export interface Advisory {
  /** Stable key so the UI can dedupe across renders. */
  key: string;
  text: string;
  severity: AdvisorySeverity;
  /** The day the advisory applies to (ISO date), or null for week-wide. */
  date: string | null;
}

// Conservative thresholds, intentionally generous on the "no warning" side
// because false positives teach the farmer to ignore the warning.
const LAYER_HEAT_C = 30; // layers start laying fewer eggs above 30°C
const BROILER_HEAT_C = 33; // broilers tolerate more heat than layers
const MAIZE_DRY_WEEK_MM = 5; // < 5mm across 7 days is a real dry week
const SPRAY_WASH_MM = 5; // >= 5mm rain today washes a spray off
const SPRAY_DRIFT_KMH = 25; // >= 25 km/h wind drifts the spray

const severityRank = (s: AdvisorySeverity) => (s === "warn" ? 0 : 1);

/** Dedup by key, keep the most-severe version. */
function dedup(adv: Advisory[]): Advisory[] {
  const byKey = new Map<string, Advisory>();
  for (const a of adv) {
    const existing = byKey.get(a.key);
    if (!existing || severityRank(a.severity) < severityRank(existing.severity)) {
      byKey.set(a.key, a);
    }
  }
  return [...byKey.values()];
}

export function interpretWeatherForFarm(
  forecast: WeatherDay[],
  species: FarmSpecies[],
  options: { maxAdvisories?: number } = {},
): Advisory[] {
  const out: Advisory[] = [];
  const hasLayers = species.some((s) => s.kind === "flock" && /layer/i.test(s.type));
  const hasBroilers = species.some((s) => s.kind === "flock" && /broiler/i.test(s.type));
  const hasMaize = species.some((s) => s.kind === "crop" && /maize|corn/i.test(s.type));

  // ── Per-day rules ──────────────────────────────────────────────────
  for (const day of forecast) {
    // Heat stress for layers.
    if (hasLayers && day.tempMax >= LAYER_HEAT_C) {
      out.push({
        key: "layer_heat",
        text: `Layers will feel the heat on ${day.day} (max ${day.tempMax}°C). Expect a 5–10% drop in eggs; cool the house with shade and water.`,
        severity: "warn",
        date: day.date,
      });
    }
    // Heat stress for broilers (higher threshold).
    if (hasBroilers && day.tempMax >= BROILER_HEAT_C) {
      out.push({
        key: "broiler_heat",
        text: `Broilers face heat stress on ${day.day} (max ${day.tempMax}°C). Mortality risk rises above ${BROILER_HEAT_C}°C — open the curtains and check water twice.`,
        severity: "warn",
        date: day.date,
      });
    }
    // Spray rules — applies to anyone with anything to spray.
    if (day.rain >= SPRAY_WASH_MM) {
      out.push({
        key: "spray_wash",
        text: `Skip the spray on ${day.day} — ${day.rain}mm of rain will wash it off. Wait for a dry window.`,
        severity: "info",
        date: day.date,
      });
    }
    if ((day.windSpeed ?? 0) >= SPRAY_DRIFT_KMH) {
      out.push({
        key: "spray_drift",
        text: `Wind too strong on ${day.day} (${day.windSpeed} km/h) — spray will drift onto neighbouring plots and your own house. Spray early morning instead.`,
        severity: "info",
        date: day.date,
      });
    }
  }

  // ── Week-wide rules ───────────────────────────────────────────────
  if (hasMaize) {
    const totalRain = forecast.reduce((s, d) => s + d.rain, 0);
    if (totalRain < MAIZE_DRY_WEEK_MM) {
      out.push({
        key: "maize_dry",
        text: `Dry week ahead for your maize — only ${totalRain.toFixed(1)}mm expected. Irrigate now or expect moisture stress at tasselling.`,
        severity: "warn",
        date: null,
      });
    }
  }

  // ── Final ordering: warn before info, then dedup, then cap ────────
  const deduped = dedup(out).sort((a, b) => {
    const r = severityRank(a.severity) - severityRank(b.severity);
    if (r !== 0) return r;
    // Within the same severity, the day-specific advisories come first.
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return 0;
  });
  return deduped.slice(0, options.maxAdvisories ?? 5);
}
