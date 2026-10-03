/**
 * Market price benchmarking (gap-analysis row 14, GAP 6).
 *
 * Farmers sell below market because nobody told them the market. This compares
 * the price a farmer is about to use against a reference for their region and
 * tells them, in money, what the difference is worth.
 *
 * ── What this is not ──────────────────────────────────────────────────────────
 * Not a live price feed, not an exchange, not an offer book. A benchmark with an
 * opinion is worse than no benchmark: a farmer who is told a good avocado price
 * is KES 120 in a market paying KES 80 stops believing the number entirely, and
 * then the number cannot help them at all.
 *
 * So the rule is: only ever compare against a price for THEIR region, or a
 * clearly-labelled national default, and always show the date and the source.
 * A farmer can disagree with our number, which is why we show where it came
 * from and how old it is.
 */

/** Commodities Wangari benchmarks, with the unit each is priced in. */
export const COMMODITIES: Record<string, string> = {
  milk: "litre",
  eggs: "tray",
  beef: "kg",
  goat: "head",
  sheep: "head",
  chicken: "head",
  coffee: "kg",
  tea: "kg",
  avocado: "kg",
  macadamia: "kg",
  maize: "bag",
  potatoes: "kg",
  onions: "kg",
  tomatoes: "kg",
};

/**
 * Below this fraction of the benchmark a price is flagged as leaving money on
 * the table. 10% because that is roughly the difference between a good and an
 * average offer, and below it the "you are being underpaid" claim is noise.
 */
export const FLOOR_FRACTION = 0.9;

/** A benchmark older than this is shown with a warning rather than trusted. */
export const STALE_DAYS = 30;

/** One reference price row. */
export interface PricePoint {
  commodity: string;
  unit: string;
  priceKes: number;
  /** Null = national default. */
  region: string | null;
  source: string | null;
  effectiveDate: string | Date;
}

export type PriceVerdict = "below" | "near" | "at" | "above" | "unknown";

export interface PriceComparison {
  verdict: PriceVerdict;
  benchmark: number | null;
  /** Difference per unit in KES. Negative when the farmer is below. */
  difference: number | null;
  /** What that difference is worth across the quantity being priced. */
  potentialKes: number | null;
  unit: string | null;
  region: string | null;
  source: string | null;
  /** Plain-language age of the benchmark, e.g. "12 days old". */
  ageLabel: string | null;
  stale: boolean;
  /** The single sentence to put under the price field. */
  message: string;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Whole days between the benchmark's effective date and `now`. */
export function benchmarkAgeDays(effectiveDate: string | Date, now = new Date()): number {
  const then = effectiveDate instanceof Date ? effectiveDate : new Date(effectiveDate);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** "today" | "5 days ago" | "2 months ago" — never a raw date a farmer must decode. */
export function describeAge(effectiveDate: string | Date, now = new Date()): string {
  const days = benchmarkAgeDays(effectiveDate, now);
  if (!Number.isFinite(days)) return "date unknown";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * Choose the benchmark to use: the most recent price for this farmer's region,
 * falling back to the national default only when no regional price exists.
 *
 * Regional wins even when older than a national one, because a Nakuru price
 * from six weeks ago beats a national average from yesterday — the farmer can
 * only ever sell at Nakuru.
 */
export function pickBenchmark(points: PricePoint[], region?: string | null): PricePoint | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  const usable = points.filter((p) => num(p.priceKes) !== null && num(p.priceKes)! > 0);
  if (usable.length === 0) return null;

  const norm = (r?: string | null) => (r ?? "").trim().toLowerCase();
  const target = norm(region);

  const regional = target
    ? usable.filter((p) => norm(p.region) === target)
    : usable.filter((p) => !p.region);

  const pool = regional.length > 0 ? regional : target ? usable.filter((p) => !p.region) : usable;
  if (pool.length === 0) return null;

  // Most recent effective date wins; ties broken by the higher price, because a
  // higher reference is the one that makes the farmer check their own number.
  return pool
    .slice()
    .sort((a, b) => {
      const at = new Date(a.effectiveDate).getTime();
      const bt = new Date(b.effectiveDate).getTime();
      const av = Number.isNaN(at) ? 0 : at;
      const bv = Number.isNaN(bt) ? 0 : bt;
      if (bv !== av) return bv - av;
      return (num(b.priceKes) ?? 0) - (num(a.priceKes) ?? 0);
    })[0];
}

/**
 * Compare a price the farmer is about to use against the benchmark.
 *
 * `quantity` is optional. Without it we can still say "you are KES 2 per litre
 * under"; with it we can say what that is worth on the whole load, which is the
 * number that actually changes somebody's mind.
 */
export function compareToBenchmark(
  price: unknown,
  points: PricePoint[],
  opts: { quantity?: number; region?: string | null; unit?: string | null; now?: Date } = {}
): PriceComparison {
  const now = opts.now ?? new Date();
  const empty = (message: string): PriceComparison => ({
    verdict: "unknown",
    benchmark: null,
    difference: null,
    potentialKes: null,
    unit: null,
    region: null,
    source: null,
    ageLabel: null,
    stale: false,
    message,
  });

  const entered = num(price);
  if (entered === null || entered <= 0) {
    return empty("Add the price you were offered to see how it compares to the going rate.");
  }

  const benchmarkPoint = pickBenchmark(points, opts.region);
  if (!benchmarkPoint) {
    return empty("No price reference for this yet. Entering what you were offered builds one.");
  }

  const benchmark = num(benchmarkPoint.priceKes)!;
  const unit = opts.unit ?? benchmarkPoint.unit ?? null;
  const days = benchmarkAgeDays(benchmarkPoint.effectiveDate, now);
  const stale = days > STALE_DAYS;
  const difference = entered - benchmark;

  // ── The verdict ladder ────────────────────────────────────────────────────────
// Order matters and is the whole function. Checked top to bottom:
//   1. meaningfully below the floor  -> underpaid, this is the row that matters
//   2. not meaningfully above it     -> fair, whether a shilling under or over
//   3. above it                     -> a good price, and say so
//
// An earlier version branched on `difference < 0` FIRST, which made a farmer
// who was offered 70 against a 60 benchmark look "fair" while one offered 57
// got told they were underpaid. Both were wrong in opposite directions: the
// alert loses credibility in both cases. A verdict the farmer can check
// against the two numbers on screen is the only kind worth showing.
const ratio = difference / benchmark;
// How far off the benchmark a price may sit before we call it out.
const margin = 1 - FLOOR_FRACTION; // 0.1
let verdict: PriceVerdict;
if (ratio < -margin) verdict = "below";
else if (ratio > margin) verdict = "above";
else verdict = "at";

  const quantity = num(opts.quantity);
  const potentialKes = quantity !== null && quantity > 0 ? difference * quantity : null;
  const fmt = (n: number) => `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
  const perUnit = unit ? `${fmt(Math.abs(difference))} per ${unit}` : fmt(Math.abs(difference));
  const regionLabel = benchmarkPoint.region ?? "national average";

  let message: string;
  if (verdict === "below") {
    message = `${fmt(Math.abs(difference))} per ${unit ?? "unit"} below the ${regionLabel}` +
      (potentialKes !== null && potentialKes < 0
        ? `. On ${quantity} that is ${fmt(Math.abs(potentialKes))} left on the table.`
        : ".");
  } else if (verdict === "at") {
    message = `About the ${regionLabel}. Reasonable.`;
  } else if (verdict === "above") {
    message = `${fmt(difference)} per ${unit ?? "unit"} above the ${regionLabel}. That is a good price.`;
  } else {
    message = "Could not compare this price.";
  }

  if (stale) {
    message += ` That reference is ${describeAge(benchmarkPoint.effectiveDate, now)}, so treat it as a guide.`;
  }

  return {
    verdict,
    benchmark,
    difference,
    potentialKes,
    unit,
    region: benchmarkPoint.region ?? null,
    source: benchmarkPoint.source ?? null,
    ageLabel: describeAge(benchmarkPoint.effectiveDate, now),
    stale,
    message,
  };
}