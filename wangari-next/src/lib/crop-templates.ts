/**
 * Crop input guidance — the crop-side counterpart to `species-templates.ts`.
 *
 * Animals have had breed-level feed and vaccine data for a while. Crops had
 * none: a farmer planting tomatoes and a farmer planting maize got the same
 * generic advice, or nothing at all.
 *
 * Everything here is ordered by GROWTH STAGE rather than being one flat list,
 * because that is the question a farmer actually has. "What do I apply to
 * tomatoes?" is not answerable in one line — the answer in week 1 is different
 * from week 8, and the wrong one costs money twice: wasted input, and a crop
 * that fails.
 *
 * Rates are the common Kenyan smallholder ranges, in kg/acre unless stated.
 * They are guidance to compare against a bag label, not a substitute for one.
 */

export type CropStageId = "land_prep" | "planting" | "vegetative" | "flowering" | "harvest";

export interface CropStage {
  id: CropStageId;
  label: string;
  /** Weeks after planting. Null means "before you plant". */
  weekFrom: number | null;
  weekTo: number | null;
  /** What to apply in this window. */
  inputs: string[];
  /** What the farmer should be seeing if it is going well. */
  signs: string[];
}

export interface CropTemplate {
  id: string;
  name: string;
  category: "cereal" | "legume" | "vegetable" | "root" | "fruit" | "other";

  /** Baseline soil nutrients this crop draws on, for a soil-test conversation. */
  nutrientNeeds: { nitrogen: string; phosphorus: string; potassium: string };

  /** The product a smallholder would actually buy. */
  baseFertilizer: string;
  /** Why that one, in a sentence a farmer can check against their bag. */
  fertilizerReason: string;

  /** Crop-specific insecticide/fungicide guidance by problem, not by brand. */
  pests: { problem: string; signs: string; control: string }[];

  /** The mistake that costs this crop the most money, if we had to name one. */
  criticalTiming: string;

  growthCycleDays: number;
  harvestWindow: string;

  stages: CropStage[];
}

const maize: CropTemplate = {
  id: "maize",
  name: "Maize",
  category: "cereal",
  nutrientNeeds: { nitrogen: "High", phosphorus: "Medium", potassium: "Medium" },
  baseFertilizer: "DAP (18-46-0) at planting, then CAN or Urea top-dress at 4-5 weeks",
  fertilizerReason:
    "DAP puts starter nutrient right where the seed is, which matters in the first three weeks. Nitrogen is what maize actually runs out of, so it gets top-dressed rather than all applied at once.",
  pests: [
    {
      problem: "Fall armyworm",
      signs: "Ragged holes in the whorl; sawdust-like frass in the leaf funnel.",
      control:
        "Scout from day 14. Treat early while larvae are still in the whorl — once they bore into the stem, no spray reaches them.",
    },
    {
      problem: "Stalk borer",
      signs: "Holes with frass on the stem below the ear; plant wilts in heat.",
      control: "Apply before tasselling. Too late and the damage to the stem is done.",
    },
    {
      problem: "Streak (maize streak virus)",
      signs: "Short pale streaks along the leaf, plant stunted.",
      control:
        "There is no cure. Control the leafhopper that spreads it and pull infected plants early; do not save seed from them.",
    },
  ],
  criticalTiming:
    "Top-dress nitrogen at 4-5 weeks. Late nitrogen means the plant fills grain after the rains have stopped, and that is the single most common reason a maize harvest disappoints.",
  growthCycleDays: 120,
  harvestWindow: "About 4-5 months from planting, when the cob husk dries to a grey-green.",
  stages: [
    {
      id: "land_prep",
      label: "Land preparation",
      weekFrom: null,
      weekTo: 0,
      inputs: [
        "Manure or compost, well-rotted — 2-4 tonnes per acre, worked in before planting",
        "Lime only if a soil test says the soil is acidic; do not guess",
      ],
      signs: ["Soil is fine and crumbly, not cloddy", "No standing water in the rows"],
    },
    {
      id: "planting",
      label: "At planting",
      weekFrom: 0,
      weekTo: 0,
      inputs: [
        "DAP (18-46-0): 50-60 kg per acre",
        "Certified seed treated with insecticide for the first-season cost",
      ],
      signs: ["Germination within 7 days", "Even spacing — about 25cm apart in rows"],
    },
    {
      id: "vegetative",
      label: "Vegetative (top-dress)",
      weekFrom: 4,
      weekTo: 5,
      inputs: [
        "CAN (23-23-0) or Urea: 50 kg per acre, buried just beside the row and covered",
        "First scout for armyworm and cutworm",
      ],
      signs: ["Leaves dark green and upright", "No pale yellowing between the veins (nitrogen short)"],
    },
    {
      id: "flowering",
      label: "Flowering and tasselling",
      weekFrom: 7,
      weekTo: 11,
      inputs: ["Second nitrogen split only if the first was skipped", "Scout for stalk borer"],
      signs: ["Tassel and silk emerge together", "Silk still green and wet"],
    },
    {
      id: "harvest",
      label: "Harvest",
      weekFrom: 16,
      weekTo: 20,
      inputs: ["Dry to below 14% moisture before storage", "Store in sealed bags off the floor"],
      signs: ["Husk dry and papery", "Black layer on the kernel base means it is ready"],
    },
  ],
};

const beans: CropTemplate = {
  id: "beans",
  name: "Beans (Common/Namo)",
  category: "legume",
  nutrientNeeds: { nitrogen: "Low (fixes its own)", phosphorus: "High", potassium: "Medium" },
  baseFertilizer: "DAP or TSP at planting — deliberately low or zero nitrogen",
  fertilizerReason:
    "Beans fix their own nitrogen through root nodules. Nitrogen fertiliser here suppresses nodulation, so the plant fixes less than it would have. Phosphorus is what beans are short of.",
  pests: [
    {
      problem: "Bean fly",
      signs: "Small maggots at the stem base; seedlings wilt despite wet soil.",
      control: "Drench the soil at emergence, or treat seed. Early planting often escapes it.",
    },
    {
      problem: "Aphids",
      signs: "Clusters of soft insects on undersides; leaves curl.",
      control: "Scout at flowering; beneficial insects usually clear light infestations.",
    },
    {
      problem: "Angular leaf spot",
      signs: "Grey-brown angular spots bounded by leaf veins.",
      control: "Copper-based fungicide, and rotate plots — it survives in crop residue.",
    },
  ],
  criticalTiming:
    "Do not apply nitrogen. It looks like help and costs you the nodules that were fixing nitrogen for free.",
  growthCycleDays: 90,
  harvestWindow: "About 3 months. Pick dry pods before they split.",
  stages: [
    {
      id: "land_prep",
      label: "Land preparation",
      weekFrom: null,
      weekTo: 0,
      inputs: ["Compost or well-rotted manure", "Do not apply fresh manure — it burns seed"],
      signs: ["Fine seedbed", "Soil drains, does not crust"],
    },
    {
      id: "planting",
      label: "At planting",
      weekFrom: 0,
      weekTo: 0,
      inputs: [
        "DAP or TSP: 50 kg per acre",
        "Treated or certified seed",
      ],
      signs: ["Germination in 5-7 days", "Roots develop visible pink nodules by day 10"],
    },
    {
      id: "vegetative",
      label: "Vegetative",
      weekFrom: 2,
      weekTo: 5,
      inputs: ["No nitrogen fertiliser", "Scout for bean fly at emergence"],
      signs: ["Deep green leaves", "Plenty of nodules on the roots"],
    },
    {
      id: "flowering",
      label: "Flowering and pod fill",
      weekFrom: 5,
      weekTo: 9,
      inputs: ["Foliar feed only if leaves are pale", "Scout for aphids and leaf spot"],
      signs: ["Flowers set into small pods", "No premature flower drop"],
    },
    {
      id: "harvest",
      label: "Harvest",
      weekFrom: 11,
      weekTo: 13,
      inputs: ["Pick as pods dry", "Dry on a raised surface before storage"],
      signs: ["Pods rattle when dry", "Leaves have dropped"],
    },
  ],
};

const tomatoes: CropTemplate = {
  id: "tomatoes",
  name: "Tomatoes",
  category: "fruit",
  nutrientNeeds: { nitrogen: "Medium", phosphorus: "High", potassium: "High" },
  baseFertilizer: "DAP at transplanting, then CAN top-dress at flowering",
  fertilizerReason:
    "Tomatoes fruit heavily and potassium is what builds fruit quality and disease resistance. Nitrogen after flowering pushes leaves at the expense of fruit.",
  pests: [
    {
      problem: "Early blight",
      signs: "Brown spots with concentric rings, starting on the lowest leaves.",
      control: "Copper or chlorothalonil from first symptom, and mulch to stop soil splash.",
    },
    {
      problem: "Late blight",
      signs: "Water-soaked grey-green patches; white fuzz underneath in the morning.",
      control:
        "Act the same day. This moves through a field in days and is the fastest way to lose a tomato crop.",
    },
    {
      problem: "Whitefly",
      signs: "Small white insects clouding when you brush the plant; sticky leaves.",
      control: "Yellow sticky traps, then neem or a labelled product. Also spreads viruses.",
    },
    {
      problem: "Tuta absoluta",
      signs: "Leaf mines with frass inside the tunnel; fruit gouged.",
      control: "Remove and destroy mined leaves, trap, and treat early.",
    },
  ],
  criticalTiming:
    "Stake and mulch early. Fruit touching soil rots, and soil splash is how blight reaches the leaves.",
  growthCycleDays: 100,
  harvestWindow: "Pick at the breaker stage — pinkish — for ripening off the plant.",
  stages: [
    {
      id: "land_prep",
      label: "Land preparation",
      weekFrom: null,
      weekTo: -1,
      inputs: [
        "Well-rotted manure: 4-6 tonnes per acre",
        " mulch material ready — maize stalks or grass, 5cm deep",
      ],
      signs: ["Soil tested if this is new ground", "No tomato family (potato, pepper) grown here in 3 years"],
    },
    {
      id: "planting",
      label: "At transplanting",
      weekFrom: 0,
      weekTo: 0,
      inputs: ["DAP: 60 kg per acre at transplant", "Transplant in the evening and water immediately"],
      signs: ["Plants hold up the next morning", "No wilting"],
    },
    {
      id: "vegetative",
      label: "Vegetative",
      weekFrom: 2,
      weekTo: 5,
      inputs: ["Stake or trellis", "Scout weekly for blight and whitefly", "CAN: 30 kg per acre if growth is weak"],
      signs: ["New growth dark green", "Lower leaves healthy"],
    },
    {
      id: "flowering",
      label: "Flowering and fruit set",
      weekFrom: 6,
      weekTo: 10,
      inputs: [
        "CAN top-dress: 50 kg per acre — potassium matters most now",
        "Do not wet the leaves in the afternoon; blight loves wet foliage overnight",
      ],
      signs: ["Flowers set into small fruit", "No blossom end rot (a calcium sign of uneven watering)"],
    },
    {
      id: "harvest",
      label: "Harvest",
      weekFrom: 10,
      weekTo: 14,
      inputs: ["Pick every 3-5 days once picking starts", "Water evenly — swings split the fruit"],
      signs: ["Fruit at breaker stage", "Continuous picking keeps the plant yielding"],
    },
  ],
};

const kale: CropTemplate = {
  id: "kale",
  name: "Kale (Sukuma Wiki)",
  category: "vegetable",
  nutrientNeeds: { nitrogen: "High", phosphorus: "Medium", potassium: "High" },
  baseFertilizer: "DAP at transplanting plus repeated CAN top-dressings",
  fertilizerReason:
    "Kale is a leaf crop, so nitrogen is the whole game. Unlike beans, there are no nodules doing the work.",
  pests: [
    {
      problem: "Diamondback moth",
      signs: "Small holes in a window-pane pattern; caterpillars that wriggle backwards.",
      control: "Scout every week; treat on the young larvae.",
    },
    {
      problem: "Aphids",
      signs: "Curled yellow leaves with clusters underneath.",
      control: "Neem or a labelled insecticide; natural enemies often clear it if you wait.",
    },
    {
      problem: "Black rot",
      signs: "V-shaped yellow lesions from the leaf edge; black veins.",
      control: "Rotate, and avoid working the field when wet — it spreads on your hands and tools.",
    },
  ],
  criticalTiming:
    "Harvest the centre leaves and leave the side ones. Cutting the whole head ends the plant.",
  growthCycleDays: 60,
  harvestWindow: "First leaves at 6 weeks, then pick weekly for 3-4 months.",
  stages: [
    {
      id: "land_prep",
      label: "Land preparation",
      weekFrom: null,
      weekTo: -1,
      inputs: ["Manure: 4 tonnes per acre", "Lime if the soil is acidic"],
      signs: ["Soil tilth good", "No clubroot in the last 3 years"],
    },
    {
      id: "planting",
      label: "At transplanting",
      weekFrom: 0,
      weekTo: 0,
      inputs: ["DAP: 60 kg per acre", "Transplants 15-20cm tall, roots not bent"],
      signs: ["Established in 5 days", "Upright growth"],
    },
    {
      id: "vegetative",
      label: "Vegetative",
      weekFrom: 2,
      weekTo: 6,
      inputs: [
        "CAN: 50 kg per acre at 4 weeks — kale is hungry for nitrogen",
        "Scout weekly for diamondback moth",
      ],
      signs: ["Large dark green leaves", "No holes in the leaf centres"],
    },
    {
      id: "flowering",
      label: "Harvest",
      weekFrom: 6,
      weekTo: 24,
      inputs: [
        "Continue CAN every 6 weeks while picking",
        "Pick the centre leaves only, always leave side shoots",
      ],
      signs: ["Regrows within a week", "No bolting yet — bolting means heat or stress"],
    },
  ],
};

const potatoes: CropTemplate = {
  id: "potatoes",
  name: "Potatoes",
  category: "root",
  nutrientNeeds: { nitrogen: "Medium", phosphorus: "High", potassium: "Very high" },
  baseFertilizer: "DAP at planting, then heavy potassium — CAN is the wrong fertiliser here",
  fertilizerReason:
    "Potatoes are the highest potassium crop in most smallholder gardens. Too much nitrogen gives big plants and small, starchy tubers.",
  pests: [
    {
      problem: "Late blight",
      signs: "Dark lesions on leaf tips with white growth underneath; rapid collapse.",
      control: "Remove and destroy affected plants the same day, then protect the rest with a fungicide.",
    },
    {
      problem: "Potato tuber moth",
      signs: "Mined leaves and tuber damage; pinkish discolouration in stored tubers.",
      control: "Hill soil over the crop, and never store an open pile.",
    },
    {
      problem: "Nematodes",
      signs: "Plants patchy and stunted; small knobbly tubers.",
      control: "Rotate away from solanums for 3 years. There is no rescue mid-season.",
    },
  ],
  criticalTiming:
    "Earth up at 5-6 weeks. Tubers exposed to light turn green and become toxic.",
  growthCycleDays: 110,
  harvestWindow: "About 3.5-4 months, when the tops die back.",
  stages: [
    {
      id: "land_prep",
      label: "Land preparation",
      weekFrom: null,
      weekTo: -1,
      inputs: [
        "Manure: 6-8 tonnes per acre",
        "Never plant after tomato, pepper or potato in the same 3 years",
      ],
      signs: ["Deeply worked soil", "Seed potatoes certified and sprouted"],
    },
    {
      id: "planting",
      label: "At planting",
      weekFrom: 0,
      weekTo: 0,
      inputs: [
        "DAP: 100 kg per acre",
        "Sprouted seed potatoes, 25-30cm apart",
      ],
      signs: ["Emerged in 2-3 weeks", "Strong stems"],
    },
    {
      id: "vegetative",
      label: "Vegetative and tuber bulking",
      weekFrom: 3,
      weekTo: 8,
      inputs: [
        "Earth up at 5-6 weeks — cover the tubers",
        "Potash, not CAN, if the leaves look pale at tuber bulking",
        "Scout weekly for blight",
      ],
      signs: ["Flowers appearing", "Plants 40-60cm tall"],
    },
    {
      id: "harvest",
      label: "Harvest",
      weekFrom: 12,
      weekTo: 16,
      inputs: ["Harvest in dry soil — wet soil carries disease into storage", "Store dark at 4-8C"],
      signs: ["Tops dead back", "Skin rub-off when rubbed with a thumb"],
    },
  ],
};

const onions: CropTemplate = {
  id: "onions",
  name: "Onions",
  category: "vegetable",
  nutrientNeeds: { nitrogen: "High", phosphorus: "Medium", potassium: "High" },
  baseFertilizer: "DAP at transplanting plus CAN top-dressing early",
  fertilizerReason:
    "Onion has a shallow root system and cannot hold much nitrogen at once, so it is fed in small frequent splits rather than one big dose.",
  pests: [
    {
      problem: "Thrips",
      signs: "Silvery streaks on leaves; curled tips.",
      control: "Scout from early growth; a field-wide treatment is rarely justified.",
    },
    {
      problem: "Purple blotch",
      signs: "White sunken lesions that turn purple, on leaves and bulbs.",
      control: "Copper or chlorothalonil; dry weather between leaf wetness and harvest reduces it.",
    },
    {
      problem: "Onion fly",
      signs: "Wilting plants; small maggots at the bulb base.",
      control: "Remove affected plants; rotate out of onion for 3 years.",
    },
  ],
  criticalTiming:
    "Stop nitrogen once bulbs start swelling. Late nitrogen makes thick necks that rot in storage.",
  growthCycleDays: 100,
  harvestWindow: "About 3.5 months, when 30% of the tops have fallen over.",
  stages: [
    {
      id: "land_prep",
      label: "Land preparation",
      weekFrom: null,
      weekTo: -1,
      inputs: ["Well-rotted manure", "Fine firm seedbed — onions need a clean, level bed"],
      signs: ["Soil fine enough to hold a rake mark", "No large clods"],
    },
    {
      id: "planting",
      label: "At transplanting",
      weekFrom: 0,
      weekTo: 0,
      inputs: ["DAP: 60 kg per acre", "Sets or transplanted seedlings 10cm apart"],
      signs: ["Established in a week", "Leaves standing up"],
    },
    {
      id: "vegetative",
      label: "Vegetative",
      weekFrom: 3,
      weekTo: 8,
      inputs: [
        "CAN in 2-3 small splits, 25 kg per acre each — never one large dose",
        "Scout for thrips from week 4",
      ],
      signs: ["Tube thickens at the base", "Leaves upright and dark"],
    },
    {
      id: "flowering",
      label: "Bulb swelling",
      weekFrom: 9,
      weekTo: 13,
      inputs: ["STOP nitrogen", "Irrigation only as needed; excess water gives thick necks"],
      signs: ["Neck begins to swell", "Leaves starting to fall"],
    },
    {
      id: "harvest",
      label: "Harvest",
      weekFrom: 14,
      weekTo: 16,
      inputs: ["Pull and dry in the field for 2-3 days", "Cure 2-3 weeks before storing"],
      signs: ["Necks dry and papery", "Skin rustles"],
    },
  ],
};

export const cropTemplates: Record<string, CropTemplate> = {
  maize,
  beans,
  tomatoes,
  kale,
  potatoes,
  onions,
};

/** Synonyms farmers actually type, mapped onto the canonical id. */
const CROP_ALIASES: Record<string, string> = {
  maize: "maize",
  corn: "maize",
  "maize ": "maize",
  "muhindi": "maize",
  beans: "beans",
  bean: "beans",
  "common bean": "beans",
  "common beans": "beans",
  "rojo": "beans",
  namo: "beans",
  "cow peas": "beans",
  tomatoes: "tomatoes",
  tomato: "tomatoes",
  "nyanya": "tomatoes",
  kale: "kale",
  "sukuma wiki": "kale",
  "sukumawiki": "kale",
  potatoes: "potatoes",
  potato: "potatoes",
  "viazi": "potatoes",
  onions: "onions",
  onion: "onions",
  "vitu": "onions",
  "kitunguu": "onions",
};

/** Normalise and resolve a crop name the farmer typed. */
export function normaliseCropType(cropType: string | null | undefined): string | null {
  const raw = (cropType || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return null;
  if (cropTemplates[raw]) return raw;
  if (CROP_ALIASES[raw]) return CROP_ALIASES[raw];
  // Try a substring pass for things like "Tomatoes (Anna F1)".
  for (const [alias, id] of Object.entries(CROP_ALIASES)) {
    if (raw.includes(alias)) return id;
  }
  return null;
}

/**
 * The guidance for a crop, or null when we do not recognise it.
 *
 * Null rather than a default crop, for the same reason animals do: a farmer
 * growing tomatoes must never be handed maize instructions.
 */
export function getCropTemplate(cropType: string | null | undefined): CropTemplate | null {
  const id = normaliseCropType(cropType);
  return id ? cropTemplates[id] : null;
}

/** Which stage a crop is in right now, from its planting date. */
export function currentStage(
  crop: CropTemplate,
  plantingDate: string | Date | null | undefined
): CropStage | null {
  if (!plantingDate) return null;
  const planted = plantingDate instanceof Date ? plantingDate : new Date(plantingDate);
  if (Number.isNaN(planted.getTime())) return null;
  const weeks = Math.floor((Date.now() - planted.getTime()) / (7 * 86400000));

  for (const stage of crop.stages) {
    if (stage.weekFrom === null) continue;
    const to = stage.weekTo === null ? Infinity : stage.weekTo;
    if (weeks >= stage.weekFrom && weeks <= to) return stage;
  }
  // Past the last stage.
  return crop.stages[crop.stages.length - 1] ?? null;
}

/** Every crop this module can advise on, for pickers. */
export function getAllCrops(): CropTemplate[] {
  return Object.values(cropTemplates);
}