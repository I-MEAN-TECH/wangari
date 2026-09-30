import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

/**
 * Season Planner — the "step one, made explicit".
 *
 * For every active crop the farm has registered, compute its life-cycle
 * stages from the planting date using Kenya agro templates, mark which
 * stage it's in TODAY, and return the full calendar. Optionally
 * (POST) pre-create reminders for upcoming stages as WorkerTasks.
 *
 * No new data entry required: everything derives from Crop.plantingDate,
 * cropType, and isPerennial which the farmer already set when registering.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

interface Stage {
  name: string;
  icon: string;
  startDay: number; // days after planting
  endDay: number;
  tasks: string[];
}

// Kenya field-management templates by crop family (days after planting).
// Annual crops run seed -> harvest; perennials show the recurring year cycle.
const ANNUAL_TEMPLATES: Record<string, Stage[]> = {
  maize: [
    { name: "Land preparation", icon: "🚜", startDay: -21, endDay: 0, tasks: ["Plough & harrow", "Dig holes 75×25cm", "Buy certified seed & basal fertilizer"] },
    { name: "Planting", icon: "🌱", startDay: 0, endDay: 7, tasks: ["Plant at first rains", "One seed per hole, DAP mixed with soil"] },
    { name: "Early growth", icon: "🌿", startDay: 7, endDay: 30, tasks: ["First weeding at week 3", "Scout for fall armyworm weekly"] },
    { name: "Top-dressing", icon: "🧪", startDay: 30, endDay: 45, tasks: ["CAN top-dress at knee-high — the money moment", "Second weeding"] },
    { name: "Tasseling & grain fill", icon: "🌽", startDay: 60, endDay: 100, tasks: ["Second CAN for long-season varieties", "Watch for stalk borer"] },
    { name: "Drying & harvest", icon: "🧺", startDay: 120, endDay: 150, tasks: ["Line up buyers BEFORE harvest", "Dry to 13% moisture", "Treat & store hermetically (aflatoxin)"] },
  ],
  beans: [
    { name: "Land preparation", icon: "🚜", startDay: -14, endDay: 0, tasks: ["Prepare seedbed", "Buy certified seed"] },
    { name: "Planting", icon: "🌱", startDay: 0, endDay: 5, tasks: ["45×15cm, 2 seeds/hole", "Intercrop with maize if planned"] },
    { name: "Vegetative growth", icon: "🌿", startDay: 5, endDay: 40, tasks: ["Weed at week 2-3", "Scout for bean rust & aphids"] },
    { name: "Flowering & podding", icon: "🌸", startDay: 40, endDay: 65, tasks: ["Avoid evening irrigation (rust)", "Top-dress lightly if pale"] },
    { name: "Harvest", icon: "🧺", startDay: 65, endDay: 90, tasks: ["Harvest at 80% pod dry — before shatter", "Dry on tarpaulins, never bare soil"] },
  ],
  tomato: [
    { name: "Nursery", icon: "🌾", startDay: -35, endDay: 0, tasks: ["Raise seedlings 4-6 weeks", "Prepare main field & stakes"] },
    { name: "Transplanting", icon: "🌱", startDay: 0, endDay: 7, tasks: ["Transplant 60×60cm", "Stake at transplanting — never later"] },
    { name: "Vegetative & pruning", icon: "🌿", startDay: 7, endDay: 45, tasks: ["Prune suckers weekly", "Water soil, never leaves"] },
    { name: "Flowering & fruit set", icon: "🌸", startDay: 45, endDay: 70, tasks: ["Preventive blight spray before humid spells", "Consistent watering — cracks come from irregular water"] },
    { name: "Harvest window", icon: "🍅", startDay: 70, endDay: 120, tasks: ["Pick at breaker for market, ripe for local", "Grade Fancy/Standard/Reject — grade pays 40-60% more"] },
  ],
  onion: [
    { name: "Nursery", icon: "🌾", startDay: -50, endDay: 0, tasks: ["Raise seedlings 6-8 weeks"] },
    { name: "Transplanting", icon: "🌱", startDay: 0, endDay: 7, tasks: ["Transplant at pencil thickness, 10×20cm", "Basal manure + DAP"] },
    { name: "Bulbing", icon: "🧅", startDay: 7, endDay: 90, tasks: ["CAN top-dress at weeks 3 & 6", "Constant moisture + ZERO weeds", "Thrips watch in dry spells"] },
    { name: "Curing", icon: "☀️", startDay: 90, endDay: 105, tasks: ["Stop watering as tops fall", "Cure 10-14 days until necks tight"] },
    { name: "Storage & sale", icon: "💰", startDay: 105, endDay: 200, tasks: ["Store ventilated, off concrete", "Hold for the Apr-Jun price peak if cured well"] },
  ],
  potato: [
    { name: "Land preparation", icon: "🚜", startDay: -14, endDay: 0, tasks: ["Certified Shangi seed, sprouted", "Ridge deeply"] },
    { name: "Planting", icon: "🌱", startDay: 0, endDay: 5, tasks: ["Plant on ridges, DAP in furrow"] },
    { name: "Earthing up", icon: "⛰️", startDay: 21, endDay: 40, tasks: ["Earth up at 20cm — tubers green if exposed", "Late blight prevention in humid weeks"] },
    { name: "Tuber fill", icon: "🥔", startDay: 40, endDay: 75, tasks: ["Consistent moisture", "Second blight spray window"] },
    { name: "Harvest", icon: "🧺", startDay: 90, endDay: 120, tasks: ["Harvest when haulm dies", "Cure 1-2 weeks before bagging"] },
  ],
  watermelon: [
    { name: "Land preparation", icon: "🚜", startDay: -10, endDay: 0, tasks: ["Holes with compost", "Buy Sukari F1 or Crimson Sweet"] },
    { name: "Planting", icon: "🌱", startDay: 0, endDay: 5, tasks: ["Direct seed 3m×1m", "2 seeds/hole, thin to 1"] },
    { name: "Vine growth", icon: "🌿", startDay: 5, endDay: 40, tasks: ["Deep, infrequent watering", "Powdery mildew watch"] },
    { name: "Fruit set", icon: "🍉", startDay: 40, endDay: 70, tasks: ["Bees pollinate — 1 hive/2 acres helps", "Cut watering as fruit ripens"] },
    { name: "Harvest", icon: "🧺", startDay: 80, endDay: 95, tasks: ["Tendril brown + yellow ground spot = ripe", "Time to market gluts — check who else is planting"] },
  ],
  cabbage: [
    { name: "Nursery", icon: "🌾", startDay: -30, endDay: 0, tasks: ["Raise seedlings 4-5 weeks"] },
    { name: "Transplanting", icon: "🌱", startDay: 0, endDay: 7, tasks: ["60×45cm", "Basal manure"] },
    { name: "Heading", icon: "🥬", startDay: 7, endDay: 60, tasks: ["CAN top-dress at 3 weeks", "Diamondback moth scouting"] },
    { name: "Harvest", icon: "🧺", startDay: 70, endDay: 100, tasks: ["Cut firm heads, 2 wrapper leaves", "Stagger plantings for weekly income"] },
  ],
  kale: [
    { name: "Nursery", icon: "🌾", startDay: -30, endDay: 0, tasks: ["Raise seedlings 4-6 weeks"] },
    { name: "Transplanting", icon: "🌱", startDay: 0, endDay: 7, tasks: ["30×45cm or double rows on beds"] },
    { name: "Picking phase", icon: "🥬", startDay: 35, endDay: 200, tasks: ["First picking ~5 weeks", "Weekly CAN top-dress after each heavy pick", "Aphid & powdery mildew watch"] },
  ],
};

// Perennial year-cycle (days are within a production year; year 1 = establishment)
const PERENNIAL_TEMPLATES: Record<string, { maturityYears: number; stages: Stage[] }> = {
  avocado: {
    maturityYears: 3,
    stages: [
      { name: "Establishment (year 1-2)", icon: "🌱", startDay: 0, endDay: 365, tasks: ["Water 25-50L/week", "Mulch, keep 1m weed-free ring", "Protect from frost"] },
      { name: "Pre-flowering feed", icon: "🧪", startDay: 300, endDay: 330, tasks: ["NPK 17-17-17 before flowering", "Prune to open canopy"] },
      { name: "Flowering", icon: "🌸", startDay: 330, endDay: 380, tasks: ["Light irrigation during bloom", "Bee hives improve set — 2/ha"] },
      { name: "Fruit set & fill", icon: "🥑", startDay: 380, endDay: 480, tasks: ["CAN + potassium nitrate at set", "Fruit-fly programme starts 6-8 weeks pre-harvest"] },
      { name: "Harvest window", icon: "🧺", startDay: 480, endDay: 545, tasks: ["24% dry matter minimum for export", "Register with KEPHIS for export blocks", "Cut with 3cm stalk"] },
    ],
  },
  mango: {
    maturityYears: 4,
    stages: [
      { name: "Establishment (year 1-3)", icon: "🌱", startDay: 0, endDay: 365, tasks: ["Weekly watering years 1-2", "Intercrop with beans/kales"] },
      { name: "Post-harvest prune & feed", icon: "✂️", startDay: 300, endDay: 330, tasks: ["Prune after harvest: open centre", "Manure + NPK"] },
      { name: "Flowering", icon: "🌸", startDay: 330, endDay: 390, tasks: ["Dry stress induces bloom in dry zones", "Anthracnose prevention spray"] },
      { name: "Fruit fill", icon: "🥭", startDay: 390, endDay: 460, tasks: ["MAT traps + protein bait sprays", "Sanitation: bury fallen fruit weekly"] },
      { name: "Harvest", icon: "🧺", startDay: 460, endDay: 530, tasks: ["Half-mature for export, tree-ripe local", "De-sap upside-down to avoid sap burn"] },
    ],
  },
};

const PERENNIAL_KEYS = ["avocado", "macadamia", "mango", "citrus", "passion", "banana", "papaya", "coffee", "tea"];

function templateFor(cropType: string, isPerennial: boolean): { stages: Stage[]; kind: "annual" | "perennial" } | null {
  const key = cropType.toLowerCase();
  if (PERENNIAL_KEYS.some(p => key.includes(p))) {
    const t = PERENNIAL_TEMPLATES[key] || PERENNIAL_TEMPLATES.avocado;
    return { stages: t.stages, kind: "perennial" };
  }
  for (const [k, stages] of Object.entries(ANNUAL_TEMPLATES)) {
    if (key.includes(k)) return { stages, kind: "annual" };
  }
  // Generic annual fallback
  return {
    kind: "annual",
    stages: [
      { name: "Land preparation", icon: "🚜", startDay: -21, endDay: 0, tasks: ["Clear, plough, harrow", "Source certified seed/seedlings"] },
      { name: "Planting", icon: "🌱", startDay: 0, endDay: 7, tasks: ["Plant at onset of rains"] },
      { name: "Growth & care", icon: "🌿", startDay: 7, endDay: 60, tasks: ["Weed at weeks 3 & 6", "Top-dress as needed"] },
      { name: "Harvest", icon: "🧺", startDay: 90, endDay: 150, tasks: ["Line up buyers before harvest"] },
    ],
  };
}

// GET /api/crops/planner — calendar for every active crop
router.get("/planner", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const now = new Date();

    const crops = await prisma.crop.findMany({
      where: { farmId, status: "active" },
      orderBy: { plantingDate: "asc" },
    });

    const plans = crops.map((crop) => {
      const tpl = templateFor(crop.cropType, crop.isPerennial);
      if (!tpl || !crop.plantingDate) {
        return { cropId: crop.id, name: crop.name, cropType: crop.cropType, daysSincePlanting: null, currentStage: null, stages: [], hasTemplate: false };
      }
      const planting = new Date(crop.plantingDate);
      const daysSince = Math.floor((now.getTime() - planting.getTime()) / 86400000);

      // For perennials, project the current year-cycle date
      const effectiveDay = tpl.kind === "perennial"
        ? daysSince % 365 // position in the recurring year
        : daysSince;

      const stages = tpl.stages.map((s) => {
        const startDate = new Date(planting.getTime() + s.startDay * 86400000);
        const endDate = new Date(planting.getTime() + s.endDay * 86400000);
        const state = now < startDate ? "upcoming" : now <= endDate ? "current" : "done";
        return { ...s, startDate: startDate.toISOString(), endDate: endDate.toISOString(), state };
      });
      const currentStage = stages.find((s) => s.state === "current") || null;
      const nextStage = stages.find((s) => s.state === "upcoming") || null;

      return {
        cropId: crop.id,
        name: crop.name,
        cropType: crop.cropType,
        variety: crop.variety,
        areaAcres: crop.areaAcres ? Number(crop.areaAcres) : null,
        plantingDate: planting.toISOString(),
        daysSincePlanting: daysSince,
        kind: tpl.kind,
        currentStage,
        nextStage,
        stages,
        hasTemplate: true,
      };
    });

    res.json({ plans, generatedAt: now.toISOString() });
  } catch (error) {
    console.error("Planner error:", error);
    res.status(500).json({ error: "Failed to build the season plan" });
  }
});

// POST /api/crops/planner/:cropId/reminders — create tasks for upcoming stage work
router.post("/planner/:cropId/reminders", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const cropId = Number(req.params.cropId);
    const crop = await prisma.crop.findFirst({ where: { id: cropId, farmId } });
    if (!crop) return res.status(404).json({ error: "Crop not found" });
    if (!crop.plantingDate) return res.status(400).json({ error: "Set a planting date first" });

    const tpl = templateFor(crop.cropType, crop.isPerennial);
    if (!tpl) return res.status(400).json({ error: "No template for this crop" });

    const now = new Date();
    const planting = new Date(crop.plantingDate);
    // Only create reminders for stages starting within the next 60 days
    const horizon = new Date(now.getTime() + 60 * 86400000);
    const created: string[] = [];

    for (const s of tpl.stages) {
      const startDate = new Date(planting.getTime() + s.startDay * 86400000);
      if (startDate > now && startDate <= horizon) {
        const due = new Date(startDate);
        const task = await prisma.workerTask.create({
          data: {
            farmId,
            workerId: null,
            title: `${s.icon} ${crop.name}: ${s.name}`,
            description: s.tasks.join(" • "),
            category: "crop",
            dueDate: due,
          },
        });
        created.push(task.title);
      }
    }

    res.json({ ok: true, created, count: created.length });
  } catch (error) {
    console.error("Planner reminders error:", error);
    res.status(500).json({ error: "Failed to create reminders" });
  }
});

export default router;
