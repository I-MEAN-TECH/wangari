export interface FeedRecipePreset {
  id: string;
  name: string;
  category: "poultry" | "dairy" | "beef" | "pigs" | "goats" | "fish";
  targetProtein: number;
  ingredients: { name: string; percentage: number; costPerKg: number }[];
  description: string;
}

export const PRESET_FEED_RECIPES: FeedRecipePreset[] = [
  {
    id: "chick-mash",
    name: "Chick Starter Mash (0-8 Weeks)",
    category: "poultry",
    targetProtein: 20,
    ingredients: [
      { name: "Whole Maize", percentage: 45, costPerKg: 45 },
      { name: "Wheat Pollard", percentage: 15, costPerKg: 35 },
      { name: "Soya Bean Meal", percentage: 22, costPerKg: 95 },
      { name: "Fish Meal (Omena)", percentage: 10, costPerKg: 130 },
      { name: "Lime / Calcium", percentage: 5, costPerKg: 20 },
      { name: "Vitamin & Mineral Premix", percentage: 3, costPerKg: 350 },
    ],
    description: "High-protein starter feed for young chicks during the first 8 weeks.",
  },
  {
    id: "layer-mash",
    name: "Layer Mash (High Laying Yield)",
    category: "poultry",
    targetProtein: 16.5,
    ingredients: [
      { name: "Whole Maize / Maize Germ", percentage: 50, costPerKg: 42 },
      { name: "Wheat Bran / Pollard", percentage: 18, costPerKg: 32 },
      { name: "Soya Bean Meal", percentage: 14, costPerKg: 95 },
      { name: "Sunflower Cake", percentage: 8, costPerKg: 55 },
      { name: "Limestone Grit / DCP", percentage: 8, costPerKg: 25 },
      { name: "Layer Premix & Salt", percentage: 2, costPerKg: 300 },
    ],
    description: "Formulated for high egg production and strong eggshell quality.",
  },
  {
    id: "kienyeji-mash",
    name: "Improved Kienyeji Feed Mix",
    category: "poultry",
    targetProtein: 17,
    ingredients: [
      { name: "Cracked Maize", percentage: 52, costPerKg: 40 },
      { name: "Wheat Pollard", percentage: 20, costPerKg: 34 },
      { name: "Cottonseed Cake / Soya", percentage: 15, costPerKg: 75 },
      { name: "Omena Meal", percentage: 6, costPerKg: 130 },
      { name: "Bone Meal / DCP", percentage: 5, costPerKg: 30 },
      { name: "Premix", percentage: 2, costPerKg: 300 },
    ],
    description: "Economical semi-intensive feed recipe for indigenous & dual-purpose breeds.",
  },
  {
    id: "high-yield-dairy-meal",
    name: "High-Yield Dairy Concentrate (18% Protein)",
    category: "dairy",
    targetProtein: 18,
    ingredients: [
      { name: "Maize Germ", percentage: 38, costPerKg: 38 },
      { name: "Wheat Bran", percentage: 25, costPerKg: 30 },
      { name: "Cottonseed Cake", percentage: 18, costPerKg: 70 },
      { name: "Soya Meal", percentage: 10, costPerKg: 95 },
      { name: "Dairy Mineral Salts", percentage: 5, costPerKg: 180 },
      { name: "Molasses / Binder", percentage: 4, costPerKg: 40 },
    ],
    description: "Boosts daily milk production in lactating dairy cows.",
  },
  {
    id: "beef-fattening",
    name: "Beef Fattening Ration (12% Protein)",
    category: "beef",
    targetProtein: 12,
    ingredients: [
      { name: "Whole Maize (cracked)", percentage: 55, costPerKg: 40 },
      { name: "Maize Germ / Bran", percentage: 15, costPerKg: 30 },
      { name: "Cottonseed Cake", percentage: 15, costPerKg: 70 },
      { name: "Molasses", percentage: 8, costPerKg: 45 },
      { name: "Mineral Lick / Salt", percentage: 4, costPerKg: 150 },
      { name: "Limestone / DCP", percentage: 3, costPerKg: 25 },
    ],
    description: "Energy-dense finishing ration for beef cattle — target 1kg+ daily gain.",
  },
  {
    id: "goat-concentrate",
    name: "Goat Concentrate (16% Protein)",
    category: "goats",
    targetProtein: 16,
    ingredients: [
      { name: "Cracked Maize", percentage: 45, costPerKg: 40 },
      { name: "Wheat Bran", percentage: 22, costPerKg: 32 },
      { name: "Cottonseed Cake", percentage: 18, costPerKg: 70 },
      { name: "Molasses", percentage: 8, costPerKg: 45 },
      { name: "Goat Mineral Premix", percentage: 4, costPerKg: 200 },
      { name: "Salt", percentage: 3, costPerKg: 60 },
    ],
    description: "Supplement concentrate for intensively-raised goats — feed alongside browse and hay.",
  },
  {
    id: "pig-finisher",
    name: "Pig Finisher Feed (14% Protein)",
    category: "pigs",
    targetProtein: 14,
    ingredients: [
      { name: "Whole Maize", percentage: 55, costPerKg: 40 },
      { name: "Wheat Pollard", percentage: 18, costPerKg: 33 },
      { name: "Soya Bean Meal", percentage: 16, costPerKg: 95 },
      { name: "Fish Meal (Omena)", percentage: 4, costPerKg: 130 },
      { name: "Limestone", percentage: 3, costPerKg: 20 },
      { name: "Pig Premix & Salt", percentage: 4, costPerKg: 300 },
    ],
    description: "Balanced finisher for pigs from 60kg to market weight.",
  },
  {
    id: "fish-feed",
    name: "Fish Grower Pellets (28% Protein)",
    category: "fish",
    targetProtein: 28,
    ingredients: [
      { name: "Maize Bran", percentage: 30, costPerKg: 28 },
      { name: "Wheat Bran", percentage: 22, costPerKg: 32 },
      { name: "Omena / Fish Meal", percentage: 25, costPerKg: 130 },
      { name: "Soya Bean Meal", percentage: 15, costPerKg: 95 },
      { name: "Vitamin Premix", percentage: 4, costPerKg: 400 },
      { name: "Binder", percentage: 4, costPerKg: 80 },
    ],
    description: "Protein-rich grower feed for tilapia and catfish ponds — feed at 2-5% of body weight.",
  },
];
