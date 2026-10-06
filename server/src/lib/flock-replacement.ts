/**
 * Flock replacement timing — M3's third rule, the "three steps ahead" that was
 * deferred because "there is no bird-age data to build it on". A production
 * audit found that claim stale: 5 of 6 production flocks carry a `hatchDate`
 * (the intake form has always asked for "Date you got them"), so the age the
 * replacement decision needs has been sitting in the schema all along.
 *
 * What this does: for an egg-laying flock, compute the bird's age and say when
 * the production cliff arrives. Layer flocks are the one honest case — their
 * lay curve against age is common knowledge with a broad, defensible range:
 * birds come into lay around 18-20 weeks, peak through roughly week 30, and
 * production falls steeply from about week 72-80, which is when a commercial
 * keeper replaces the flock. The card never claims a precise date; it names
 * the window and the weeks that remain inside it.
 *
 * ## The honesty rules
 *
 * - **Layers only.** Broilers are slaughtered by week 8 — replacement is the
 *   brooding schedule, not a timing decision. Cattle are replaced by culling
 *   individual animals, not as a flock. A rule that guessed for them would be
 *   decoration.
 * - **Silence on thin data.** No `hatchDate` → no age → nothing to say. This
 *   module refuses rather than defaulting, the way `sale-timing` refuses when
 *   market_prices is empty.
 * - **The age is derived, never claimed.** `hatchDate` in this schema is "the
 *   day the birds arrived" — for bought-in point-of-lay pullets the true age
 *   is greater. The card says "weeks since the flock arrived", and the detail
 *   carries that caveat once, not in every sentence.
 * - **No money invented.** The cost of a replacement flock is whatever the
 *   farm's own records say it spent to stock this one (`costPerAnimal` /
 *   `totalInvestment`); with neither recorded the card speaks in weeks, not
 *   shillings.
 */

/** Weeks after arrival when lay typically starts (bought pullets arrive near it). */
export const LAY_START_WEEKS = 18;
/** The steep decline window's opening — commercial replacement decision age. */
export const REPLACE_WINDOW_WEEKS = 72;
/** Its close — past this, the card escalates from "plan" to "decide now". */
export const REPLACE_WINDOW_END_WEEKS = 80;
/** How far ahead the card first speaks — "plan NOW" means 8+ weeks of runway. */
export const PLAN_AHEAD_WEEKS = 8;

export interface FlockReplacementInput {
  /** "The day the birds arrived" (schema's `hatchDate`). */
  arrivedAt: Date | string;
  /** Flock name, for the title. */
  label: string;
  /** Current head-count — weeks alone are not a decision, birds are. */
  currentCount: number;
  /** What stocking this flock cost, from the farm's own records. */
  costPerAnimal?: number | null;
  totalInvestment?: number | null;
  now?: Date;
}

export interface FlockReplacement {
  /** Weeks since the flock arrived (floored). */
  ageWeeks: number;
  /** Weeks until the decline window opens (negative when inside/past it). */
  weeksToWindow: number;
  /** "planning" | "window" | "overdue" — see the title rules below. */
  phase: "planning" | "window" | "overdue";
  /** The replacement cost, ONLY from the farm's own records. */
  replacementCostKes: number | null;
  title: string;
  detail: string;
  moneyImpact?: string;
}

const weeks = (n: number) => {
  const w = Math.round(n * 10) / 10;
  return `${w} week${w === 1 ? "" : "s"}`;
};
const kes = (n: number) =>
  `KES ${Math.round(n).toLocaleString("en-KE")}`;

/**
 * Should this layer flock's replacement be on the farmer's week radar — and
 * in which phase?
 *
 * @returns the card, or `null` while the flock is young or the data is absent.
 */
export function flockReplacement(
  input: FlockReplacementInput
): FlockReplacement | null {
  const now = input.now ?? new Date();
  const arrived = input.arrivedAt instanceof Date ? input.arrivedAt : new Date(input.arrivedAt);
  if (Number.isNaN(arrived.getTime())) return null;
  if (arrived.getTime() > now.getTime()) return null; // future-dated: intake typo, not a trend

  const ageMs = now.getTime() - arrived.getTime();
  const ageWeeks = Math.floor(ageMs / (7 * 86400000));
  const weeksToWindow = REPLACE_WINDOW_WEEKS - ageWeeks;

  if (ageWeeks < REPLACE_WINDOW_WEEKS - PLAN_AHEAD_WEEKS) return null;
  if (input.currentCount <= 0) return null;

  const phase: FlockReplacement["phase"] =
    ageWeeks >= REPLACE_WINDOW_END_WEEKS ? "overdue" : ageWeeks >= REPLACE_WINDOW_WEEKS ? "window" : "planning";

  const n = input.currentCount.toLocaleString("en-KE");

  let replacementCostKes: number | null = null;
  if (input.totalInvestment != null && Number(input.totalInvestment) > 0) {
    replacementCostKes = Number(input.totalInvestment);
  } else if (input.costPerAnimal != null && Number(input.costPerAnimal) > 0) {
    replacementCostKes = Number(input.costPerAnimal) * input.currentCount;
  }

  const agePhrase = `arrived ${weeks(ageWeeks)} ago`;
  const windowPhrase = `lay usually falls steeply from about week ${REPLACE_WINDOW_WEEKS}`;

  if (phase === "planning") {
    return {
      ageWeeks,
      weeksToWindow,
      phase,
      replacementCostKes,
      title: `${input.label}: plan replacement of ${n} layers — ${weeks(weeksToWindow)} to the drop`,
      detail:
        `The flock ${agePhrase} (weeks since arrival, counted from the day you got the birds). ` +
        `${windowPhrase}. Order point-of-lay pullets ${PLAN_AHEAD_WEEKS} weeks early so the new ` +
        `flock is laying as this one tapers — a gap between flocks is weeks of eggs you never sell.`,
      moneyImpact:
        replacementCostKes !== null
          ? `Restocking ${n} birds cost about ${kes(replacementCostKes)} last time`
          : undefined,
    };
  }

  if (phase === "window") {
    return {
      ageWeeks,
      weeksToWindow,
      phase,
      replacementCostKes,
      title: `${input.label}: ${n} layers are ${weeks(ageWeeks)} old — the lay drop starts now`,
      detail:
        `The flock ${agePhrase}. ${windowPhrase}, and this flock is inside that window. ` +
        `Decide this month: replace now while cull birds still sell, or run on and watch the ` +
        `feed-to-egg exchange rate. The Action Center will show both numbers either way.`,
      moneyImpact:
        replacementCostKes !== null
          ? `Restocking ${n} birds cost about ${kes(replacementCostKes)} last time`
          : undefined,
    };
  }

  return {
    ageWeeks,
    weeksToWindow,
    phase,
    replacementCostKes,
    title: `${input.label}: ${n} layers are ${weeks(ageWeeks)} old — past the usual replacement age`,
    detail:
      `The flock ${agePhrase}, beyond the week ${REPLACE_WINDOW_END_WEEKS} mark where most commercial ` +
      `layers are replaced. If production is still worth the feed, keep them and record why; ` +
      `if not, replace — every week now is feed bought for eggs that are not coming.`,
    moneyImpact:
      replacementCostKes !== null
        ? `Restocking ${n} birds cost about ${kes(replacementCostKes)} last time`
        : undefined,
  };
}

