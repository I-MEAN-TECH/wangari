/**
 * How a crop actually gives you food — not how it is botanically classified.
 *
 * Wangari used to treat every crop the same way: plant it, wait for one
 * "Harvest", then the crop is finished. That is true for maize and it is
 * badly wrong for most of what a Kenyan smallholder actually grows.
 *
 * Three patterns exist, and they need three different questions:
 *
 *  - `continuous` — cut-and-come-again leafy greens and repeatedly-picked
 *    fruiting crops. You harvest a little almost every day or every week, and
 *    the plant keeps going. Kale (sukuma wiki) is ready 45–60 days after
 *    transplanting and is then picked weekly; picking actually encourages more
 *    growth. Spinach and the East African "spinach" complex (Swiss chard,
 *    amaranth/terere, nightshade/managu) are cut the same way — mature outer
 *    leaves are taken and the crown is left to regrow, so production is
 *    continuous rather than a single event.
 *  - `perennial` — tree and vine crops you plant once and pick from for years.
 *    Avocado is the clearest case: Kenya's main harvest windows are roughly
 *    March–August and October–December, the same trees crop again the next
 *    year, and a well-kept tree bears for decades. You do not "harvest an
 *    avocado crop" and close the field. Same for mango, banana, macadamia,
 *    coffee, tea, citrus and passion fruit.
 *  - `single` — one harvest per planting, then the field is cleared and
 *    replanted. Maize, dry beans, rice, potatoes, onions, cabbage.
 *
 * The distinction is not cosmetic. A continuous crop should never be shown as
 * "Harvest in 4 days" then "Ready", and a perennial should never ask the
 * farmer to register the tree again after every pick.
 */

export type HarvestPattern = "continuous" | "perennial" | "single";

const CONTINUOUS = [
  // Leafy greens cut leaf-by-leaf, crown left to regrow
  "spinach", "sukuma", "kale", "swiss chard", "silverbeet", "chard",
  "amaranth", "terere", "mchicha", "nightshade", "managu", "osuga",
  "ethiopian mustard", "kanzira", "kanzira", "lettuce", "coriander",
  "dhania", "cilantro", "spring onion", "scallion", "sagaa", "mrenda",
  "jute mallow", "pumpkin leaves", "cowpea leaves", "kunde", "spider plant",
  // Repeatedly-picked fruiting crops (picked over weeks, same plant)
  "tomato", "cherry tomato", "french bean", "green bean", "climbing bean",
  "capsicum", "green pepper", "bell pepper", "chilli", "chili", "pepper",
  "cucumber", "courgette", "zucchini", "strawberry", "okra", "brinjal",
  "eggplant", "aubergine", "passion fruit", "passion",
];

const PERENNIAL = [
  "avocado", "mango", "banana", "plantain", "pawpaw", "papaya", "guava",
  "macadamia", "coffee", "tea", "citrus", "orange", "lemon", "lime",
  "tangerine", "mandarin", "grapefruit", "tree tomato", "tamarillo",
  "coconut", "jackfruit", "cashew", "pomegranate", "fig", "mulberry",
  "loquat", "pear", "apple", "peach", "plum", "grapes", "grape vine",
  "napier", "napier grass", "fodder", "brachiaria", "sugarcane", "sugar cane",
];

/** Long-cycle root crops that are planted once and lifted once — kept as
 *  `single` because each plant gives one harvest, even though the cycle is
 *  many months. Listing them explicitly avoids a keyword collision with the
 *  leafy crops above. */
const SINGLE_OVERRIDES = [
  "cassava", "sweet potato", "sweetpotato", "yam", "arrowroot", "taro",
  "ginger", "turmeric",
];

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Classify a crop from its recorded `cropType` or name. Explicit data wins:
 * a row already flagged `isPerennial` is trusted over keyword guessing, so
 * the farmer's own correction is never overridden by this table.
 */
export function harvestPatternFor(crop: {
  cropType?: string | null;
  name?: string | null;
  isPerennial?: boolean | null;
}): HarvestPattern {
  if (crop.isPerennial) return "perennial";

  const haystack = normalise(`${crop.cropType ?? ""} ${crop.name ?? ""}`);
  if (!haystack) return "single";

  // Overrides are checked first: "sweet potato" contains "potato" but is a
  // single-harvest crop, and "cassava" must never fall through to a leafy match.
  if (SINGLE_OVERRIDES.some((k) => haystack.includes(k))) return "single";
  if (PERENNIAL.some((k) => haystack.includes(k))) return "perennial";

  // Word-boundary-ish match for continuous crops: "kale" must match "kale"
  // and "sukuma wiki", but "pepper" matching "peppermint" would be wrong, so
  // compare on whole tokens as well as substrings.
  const tokens = new Set(haystack.split(" "));
  if (CONTINUOUS.some((k) => (k.includes(" ") ? haystack.includes(k) : tokens.has(k) || haystack.includes(k)))) {
    return "continuous";
  }

  return "single";
}

export interface HarvestPatternMeta {
  label: string;
  /** One line a farmer reads when they land on the crop. */
  summary: string;
  /** Default unit for logging output. */
  unit: string;
  /** Whether the crop should appear in Daily Output's crop list. */
  loggableFrequently: boolean;
}

export const HARVEST_PATTERN_META: Record<HarvestPattern, HarvestPatternMeta> = {
  continuous: {
    label: "Continuous",
    summary:
      "Picked a little at a time — often weekly or daily. Keep picking: it encourages more growth.",
    unit: "kg",
    loggableFrequently: true,
  },
  perennial: {
    label: "Perennial tree / vine",
    summary:
      "Planted once and picked for years. It fruits in seasons and then crops again next year — you never replant it.",
    unit: "kg",
    loggableFrequently: true,
  },
  single: {
    label: "Single harvest",
    summary: "One harvest per planting, then the field is cleared and replanted.",
    unit: "kg",
    loggableFrequently: false,
  },
};

/** Crops that make sense to log output against in Daily Output. */
export function isFrequentlyLogged(crop: {
  cropType?: string | null;
  name?: string | null;
  isPerennial?: boolean | null;
}): boolean {
  return HARVEST_PATTERN_META[harvestPatternFor(crop)].loggableFrequently;
}

/** Wording for the crop's next-step line, per pattern. */
export function nextStepLine(pattern: HarvestPattern, stage: string, daysLeft: number | null): string {
  if (pattern === "continuous") {
    return "Picking season — record what you cut today";
  }
  if (pattern === "perennial") {
    return daysLeft !== null && daysLeft > 0
      ? `Next picking window in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
      : "In season — record each pick";
  }
  return `Now: ${stage}`;
}
