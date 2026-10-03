/**
 * Cold chain integrity (gap-analysis row 15).
 *
 * `PostHarvestBatch.storageTempC` held ONE temperature, written once. That is
 * not a cold chain record: an avocado export is rejected for a single excursion
 * nobody measured, and the buyer asks for the curve, not the final number.
 *
 * So this reads a series of readings and answers the three questions that decide
 * whether the load is sellable:
 *   1. Did it ever go too warm, and for how long?
 *   2. How long from harvest to cold?
 *   3. Is the chain broken, marginal, or clean?
 *
 * Pure, with the clock injected, because "hours above threshold" is not
 * something you can test if the function calls new Date() itself.
 */

/** Avocado/macadamia cold chain target. Export spec is 4-5C. */
export const TARGET_TEMP_C = 5;

/**
 * Above this, the chain is considered broken for export purposes. 8C is the
 * usual tolerance band in the avocado cold-chain literature; beyond it, pulp
 * temperature damage starts and cannot be reversed by re-cooling.
 */
export const MAX_TEMP_C = 8;

/** Good practice: avocado should reach storage temperature within 5 hours. */
export const COOLING_TARGET_HOURS = 5;

export interface ColdChainReading {
  tempC: number;
  recordedAt: Date | string;
  stage?: string;
}

export type ChainState = "clean" | "excursion" | "broken" | "unknown";

export interface ColdChainAssessment {
  state: ChainState;
  readingCount: number;
  /** Highest temperature recorded. */
  peakTempC: number | null;
  averageTempC: number | null;
  /** Hours any single reading spent above MAX_TEMP_C. */
  hoursAboveThreshold: number;
  /** Hours from harvest to the first reading at or below target. */
  hoursToCool: number | null;
  /** Whether cooling happened inside the good-practice window. */
  cooledInTime: boolean | null;
  message: string;
}

function hours(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 3600000;
}

function parse(v: Date | string): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Assess a batch from its readings.
 *
 * `harvestDate` anchors the time-to-cool calculation; without it that figure is
 * reported as null rather than measured from the first reading, because the
 * first reading is usually taken in the field and would flatter the result.
 */
export function assessColdChain(
  readings: ColdChainReading[] | null | undefined,
  opts: { harvestDate?: Date | string | null; now?: Date } = {}
): ColdChainAssessment {
  const empty = (message: string): ColdChainAssessment => ({
    state: "unknown",
    readingCount: 0,
    peakTempC: null,
    averageTempC: null,
    hoursAboveThreshold: 0,
    hoursToCool: null,
    cooledInTime: null,
    message,
  });

  if (!Array.isArray(readings) || readings.length === 0) {
    return empty("No temperature readings yet. Take the first reading when the batch reaches the cold room.");
  }

  // Note the type: `at` is narrowed to a NON-NULL Date by the predicate below, so
// every later use needs no null check. Declaring the intermediate shape with
// `at: Date | null` and then narrowing it is what TypeScript requires for a
// type predicate to be assignable.
interface ParsedReading {
  temp: number;
  at: Date | null;
  stage: string | undefined;
}

const valid = (readings as ColdChainReading[])
    .map((r): ParsedReading => ({ temp: Number(r.tempC), at: parse(r.recordedAt), stage: r.stage }))
    .filter((r): r is ParsedReading & { at: Date } => Number.isFinite(r.temp) && r.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (valid.length === 0) {
    return empty("No usable temperature readings yet.");
  }

  const peakTempC = Math.max(...valid.map((r) => r.temp));
  const averageTempC = valid.reduce((s, r) => s + r.temp, 0) / valid.length;

  // ── Hours above threshold ──────────────────────────────────────────────────
  // Counted between consecutive readings rather than per reading: five
  // readings at 12C over ten hours is one ten-hour excursion, not five separate
  // two-hour ones, and a buyer rejecting the load cares about the duration.
  let hoursAboveThreshold = 0;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].temp > MAX_TEMP_C || valid[i - 1].temp > MAX_TEMP_C) {
      hoursAboveThreshold += hours(valid[i].at, valid[i - 1].at);
    }
  }

  // ── Time to cool ───────────────────────────────────────────────────────────
  const harvest = opts.harvestDate != null ? parse(opts.harvestDate) : null;
  let hoursToCool: number | null = null;
  if (harvest) {
    const firstCool = valid.find((r) => r.temp <= TARGET_TEMP_C && r.at >= harvest);
    if (firstCool) hoursToCool = Math.round(hours(firstCool.at, harvest) * 10) / 10;
  }
  const cooledInTime = hoursToCool === null ? null : hoursToCool <= COOLING_TARGET_HOURS;

  // ── State ───────────────────────────────────────────────────────────────────
  // "broken" needs a real excursion, not one warm reading: a truck thermometer
  // in the sun is not the load losing the cold chain.
  let state: ChainState;
  if (peakTempC > MAX_TEMP_C) state = "broken";
  else if (peakTempC > TARGET_TEMP_C || hoursAboveThreshold > 0) state = "excursion";
  else state = "clean";

  const fmtHours = (h: number) => (h < 1 ? "under an hour" : `${Math.round(h)} hour${h < 2 ? "" : "s"}`);

  let message: string;
  if (state === "broken") {
    message =
      `Cold chain broken — the batch reached ${Math.round(peakTempC)}°C, above the ${MAX_TEMP_C}°C limit` +
      (hoursAboveThreshold > 0 ? ` for about ${fmtHours(hoursAboveThreshold)}.` : ".") +
      " Talk to your buyer before shipping.";
  } else if (state === "excursion") {
    message =
      `Cold chain wobbled — peak ${Math.round(peakTempC)}°C against a ${TARGET_TEMP_C}°C target.` +
      (cooledInTime === false ? " It also took longer than 5 hours to cool." : "") +
      " Usable for the local market; check with your buyer before export.";
  } else {
    // Slow cooling is worth saying even when every temperature was acceptable:
    // an exporter's cut-off is time-to-cool as well as peak temperature, so a
    // clean-but-late batch is NOT the same as a clean batch. An earlier version
    // only mentioned this inside the "excursion" branch and reported a
    // slow-cooled load as simply "cold chain held".
    message =
      `Cold chain held at ${Math.round(peakTempC)}°C, within the ${TARGET_TEMP_C}°C target` +
      (cooledInTime === true
        ? `, and cooled inside ${COOLING_TARGET_HOURS} hours of harvest.`
        : cooledInTime === false
          ? `, but it took ${hoursToCool} hours to cool — ${COOLING_TARGET_HOURS} hours is the usual limit. Check the buyer accepts a late cool.`
          : ".");
  }

  return {
    state,
    readingCount: valid.length,
    peakTempC: Math.round(peakTempC * 10) / 10,
    averageTempC: Math.round(averageTempC * 10) / 10,
    hoursAboveThreshold: Math.round(hoursAboveThreshold * 10) / 10,
    hoursToCool,
    cooledInTime,
    message,
  };
}