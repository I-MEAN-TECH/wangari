/**
 * The ledger taxonomy — the one decision `Transaction.category` never made.
 *
 * ## The problem this exists to fix
 *
 * `Transaction.category` is free text. A live audit of the production table
 * (2 Oct 2026, 17 rows) found two things wrong with that:
 *
 *   1. **Two conventions for one thing.** `animal_feed` appears 7 times and
 *      `Bird Purchase` once — both are feed-or-stock costs that no query can
 *      group together.
 *   2. **Costs and revenue share a column.** The same field holds
 *      `animal_feed`, `veterinary`, `labor` (costs) *and* `meat`, `milk`,
 *      `eggs`, `crops`, `livestock` (revenue streams).
 *
 * `Transaction.type` is already clean (`expense` 11, `income` 6), so it can
 * be the spine. What is missing is a mapping from the free text to a
 * canonical vocabulary — and that mapping is a pure function, which is why it
 * lives here and not in a route.
 *
 * ## Why the farm-facing labels are Swahili
 *
 * module-plan.md §0.1 R5: "Swahili first, always." These strings are shown to
 * the farmer, so they are Swahili. The machine keys stay English because they
 * are stored in the database and appear in API responses.
 *
 * ## Why the fallback is a bucket, not `undefined`
 *
 * A farmer's expense with an unrecognised category must still appear in his
 * totals. Dropping it would understate his costs and overstate his profit —
 * and a profit figure that is wrong in his favour is still a wrong figure he
 * will take to a SACCO.
 */

/** Canonical cost buckets. One per kind of money going out. */
export type CostBucket =
  | "feed"
  | "veterinary"
  | "labour"
  | "stock"
  | "seed"
  | "fertiliser"
  | "equipment"
  | "transport"
  | "utilities"
  | "other";

/** Canonical enterprise kinds — what the farm actually earns from. */
export type EnterpriseKind =
  | "poultry"
  | "dairy"
  | "livestock"
  | "crops"
  | "aquaculture"
  | "apiculture"
  | "general";

/**
 * Normalise a free-text category into a stable key.
 *
 * Lowercase, trim, and collapse every run of non-alphanumeric characters into
 * a single underscore. So `"  Animal Feed "`, `"Animal-Feed"` and
 * `"animal---feed"` all become `"animal_feed"`.
 *
 * Never returns `undefined` — null and undefined become `""`, which the
 * classifiers treat as unrecognised.
 */
export function normaliseCategory(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Cost-bucket lookup. Keys are the output of `normaliseCategory`.
 *
 * The first four entries are the categories that actually exist in the live
 * table; the rest are the obvious next ones so a farmer is not told his
 * fertiliser is "other" the first time he buys any.
 */
const EXPENSE_MAP: Readonly<Record<string, CostBucket>> = {
  // feed — the live convention and its near neighbours
  animal_feed: "feed",
  feed: "feed",
  feeds: "feed",
  poultry_feed: "feed",
  dairy_feed: "feed",
  layers_mash: "feed",
  // stock — buying the animal itself. "Bird Purchase" is a live row.
  bird_purchase: "stock",
  birds_purchase: "stock",
  chick_purchase: "stock",
  chicks: "stock",
  animal_purchase: "stock",
  livestock_purchase: "stock",
  day_old_chicks: "stock",
  // veterinary — live
  veterinary: "veterinary",
  vet: "veterinary",
  vaccination: "veterinary",
  vaccine: "veterinary",
  drugs: "veterinary",
  animal_health: "veterinary",
  // labour — live as both spellings
  labor: "labour",
  labour: "labour",
  wages: "labour",
  salary: "labour",
  workers: "labour",
  // seed / fertiliser — crops
  seed: "seed",
  seeds: "seed",
  seedling: "seed",
  seedlings: "seed",
  fertilizer: "fertiliser",
  fertiliser: "fertiliser",
  manure: "fertiliser",
  // equipment
  equipment: "equipment",
  tools: "equipment",
  machinery: "equipment",
  // transport / utilities
  transport: "transport",
  fuel: "transport",
  diesel: "transport",
  electricity: "utilities",
  water: "utilities",
  // rent and other overheads land in "other" deliberately — we do not
  // invent a bucket we cannot compute per-enterprise yet.
};

/**
 * Enterprise-kind lookup for income rows.
 *
 * The live income categories (`meat`, `milk`, `eggs`, `crops`, `livestock`)
 * are *already* enterprise names, so this map is mostly identity. `meat` maps
 * to `livestock` because "meat" is what a livestock enterprise sells.
 */
const INCOME_MAP: Readonly<Record<string, EnterpriseKind>> = {
  // poultry
  eggs: "poultry",
  egg: "poultry",
  poultry: "poultry",
  chicken: "poultry",
  chickens: "poultry",
  broilers: "poultry",
  kuku: "poultry",
  // Flock `type` values, reached via `enterpriseKindForFlock` when a flock
  // was created before the `category` field existed. "cattle" is deliberately
  // absent: it is equally a beef or a dairy animal, and guessing between them
  // is exactly the failure this module was written to remove.
  layers: "poultry",
  pullets: "poultry",
  cockerels: "poultry",
  // dairy
  milk: "dairy",
  dairy: "dairy",
  maziwa: "dairy",
  // Flock `type` values that already name their own enterprise — no guessing
  // involved, so they are safe in a vocabulary that otherwise refuses to
  // split "cattle" into beef or dairy. A dairy herd is created with
  // category "livestock" + type "cattle_dairy"; without this key the type
  // classified as general and the bucket "livestock" won, so milk income
  // could never find its flock (found by probe-unit-economics.mjs).
  cattle_dairy: "dairy",
  cattle_beef: "livestock",
  // livestock (meat + live animal sales)
  meat: "livestock",
  livestock: "livestock",
  beef: "livestock",
  goat: "livestock",
  goats: "livestock",
  mutton: "livestock",
  pork: "livestock",
  pigs: "livestock",
  // crops
  crops: "crops",
  crop: "crops",
  maize: "crops",
  coffee: "crops",
  tea: "crops",
  avocado: "crops",
  macadamia: "crops",
  // aquaculture / apiculture
  fish: "aquaculture",
  samaki: "aquaculture",
  honey: "apiculture",
  nyuki: "apiculture",
};

/** Classify an expense category into a canonical cost bucket. Never throws. */
export function classifyExpense(category: string | null | undefined): CostBucket {
  return EXPENSE_MAP[normaliseCategory(category)] ?? "other";
}

/** Classify an income category into the enterprise it came from. Never throws. */
export function classifyIncome(category: string | null | undefined): EnterpriseKind {
  return INCOME_MAP[normaliseCategory(category)] ?? "general";
}

/**
 * Kilograms of output per egg.
 *
 * This number used to be a bare `0.06` inlined in `profitability.ts`, which
 * meant nobody could see that it was an assumption, let alone challenge it.
 * Naming it here at least makes it visible and gives it one home.
 *
 * 0.06 kg = 60 g, a reasonable Kenyan layer average. It is still an
 * **assumption** — it is not per-breed, and it is not measured. When M4 needs
 * per-unit cost of production to be trustworthy, this should come from
 * `DailyProduction.avgWeight` or a breed table instead.
 */
export const KG_PER_EGG = 0.06;

/** Farmer-facing labels, Swahili first (module-plan.md §0.1 R5). */
export const COST_BUCKET_LABELS: Readonly<Record<CostBucket, string>> = {
  feed: "Chakula",
  veterinary: "Dawa",
  labour: "Wafanyakazi",
  stock: "Kununua wanyama",
  seed: "Mbegu",
  fertiliser: "Mbolea",
  equipment: "Zana",
  transport: "Usafiri",
  utilities: "Maji na umeme",
  other: "Nyingine",
};

/** Farmer-facing enterprise labels, Swahili first. */
export const ENTERPRISE_LABELS: Readonly<Record<EnterpriseKind, string>> = {
  poultry: "Kuku",
  dairy: "Maziwa",
  livestock: "Mifugo",
  crops: "Mazao",
  aquaculture: "Samaki",
  apiculture: "Nyuki",
  general: "Shamba",
};
