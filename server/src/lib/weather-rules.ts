/**
 * Weather → action rules (gap-analysis row 4, GAP 7).
 *
 * Wangari has fetched a 7-day forecast for a long time and shown it as a strip
 * of icons. That is a forecast, not a decision. Farmers do not need to be told
 * it will rain; they need to be told what to do about it, today, in words they
 * would have used anyway.
 *
 * So these rules take the forecast the weather route already produces and emit
 * concrete instructions, each with the day it applies to. No new data entry, no
 * new dependency, no new screen — the action engine already renders a list of
 * prioritised decisions with a link, and these join it.
 *
 * Pure and clock-injected on purpose. A rule that fires "in 3 days" is a rule
 * nobody can test without waiting three days, so `now` is always an argument.
 */

/** The subset of the weather forecast payload these rules read. */
export interface ForecastDay {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  /** Millimetres of precipitation. */
  rain: number;
  condition?: string;
}

export interface WeatherAction {
  id: string;
  /** The farm-facing instruction. Written the way a farmer would say it. */
  title: string;
  /** Why it matters — one sentence of consequence, not more. */
  detail: string;
  /** Index into the forecast array; -1 means "today", not a forecast day. */
  dayIndex: number;
  /** critical when the cost of waiting is high, medium when it is a saving. */
  priority: "critical" | "high" | "medium" | "info";
  href: string;
  cta: string;
}

/** How far ahead these rules look. Matches the 7-day forecast we fetch. */
export const RULE_HORIZON_DAYS = 5;

/** Rain in mm that counts as "you will need to act". */
export const SIGNIFICANT_RAIN_MM = 5;

/** Dry spell length in days that starts costing a farmer money. */
export const DRY_SPELL_DAYS = 7;

/** Days of forecast used to decide a dry spell, since we only fetch 7. */
export const DRY_SPELL_LOOKAHEAD = 7;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Total rain across the next `days` days from `fromIndex` onward. */
export function rainInWindow(forecast: ForecastDay[], fromIndex = 0, days = RULE_HORIZON_DAYS): number {
  return forecast
    .slice(fromIndex, fromIndex + days)
    .reduce((s, d) => (isFiniteNumber(d.rain) ? s + d.rain : s), 0);
}

/**
 * Index of the first day in the forecast carrying at least `mm` of rain, or -1.
 * Returns the EARLIEST qualifying day: acting on the first wet day is what
 * protects the crop, not acting on the heaviest one.
 */
export function firstHeavyRainDay(forecast: ForecastDay[], mm = SIGNIFICANT_RAIN_MM): number {
  for (let i = 0; i < forecast.length; i++) {
    if (isFiniteNumber(forecast[i].rain) && forecast[i].rain >= mm) return i;
  }
  return -1;
}

/**
 * Turn a forecast into decisions.
 *
 * `today` is passed in rather than read from the clock so the whole rule set is
 * testable and so a cached forecast from this morning does not silently drift.
 */
export function weatherActions(forecast: ForecastDay[] | null | undefined, today = new Date()): WeatherAction[] {
  if (!Array.isArray(forecast) || forecast.length === 0) return [];

  const actions: WeatherAction[] = [];
  const horizon = forecast.slice(0, RULE_HORIZON_DAYS);

  // ── 1. Rain is coming: stop watering, get feed and harvest in ──────────────
  // Ordered by cost of delay. Irrigating before rain wastes water AND can waterlog
  // a young crop; leaving cut feed in the rain spoils it and can sour the ration.
  const heavyDay = firstHeavyRainDay(horizon, SIGNIFICANT_RAIN_MM);

  if (heavyDay === 0) {
    actions.push({
      id: "rain-today",
      priority: "high",
      title: "Rain is falling today — hold irrigation",
      detail:
        "Water now and the field takes more than the soil can drain, which stresses young plants and washes nutrient away. Feed already cut should be under cover.",
      dayIndex: 0,
      href: "/crops",
      cta: "Open crop plan",
    });
  } else if (heavyDay > 0) {
    const days = heavyDay;
    actions.push({
      id: "rain-soon",
      priority: days <= 2 ? "high" : "medium",
      title: `Rain expected in ${days} day${days === 1 ? "" : "s"} — hold irrigation`,
      detail:
        "Irrigate now and it runs off before the rain arrives. Last watering before a dry spell is worth more than one during wet weather.",
      dayIndex: heavyDay,
      href: "/crops",
      cta: "Review watering",
    });
  }

  // ── 2. Heavy rain: harvesting and storage risk ──────────────────────────────
  // Deliberately NOT suppressed when it lands on the same day as the irrigation
  // rule: those are two different jobs. "Hold irrigation" is about the field,
  // "get the harvest off the ground" is about produce that spoils. A farmer
  // doing only the first still loses the crop, so they get both rows.
  const FLOOD_MM = 25;
  const floodDay = firstHeavyRainDay(horizon, FLOOD_MM);
  if (floodDay >= 0) {
    actions.push({
      id: "heavy-rain",
      priority: floodDay <= 1 ? "high" : "medium",
      title: `Heavy rain (${Math.round(horizon[floodDay].rain)}mm) in ${floodDay === 0 ? "today" : `${floodDay} day${floodDay === 1 ? "" : "s"}`}`,
      detail:
        "Anything harvested or cut should be off the ground and under cover. Standing water damages roots and carries disease into the field.",
      dayIndex: floodDay,
      href: "/crops",
      cta: "Check what is exposed",
    });
  }

  // ── 3. Dry spell ahead: water and feed before it starts ────────────────────
  // The mirror of rule 1, and the one farmers ask for most in a dry season. A
  // dry spell is invisible on any single day; it has to be seen across the week.
  //
  // Requires the FULL window before it will claim one. With only 3 days of
  // forecast in hand, "no rain for 3 days" is not a dry spell, it is an
  // incomplete forecast — and calling it one would cry wolf every dry morning
  // and teach the farmer to ignore the alert.
  const totalRain = rainInWindow(horizon, 0, DRY_SPELL_LOOKAHEAD);
  const drySpell = forecast.length >= DRY_SPELL_LOOKAHEAD && totalRain < 1;
  if (drySpell) {
    const maxTemp = Math.max(...horizon.map((d) => (isFiniteNumber(d.tempMax) ? d.tempMax : -Infinity)));
    const hot = isFiniteNumber(maxTemp) && maxTemp >= 30;
    actions.push({
      id: "dry-spell",
      priority: hot ? "high" : "medium",
      title: hot ? `No rain for ${forecast.length} days, up to ${Math.round(maxTemp)}°C` : `No rain in the next ${forecast.length} days`,
      detail: hot
        ? "Water storage and stock feed now, while you can still buy them. Heat plus no rain is when stock losses start."
        : "Check water storage and feed stock before the dry spell sets in, not during it.",
      dayIndex: 0,
      href: "/inventory",
      cta: "Check stock",
    });
  }

  // ── 4. Heat stress ─────────────────────────────────────────────────────────
  // Poultry and dairy lose production in heat before they visibly suffer, so
  // the instruction is about shade and water rather than about treating a sick bird.
  const hotDays = horizon.filter((d) => isFiniteNumber(d.tempMax) && d.tempMax >= 33);
  if (hotDays.length >= 2) {
    const peak = Math.max(...hotDays.map((d) => d.tempMax));
    actions.push({
      id: "heat-stress",
      priority: peak >= 38 ? "high" : "medium",
      title: `Hot spell — up to ${Math.round(peak)}°C`,
      detail:
        "Shade over the birds and check water is flowing before the heat peaks. Expect egg production to dip; that is the heat, not disease.",
      dayIndex: horizon.indexOf(hotDays[0]),
      href: "/production",
      cta: "Record production",
    });
  }

  // ── 5. Cold / frost risk for highlands and horticulture ────────────────────
  const coldDays = horizon.filter((d) => isFiniteNumber(d.tempMin) && d.tempMin <= 6);
  if (coldDays.length >= 1) {
    actions.push({
      id: "cold-risk",
      priority: "medium",
      title: `Cold night — ${Math.round(coldDays[0].tempMin)}°C`,
      detail:
        "Seedlings and tropical seedlings suffer at this temperature. Cover nursery beds and move young stock off the cold floor.",
      dayIndex: horizon.indexOf(coldDays[0]),
      href: "/crops",
      cta: "Check nursery",
    });
  }

  // ── 6. Good drying window for harvest ──────────────────────────────────────
  // The optimistic rule. A dry, warm, low-rain day is the one to cut and dry,
  // and saying so is what turns a forecast into a decision rather than a worry.
  const goodDays = horizon.filter(
    (d) => isFiniteNumber(d.rain) && d.rain < 1 && isFiniteNumber(d.tempMax) && d.tempMax >= 20 && d.tempMax <= 33
  );
  // Requires the same full window as the dry-spell rule, for the mirror reason:
  // a short warm dry forecast is a drying window, not a dry spell.
  if (goodDays.length >= 2 && forecast.length >= DRY_SPELL_LOOKAHEAD && !drySpell) {
    const i = horizon.indexOf(goodDays[0]);
    actions.push({
      id: "drying-window",
      priority: "info",
      title: `Good drying weather for ${goodDays.length} of the next ${horizon.length} days`,
      detail: "Cut, dry and store in this window. Moisture in stored crop is what causes later loss.",
      dayIndex: i,
      href: "/crops",
      cta: "Plan the harvest",
    });
  }

  return actions;
}