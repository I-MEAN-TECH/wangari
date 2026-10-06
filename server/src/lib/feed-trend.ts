/**
 * Feed conversion drift — M3's "what will bite you" rule.
 *
 * Feed is the largest running cost on a livestock farm, and the only one that
 * *silently* gets worse: a 20% rise in feed per egg looks exactly like a normal
 * week in the expense list, because the bill is the same shape as last month's
 * while what it buys has shrunk. This module joins two things the farm already
 * records — `DailyProduction.feedUsed` and the output beside it — and says when
 * the exchange rate between them has moved against the farmer.
 *
 * ## The honesty rules
 *
 * - **Worsening only.** An improving ratio is good news, not an action; a card
 *   that congratulates is decoration. Silence is the response to improvement.
 * - **Both windows must be real.** Feed recorded without output (or output
 *   without feed) is missing data, not a trend — either side at zero returns
 *   `null`.
 * - **The money is derived, never assumed.** Extra KES per week comes from the
 *   farm's own feed spend ÷ kilos recorded in the same window; with no feed
 *   expense the card falls back to kilos, because inventing a feed price would
 *   make the one number the farmer acts on a guess.
 * - **Aggregate ratios, not averages of daily ratios.** A day with eggs and no
 *   feed recorded must not drag the rate toward zero; the rate is total feed ÷
 *   total output per window.
 */

/** Days in the "now" window. */
export const RECENT_DAYS = 7;
/** The comparison window reaches this many days back. */
export const TREND_WINDOW_DAYS = 21;
/** Minimum recorded days in each window for the ratio to mean anything. */
export const MIN_RECENT_DAYS = 3;
export const MIN_BASELINE_DAYS = 4;
/**
 * Smallest worsening worth a card. 15% — roughly two bad scoops of feed a
 * week at smallholder scale; below that the day-to-day variation in water
 * content and scoop size is the whole signal.
 */
export const DRIFT_FLOOR = 0.15;

export interface FeedDay {
  date: Date | string;
  feedUsed: number;
  /** Output in the flock's metric: eggs, litres, or kg of gain. */
  output: number;
}

export interface FeedTrendInput {
  /** Recorded days for ONE flock, within TREND_WINDOW_DAYS of `now`. */
  days: readonly FeedDay[];
  /** The output unit as the farmer reads it: "egg" | "litre" | "kg". */
  unit: string;
  /** Flock name, for the title. */
  label: string;
  /** KES per kilo of feed, from the farm's own feed spend — if derivable. */
  feedCostPerKg?: number | null;
  now?: Date;
}

export interface FeedTrend {
  /** Recent rate ÷ baseline rate − 1. Always ≥ DRIFT_FLOOR. */
  changePct: number;
  /** Kg of feed per unit of output, recent and baseline. */
  recentRate: number;
  baselineRate: number;
  /** Recorded days behind each window. */
  recentDays: number;
  baselineDays: number;
  /** Feed the farm is now burning needlessly, per week, in kilos. */
  extraKgPerWeek: number;
  /** The same waste in shillings — null when no feed price is derivable. */
  extraKesPerWeek: number | null;
  title: string;
  detail: string;
  moneyImpact: string;
}

function ageDays(date: Date | string, now: Date): number {
  const then = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86400000));
}

const rate3 = (n: number) =>
  n.toLocaleString("en-KE", { maximumFractionDigits: 3 });
const kg = (n: number) =>
  `${rate3(Math.round(n * 1000) / 1000)} kg`;
const kes = (n: number) =>
  `KES ${Math.round(n).toLocaleString("en-KE")}`;

/**
 * Has the feed-to-output exchange rate moved against this flock — and what is
 * that costing per week?
 *
 * @returns the trend, or `null` when the data cannot honestly support one.
 */
export function feedTrend(input: FeedTrendInput): FeedTrend | null {
  const now = input.now ?? new Date();
  if (!Array.isArray(input.days) || input.days.length === 0) return null;

  let recentFeed = 0, recentOutput = 0, recentCount = 0;
  let baseFeed = 0, baseOutput = 0, baseCount = 0;

  for (const d of input.days) {
    const age = ageDays(d.date, now);
    if (age > TREND_WINDOW_DAYS) continue;
    const feed = Number(d.feedUsed);
    const out = Number(d.output);
    if (!Number.isFinite(feed) || !Number.isFinite(out) || feed < 0 || out < 0) continue;
    if (age <= RECENT_DAYS) {
      recentFeed += feed;
      recentOutput += out;
      recentCount++;
    } else {
      baseFeed += feed;
      baseOutput += out;
      baseCount++;
    }
  }

  if (recentCount < MIN_RECENT_DAYS || baseCount < MIN_BASELINE_DAYS) return null;

  // Zero on either side is missing data, not a trend: no feed recorded means
  // we do not know what was eaten; no output recorded means the denominator
  // does not exist.
  if (recentFeed <= 0 || baseFeed <= 0 || recentOutput <= 0 || baseOutput <= 0) return null;

  const recentRate = recentFeed / recentOutput;
  const baselineRate = baseFeed / baseOutput;
  if (!(baselineRate > 0)) return null;

  const changePct = (recentRate - baselineRate) / baselineRate;
  // Improvement is not an action. Silent below the floor, in both directions.
  if (changePct < DRIFT_FLOOR) return null;

  const recentOutputPerDay = recentOutput / recentCount;
  const extraKgPerWeek = (recentRate - baselineRate) * recentOutputPerDay * 7;
  const extraKesPerWeek =
    input.feedCostPerKg !== null && input.feedCostPerKg !== undefined && Number.isFinite(input.feedCostPerKg) && input.feedCostPerKg > 0
      ? extraKgPerWeek * input.feedCostPerKg
      : null;

  const pct = Math.round(changePct * 100);
  const unit = input.unit || "unit";

  const title = `${input.label}: feed per ${unit} up ${pct}%`;
  const detail =
    `The last ${RECENT_DAYS} days used ${kg(recentRate)} of feed per ${unit} against ` +
    `${kg(baselineRate)} across the ${TREND_WINDOW_DAYS - RECENT_DAYS} days before ` +
    `(${recentCount + baseCount} recorded days). Same birds, more feed — ` +
    `the usual causes are spoilage, pests, wet litter, or scoops getting generous.`;

  const moneyImpact =
    extraKesPerWeek !== null
      ? `${kes(extraKesPerWeek)}/week wasted at your feed price`
      : `${kg(extraKgPerWeek)}/week extra feed`;

  return {
    changePct,
    recentRate,
    baselineRate,
    recentDays: recentCount,
    baselineDays: baseCount,
    extraKgPerWeek,
    extraKesPerWeek,
    title,
    detail,
    moneyImpact,
  };
}
