/**
 * Unit economics — M4's headline: cost of production vs price, side by side.
 *
 * The plan calls this "the single most powerful screen we could ship". Its
 * power comes entirely from three numbers the farmer can check against each
 * other in one glance:
 *
 *     cost to make one egg   KES 4.20
 *     what your books earn   KES 5.10
 *     what the county pays   KES 4.00   (when recorded offers exist)
 *
 * ## The honesty rules this module is built around
 *
 * 1. **Zero costs means "not recorded", not "free".** The profitability route
 *    divides costs by output, and a period with output but no expense rows
 *    yields `0`. Printing "KES 0 cost per egg — hugely profitable" would be
 *    the most dangerous sentence in the product, so `0` is read as *no cost
 *    recorded* and says exactly that.
 * 2. **Prices below or at zero are "not recorded"** for the same reason — a
 *    revenue of 0 is an absence of sales, not a sale at zero shillings.
 * 3. **The verdict prefers the farm's own realised price** (revenue ÷ output)
 *    over the county benchmark: what THIS farm actually banked beats what
 *    strangers recorded. The benchmark only speaks when the farm's own books
 *    are silent, and the caller labels which one is talking.
 * 4. **"Thin" is a real verdict.** Between zero and 15% margin a price wobble
 *    erases the profit, and a farmer who thinks he is breaking even when he
 *    is one bad week from losing needs to be told so. 15% is stated as a
 *    constant, not hidden in the branches.
 *
 * The `headline` and `detail` strings are returned ready to display, because
 * the tests then defend the words the farmer reads — a message that says
 * "profit" while the arithmetic says "short" is the bug worth catching.
 */

/** How the enterprise stands, in the order a farmer would ask. */
export type MarginVerdict =
  | "profitable"
  | "thin"
  | "losing"
  | "no-cost"
  | "no-price";

/** Below this share of the price, a good week is one price dip from a loss. */
export const THIN_MARGIN_FRACTION = 0.15;

export interface UnitEconomicsInput {
  /** Costs ÷ output for the period. `null` or `0` = nothing recorded. */
  costPerUnit: number | null;
  /** Attributed revenue ÷ output — what this farm's records say it earns. */
  ownPricePerUnit: number | null;
  /** County benchmark already converted to the same unit as the cost. */
  marketPricePerUnit: number | null;
  /** The unit both prices are quoted in: "egg" | "litre" | "kg". */
  unit: string;
}

export interface UnitEconomics {
  verdict: MarginVerdict;
  /** Which price the verdict leaned on, or null when neither exists. */
  priceSource: "own" | "market" | null;
  /** The farm's own realised price, normalised (0 → null). */
  ownPricePerUnit: number | null;
  /** The county benchmark in cost units, normalised (0 → null). */
  marketPricePerUnit: number | null;
  /** price − cost per unit. Positive = keeping money, negative = short. */
  profitPerUnit: number | null;
  costPerUnit: number | null;
  /** The price used for the verdict (own first, market second). */
  pricePerUnit: number | null;
  /** One line, big enough to screenshot. */
  headline: string;
  /** The evidence underneath it. */
  detail: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const kes = (n: number) => `KES ${Math.abs(round2(n)).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

/** A price at or below zero is an absence of data, not a price. */
const asPrice = (v: number | null | undefined): number | null =>
  v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Put the three numbers in a row and say what they mean, in the farmer's
 * money. Returns `verdict: "no-cost" | "no-price"` (with an honest headline)
 * whenever the data cannot carry a profit claim.
 */
export function unitEconomics(input: UnitEconomicsInput): UnitEconomics {
  const unit = input.unit || "unit";
  const cost = asPrice(input.costPerUnit) ?? (input.costPerUnit === 0 ? 0 : null);
  const own = asPrice(input.ownPricePerUnit);
  const market = asPrice(input.marketPricePerUnit);
  const price = own ?? market;
  const priceSource: "own" | "market" | null = own ? "own" : market ? "market" : null;

  // ── No cost side ───────────────────────────────────────────────────────────
  // cost null (no output) or cost 0 (output with no expenses): either way we
  // cannot claim a margin, and claiming one on a zero would be a lie in the
  // farmer's favour — which is still a lie he might take to a SACCO.
  if (cost === null || cost === 0) {
    return {
      verdict: "no-cost",
      priceSource,
      ownPricePerUnit: own,
      marketPricePerUnit: market,
      profitPerUnit: null,
      costPerUnit: cost,
      pricePerUnit: price,
      headline: `No cost recorded per ${unit} yet`,
      detail:
        "Nothing spent on feed, vet or labour is recorded against this enterprise for the period, " +
        "so there is no cost to compare a price against. Record those expenses and this line becomes the truth about your margin.",
    };
  }

  // ── No price side ──────────────────────────────────────────────────────────
  if (price === null) {
    return {
      verdict: "no-price",
      priceSource: null,
      ownPricePerUnit: own,
      marketPricePerUnit: market,
      profitPerUnit: null,
      costPerUnit: cost,
      pricePerUnit: null,
      headline: `Costs ${kes(cost)} per ${unit} — price unknown`,
      detail:
        `Your records say it costs ${kes(cost)} to produce one ${unit}. ` +
        "Record a sale, or the price you were offered, to see what you actually keep per unit.",
    };
  }

  const profit = price - cost;
  const profitPerUnit = round2(profit);
  const ratio = profit / price;
  const priceLabel = priceSource === "own" ? "your records say you earn" : "the county pays";

  if (profit < 0) {
    return {
      verdict: "losing",
      priceSource,
      ownPricePerUnit: own,
      marketPricePerUnit: market,
      profitPerUnit,
      costPerUnit: cost,
      pricePerUnit: price,
      headline: `${kes(profit)} short per ${unit}`,
      detail:
        `It costs ${kes(cost)} to produce one ${unit} but ${priceLabel} ${kes(price)} — ` +
        `you are ${kes(profit)} behind on every ${unit} you produce.`,
    };
  }

  if (ratio < THIN_MARGIN_FRACTION) {
    return {
      verdict: "thin",
      priceSource,
      ownPricePerUnit: own,
      marketPricePerUnit: market,
      profitPerUnit,
      costPerUnit: cost,
      pricePerUnit: price,
      headline: `Only ${kes(profit)} profit per ${unit}`,
      detail:
        `Cost ${kes(cost)} to make one ${unit}; ${priceLabel} ${kes(price)}. ` +
        `That is ${Math.round(ratio * 100)}% margin — one price dip or one bad week of feed prices and it is gone.`,
    };
  }

  return {
    verdict: "profitable",
    priceSource,
    ownPricePerUnit: own,
    marketPricePerUnit: market,
    profitPerUnit,
    costPerUnit: cost,
    pricePerUnit: price,
    headline: `${kes(profit)} profit per ${unit}`,
    detail:
      `Cost ${kes(cost)} to make one ${unit}; ${priceLabel} ${kes(price)}. ` +
      `At ${Math.round(ratio * 100)}% margin you keep ${kes(profit)} per ${unit}.`,
  };
}

/**
 * Which market commodity, if any, prices this enterprise — and how to convert
 * the quoted price into the enterprise's own unit.
 *
 * Deliberately narrow: only commodities whose benchmark is quoted in a unit we
 * can convert without inventing an assumption. Maize is priced per *bag* of
 * unknown kilos, goat per *head* against our per-kg cost — both map to `null`
 * rather than a conversion nobody can defend.
 */
export interface CommodityMapping {
  commodity: string;
  /** The unit the benchmark row must be quoted in (normalised: "tray"|"trays"). */
  benchmarkUnit: string;
  /** How many cost units make one benchmark unit (30 eggs = 1 tray). */
  costUnitsPerBenchmarkUnit: number;
}

const KG_CROPS: { match: string[]; commodity: string }[] = [
  { match: ["coffee"], commodity: "coffee" },
  { match: ["avocado"], commodity: "avocado" },
  { match: ["tea"], commodity: "tea" },
  { match: ["potato", "irish"], commodity: "potatoes" },
  { match: ["onion"], commodity: "onions" },
  { match: ["tomato"], commodity: "tomatoes" },
];

/**
 * Map an enterprise row (as `/api/profitability` shapes it) to a commodity.
 * `null` = no defensible market reference for this enterprise.
 */
export function commodityForEnterprise(row: {
  unit: string | null;
  species?: string | null;
  category?: string | null;
  cropType?: string | null;
}): CommodityMapping | null {
  if (row.unit === "egg") {
    return { commodity: "eggs", benchmarkUnit: "tray", costUnitsPerBenchmarkUnit: 30 };
  }
  if (row.unit === "litre") {
    return { commodity: "milk", benchmarkUnit: "litre", costUnitsPerBenchmarkUnit: 1 };
  }
  if (row.unit === "kg") {
    const species = `${row.species ?? ""}`.toLowerCase();
    if (species === "cattle_beef" || species === "cattle") {
      return { commodity: "beef", benchmarkUnit: "kg", costUnitsPerBenchmarkUnit: 1 };
    }
    const crop = `${row.cropType ?? ""}`.toLowerCase();
    const hit = KG_CROPS.find((c) => c.match.some((k) => crop.includes(k)));
    if (hit) return { commodity: hit.commodity, benchmarkUnit: "kg", costUnitsPerBenchmarkUnit: 1 };
  }
  return null;
}

/**
 * Convert a benchmark row into the enterprise's cost unit, or `null` when the
 * quoted unit is not the one we assumed. Units arrive as farmers typed them —
 * "tray" and "trays" both occur — so the comparison ignores a trailing "s".
 */
export function benchmarkToCostUnit(
  priceKes: number,
  quotedUnit: string | null | undefined,
  mapping: CommodityMapping
): number | null {
  if (!Number.isFinite(priceKes) || priceKes <= 0) return null;
  const norm = (u: string | null | undefined) => (u ?? "").trim().toLowerCase().replace(/s$/, "");
  if (norm(quotedUnit) !== norm(mapping.benchmarkUnit)) return null;
  const per = mapping.costUnitsPerBenchmarkUnit;
  return per > 0 ? priceKes / per : null;
}
