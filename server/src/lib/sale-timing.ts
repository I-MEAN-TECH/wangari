/**
 * Sale timing — the market-price × production join (M3).
 *
 * ## Why this exists
 *
 * The price board (`/market-prices`) and the production log were both live and
 * never talked to each other. A farmer records 40 trays a day and records what
 * buyers in his county are paying — but nobody ever told him when those two
 * numbers disagree. This module is that conversation:
 *
 *     "Egg price up 14% in Kiambu" + your output = what the move is worth per week.
 *
 * ## The honest constraints (read before changing a threshold)
 *
 * - **The data is farmer-recorded offers, not an exchange feed.** It is sparse
 *   and noisy by nature, so the rule needs a MINIMUM in both windows before it
 *   will say anything at all. A trend claimed off two data points is worse than
 *   silence: the farmer acts on it once, it is wrong, and the number is dead
 *   forever (same argument as market-price.ts's benchmark rule).
 * - **Silent when thin.** Like the weather rules, this returns `null` rather
 *   than a watered-down message. No data, no card.
 * - **Regional pool wins outright.** A farmer can only sell in his own county,
 *   so if the county has ANY recorded offers the national ones are ignored —
 *   matching `pickBenchmark` in market-price.ts. The fallback to national is
 *   clearly labelled in the message.
 * - **The money figure is the farm's own output.** `weeklyUnits` must be in the
 *   commodity's pricing unit (trays for eggs, litres for milk); the caller does
 *   the conversion because only the caller knows what the farm produces.
 *
 * Returns a structured insight with the final `title`/`detail`/`moneyImpact`
 * already written, because the tests then defend the words the farmer reads —
 * not just the arithmetic behind them.
 */

import type { PricePoint } from "./market-price.js";

/** Offers in the last month form the "now" side of the comparison. */
export const RECENT_DAYS = 30;
/** Anything older than this is too stale to trend on. ~three months of baseline. */
export const BASELINE_DAYS = 120;
/** Below this on either side, the trend would be an opinion, not a signal. */
export const MIN_RECENT_POINTS = 2;
export const MIN_BASELINE_POINTS = 3;
/**
 * Smallest move worth interrupting a farmer for. 10% mirrors `1 - FLOOR_FRACTION`
 * in market-price.ts — the same "meaningful difference" line the compare screen
 * already draws, so the board and the action card never disagree.
 */
export const TREND_FLOOR = 0.1;

export interface SaleTimingInput {
  /** Market-price commodity id, e.g. "eggs" | "milk". */
  commodity: string;
  /** Commodity name as the farmer reads it, e.g. "Egg" | "Milk". */
  label: string;
  /** The commodity's price history (all regions), within BASELINE_DAYS of now. */
  points: readonly PricePoint[];
  /** The farm's county — the region we are allowed to trend on. */
  region?: string | null;
  /** The farm's weekly output in the commodity's PRICING unit (trays, litres). */
  weeklyUnits: number;
  now?: Date;
}

export interface SaleTimingInsight {
  commodity: string;
  direction: "up" | "down";
  /** 0.14 = the recent month averages 14% above the baseline. */
  changePct: number;
  recentAvg: number;
  baselineAvg: number;
  /** Unit the prices are quoted in, straight from the newest offer. */
  unit: string;
  /** "Kiambu" or "nationally" — where the numbers came from. */
  sourceLabel: string;
  /** How many offers stand behind this claim. Goes into the message. */
  sampleSize: number;
  /** KES per week that the move is worth at this farm's output. */
  weeklyStakeKes: number;
  title: string;
  detail: string;
  moneyImpact: string;
}

function ageDays(effectiveDate: string | Date, now: Date): number {
  const then = effectiveDate instanceof Date ? effectiveDate : new Date(effectiveDate);
  const ms = now.getTime() - then.getTime();
  return Number.isNaN(then.getTime()) ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(ms / 86400000));
}

const norm = (r?: string | null) => (r ?? "").trim().toLowerCase();

/**
 * The pool of offers this farm may be compared against.
 *
 * County offers first — if the county has recorded ANY offers, that pool is
 * used alone. National offers are the fallback only, and the caller labels the
 * message differently when they are used.
 */
function pickPool(
  points: readonly PricePoint[],
  region?: string | null
): { pool: PricePoint[]; regional: boolean } {
  const usable = points.filter((p) => Number(p.priceKes) > 0);
  const target = norm(region);
  if (target) {
    const regional = usable.filter((p) => norm(p.region) === target);
    if (regional.length > 0) return { pool: regional, regional: true };
  }
  return { pool: usable.filter((p) => !p.region), regional: false };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

const kes = (n: number) =>
  `KES ${Math.round(n).toLocaleString("en-KE")}`;

/**
 * Decide whether a commodity's price has moved enough, against enough data,
 * to be worth the farm's attention — and what the move is worth per week.
 *
 * @returns the insight, or `null` when the data cannot honestly support one.
 */
export function saleTiming(input: SaleTimingInput): SaleTimingInsight | null {
  const now = input.now ?? new Date();
  if (!Number.isFinite(input.weeklyUnits) || input.weeklyUnits <= 0) return null;

  const { pool, regional } = pickPool(input.points, input.region);
  if (pool.length < MIN_RECENT_POINTS + MIN_BASELINE_POINTS) return null;

  const recent: number[] = [];
  const baseline: number[] = [];
  for (const p of pool) {
    const age = ageDays(p.effectiveDate, now);
    if (age > BASELINE_DAYS) continue;
    const price = Number(p.priceKes);
    if (age <= RECENT_DAYS) recent.push(price);
    else baseline.push(price);
  }

  if (recent.length < MIN_RECENT_POINTS || baseline.length < MIN_BASELINE_POINTS) return null;

  const recentAvg = mean(recent);
  const baselineAvg = mean(baseline);
  if (!(baselineAvg > 0)) return null;

  const changePct = (recentAvg - baselineAvg) / baselineAvg;
  if (Math.abs(changePct) < TREND_FLOOR) return null;

  const direction: "up" | "down" = changePct > 0 ? "up" : "down";
  const unit =
    pool
      .slice()
      .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0]?.unit ||
    "unit";
  const sourceLabel = regional && input.region ? input.region : "nationally";
  const sampleSize = recent.length + baseline.length;
  const diff = Math.abs(recentAvg - baselineAvg);
  const weeklyStakeKes = diff * input.weeklyUnits;
  const pct = Math.round(Math.abs(changePct) * 100);

  const where = regional ? `in ${input.region}` : "nationally";
  const evidence =
    `${recent.length} offer${recent.length === 1 ? "" : "s"} in the last month average ` +
    `${kes(recentAvg)} per ${unit} against ${kes(baselineAvg)} across the previous ` +
    `${Math.round((BASELINE_DAYS - RECENT_DAYS) / 30)} months (${baseline.length} offers). ` +
    (regional
      ? `Recorded by farmers in ${input.region}.`
      : "No offers recorded in your county yet, so this is the national picture.");

  const title =
    direction === "up"
      ? `${input.label} price up ${pct}% ${where}`
      : `${input.label} price down ${pct}% ${where}`;

  const detail =
    direction === "up"
      ? `${evidence} If the rate you are being paid hasn't followed, every ${unit} you hand over now is leaving money behind.`
      : `${evidence} Check every offer against the going rate before you sell — don't carry last month's price into a cheaper market.`;

  return {
    commodity: input.commodity,
    direction,
    changePct: Math.abs(changePct),
    recentAvg,
    baselineAvg,
    unit,
    sourceLabel,
    sampleSize,
    weeklyStakeKes,
    title,
    detail,
    moneyImpact: `${kes(weeklyStakeKes)}/week at your current output`,
  };
}
