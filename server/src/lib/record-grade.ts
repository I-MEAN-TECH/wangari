/**
 * Record Grade — the farmer's *record strength*, not a credit score.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Research (Oct 2026) is consistent about what a Kenyan loan officer actually
 * assesses when collateral is not available: they want an OPERATIONAL HISTORY,
 * in four categories —
 *   1. task/activity records   2. input & procurement   3. harvest & yield
 *   4. market linkage (a named buyer who pays)
 * ...spread over *multiple seasons*, not one good week.
 *
 * So the five stars below are literally those evidence categories, one star
 * each. Nothing is invented and nothing is smoothed: a star is either earned by
 * data the farmer recorded or it is not there.
 *
 * ── The three rules that make this honest ─────────────────────────────────
 * 1. NO SCORE WITHOUT ENOUGH RECORD. Under 30 days of span we do not grade at
 *    all. We return the raw progress instead. A farmer on day 9 must never see
 *    "1 star" — that reads as failure when it is really "too early to tell".
 * 2. EVERY STAR IS A THING THE FARMER CONTROLS. Land, title, age, gender and
 *    collateral are all absent from this calculation on purpose. A woman
 *    farmer's records can score exactly as well as a man's; only her logging
 *    matters. (Research: women are excluded from credit but score well on
 *    production-consistency data — so do not penalise them for the system.)
 * 3. A WRONG NUMBER IS WORSE THAN NO NUMBER. All arithmetic is pure, has no
 *    dependencies, and is pinned by tests. Division guards everywhere.
 *
 * This is the proof layer, not a lender. Wangari does not decide credit.
 */

// ── Thresholds (named so the tests and the UI can quote the same number) ──
export const MIN_DAYS_TO_GRADE = 30;   // below this: no grade, show progress
export const CONSISTENCY_TARGET = 0.7; // 70% of days in the span logged
export const MIN_MONTHS = 3;           // a full quarter before "duration" is a star

export const WINDOW_DAYS = 90;         // the recent window for "consistency"

export interface GradeInput {
  /** Distinct days with a production OR harvest record, across all time. */
  daysWithProduction: number;
  /** Days between the first and last record (inclusive). 0 if <2 records. */
  recordSpanDays: number;
  /** Whole months between first and last record (inclusive of the first). */
  recordMonths: number;
  /**
   * Distinct calendar months that CONTAIN at least one record.
   *
   * This is deliberately separate from `recordMonths`. Live production data
   * caught the difference the hard way: one farm spanned 479 days across 16
   * calendar months but held only 2 recorded days, and a span-based "duration"
   * star handed it 4/5 with a green tone. Two entries in eighteen months is not
   * an operating history, and a bank reads it as one.
   *
   * So "duration" means months with something IN them, not months that elapsed.
   */
  monthsWithRecords: number;
  /** Sum of expense transactions in the recent window (KES). */
  expenses: number;
  /** Sum of income transactions in the recent window (KES). */
  income: number;
  /** Number of sales + deliveries in the recent window. */
  salesOrDeliveries: number;
  /** Any recorded output at all: eggs, milk, weight gain, or harvest kg. */
  hasOutput: boolean;
}

export interface Star {
  /** Stable id, used as a key and by the tests. */
  id: "consistency" | "output" | "inputs" | "market" | "duration";
  /** Swahili name of the evidence — what the farmer sees. */
  label: string;
  /** One short line, Swahili, saying exactly what earned it. */
  detail: string;
  earned: boolean;
}

export type GradeTone = "good" | "warn" | "neutral";

export interface RecordGrade {
  /** false = not enough record yet. `stars` is then 0 and is NOT a judgement. */
  graded: boolean;
  stars: number;          // 0..5, only meaningful when graded === true
  maxStars: 5;
  tone: GradeTone;        // mapped onto the app-wide StatusChip language
  /** Swahili, one line, no jargon. The reason the farmer is told out loud. */
  summary: string;
  /** Every star with its own Swahili explanation — explainability, not a black box. */
  criteria: Star[];
  /** The next single action that earns the most. null when nothing is missing. */
  nextStep: { id: string; label: string } | null;
  /** Always populated, even when not graded — progress, not a verdict. */
  progress: {
    daysLogged: number;
    windowDays: number;
    /** 0..1 within the recent window. */
    consistency: number;
    daysUntilGrading: number; // 0 once gradable
  };
}

/**
 * Normalise the raw input once, at the boundary, so no downstream arithmetic
 * ever has to defend itself. Anything untrustworthy becomes a safe zero.
 */
function sanitize(raw: GradeInput): GradeInput {
  return {
    daysWithProduction: count(raw.daysWithProduction),
    recordSpanDays: count(raw.recordSpanDays),
    recordMonths: count(raw.recordMonths),
    monthsWithRecords: count(raw.monthsWithRecords),
    expenses: money(raw.expenses),
    income: money(raw.income),
    salesOrDeliveries: count(raw.salesOrDeliveries),
    hasOutput: Boolean(raw.hasOutput),
  };
}

const pct = (n: number) => `${Math.round(ratio(n, 1) * 100)}%`;
const monthWord = (m: number) => (m === 1 ? "mwezi" : "miezi");

/**
 * Clamp to 0..1, and NaN-safe in both arguments.
 *
 * `Math.max(0, NaN)` is NaN — it does not throw, it silently poisons whatever
 * it is multiplied into, and the number then reaches the farmer as `null` in
 * the API or `NaN%` on the card. A corrupt DB value must degrade to 0, never
 * propagate. The tests pin this.
 */
const ratio = (part: number, whole: number): number => {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
};

/** A finite, non-negative integer-ish count. NaN/negative/garbage → 0. */
const count = (n: number): number =>
  Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

/** A finite, non-negative KES amount. Negative credits are shown, not summed in. */
const money = (n: number): number =>
  Number.isFinite(n) && n > 0 ? n : 0;

/**
 * Build the five evidence stars. Pure — no DB, no clock, no randomness.
 * Exported so the route and the tests share exactly one implementation.
 */
export function buildStars(raw: GradeInput): Star[] {
  const input = sanitize(raw);
  const consistency = ratio(input.daysWithProduction, WINDOW_DAYS);

  return [
    {
      id: "consistency",
      label: "Kazi kila siku",
      detail: input.daysWithProduction > 0
        ? `Umeandika siku ${input.daysWithProduction}. Lengo ni siku ${WINDOW_DAYS}.`
        : `Bado hujauandika kitu chochote. Lengo ni siku ${WINDOW_DAYS}.`,
      earned: consistency >= CONSISTENCY_TARGET,
    },
    {
      id: "output",
      label: "Mazaa",
      detail: input.hasOutput
        ? "Mazaa yako yameandikwa vizuri."
        : "Bado hujauandika mazaa yako.",
      earned: input.hasOutput,
    },
    {
      id: "inputs",
      label: "Ununuzi na gharama",
      detail: input.expenses > 0
        ? `Gharama zako ni KES ${Math.round(input.expenses).toLocaleString("en-KE")}.`
        : "Bado hujauandika gharama zako.",
      earned: input.expenses > 0,
    },
    {
      id: "market",
      label: "Unauzaji",
      detail: input.salesOrDeliveries > 0
        ? `Umeauza kwa watu ${input.salesOrDeliveries} mara. Mapato KES ${Math.round(input.income).toLocaleString("en-KE")}.`
        : "Bado hujauandika unauzaji wako.",
      earned: input.salesOrDeliveries > 0,
    },
    {
      id: "duration",
      label: "Muda",
      // Reported by months-with-records, never by elapsed calendar time: telling
      // a farmer they have "16 months of records" when they have 2 days in them
      // would be the exact overstatement this report exists to avoid.
      detail: input.monthsWithRecords >= MIN_MONTHS
        ? `Umeandika miezi ${input.monthsWithRecords}.`
        : `Umeandika miezi ${input.monthsWithRecords}. Lengo ni miezi ${MIN_MONTHS}.`,
      earned: input.monthsWithRecords >= MIN_MONTHS,
    },
  ];
}

/** Tone follows the app-wide language: green = strong, amber = short, grey = unknown. */
export function toneForStars(stars: number): GradeTone {
  if (stars >= 4) return "good";
  if (stars >= 2) return "warn";
  return "neutral";
}

/**
 * The one function that produces the report's headline.
 *
 * Contract, in order:
 *  - Not enough record  → graded:false, stars:0, progress carries the message.
 *  - Enough record      → stars counted, and the single most useful next step
 *                         is named (the first star not earned, by id order).
 */
export function computeRecordGrade(raw: GradeInput): RecordGrade {
  const input = sanitize(raw);
  const criteria = buildStars(input);
  const consistency = ratio(input.daysWithProduction, WINDOW_DAYS);
  const daysUntilGrading = Math.max(0, MIN_DAYS_TO_GRADE - input.recordSpanDays);

  const progress = {
    daysLogged: input.daysWithProduction,
    windowDays: WINDOW_DAYS,
    consistency,
    daysUntilGrading,
  };

  // Rule 1 — refuse to grade a record that is too short to mean anything.
  if (input.recordSpanDays < MIN_DAYS_TO_GRADE) {
    const remaining = MIN_DAYS_TO_GRADE - input.recordSpanDays;
    return {
      graded: false,
      stars: 0,
      maxStars: 5,
      tone: "neutral",
      summary:
        `Bado umeandika siku ${input.recordSpanDays}. ` +
        `Andika kila siku kwa siku ${remaining} zaidi ili tupatie alama yako.`,
      criteria,
      progress,
      nextStep: {
        id: "consistency",
        label: `Andika kila siku (bado siku ${remaining})`,
      },
    };
  }

  const stars = criteria.filter((c) => c.earned).length;
  const missing = criteria.filter((c) => !c.earned);

  const summary =
    stars === 5
      ? `Rekodi yako imekamilika. Umeandika siku ${input.daysWithProduction} na kila kitu kimekosekana.`
      : stars === 0
        ? "Bado kuna kazi. Anza kwa kitu kimoja kila siku."
        : `Umekata alama ${stars} kati ya 5. ` +
          `Kuna ${missing.length} kitu ${missing.length === 1 ? "kinachobaki" : "zinabaki"} kukamilisha.`;

  return {
    graded: true,
    stars,
    maxStars: 5,
    tone: toneForStars(stars),
    summary,
    criteria,
    progress,
    nextStep: missing.length ? { id: missing[0].id, label: missing[0].label } : null,
  };
}

/** Convenience for the UI: the Swahili word for a star count, for the speech layer later. */
export function starsAsWords(stars: number): string {
  return [ "", "nyuma", "mbili", "tatu", "nne", "tano" ][Math.max(0, Math.min(5, Math.round(stars)))] || "";
}

export { pct, monthWord, ratio };
