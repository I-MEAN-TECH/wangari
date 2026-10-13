/**
 * Automated Crop Growth Stage Schedules (inspired by ERPNext's Crop Cycle task
 * templates, adapted to Kenya smallholder agronomy & low-literacy UX).
 *
 * Translates planting date into plain-language, actionable stage alerts and tasks.
 * Pure library: reads crop type and planting date, returns current milestones.
 */

export interface CropStageMilestone {
  stageKey: string;
  title: string;
  dayOffset: number; // Days after planting date
  category: "weeding" | "fertilizer" | "pest_control" | "harvest_prep" | "general";
  detail: string;
  priority: "critical" | "high" | "medium" | "info";
  moneyImpact?: string;
  cta: string;
}

export interface ActiveCropMilestone {
  stageKey: string;
  cropId: number;
  cropName: string;
  title: string;
  detail: string;
  dueDate: Date;
  daysDiff: number; // negative = days overdue, 0 = today, positive = days in future
  isOverdue: boolean;
  priority: "critical" | "high" | "medium" | "info";
  moneyImpact?: string;
  cta: string;
  category: string;
}

const CROP_TEMPLATES: Record<string, CropStageMilestone[]> = {
  maize: [
    {
      stageKey: "maize-germination",
      title: "Check germination (Kukagua uotaji)",
      dayOffset: 7,
      category: "general",
      detail: "Count sprouted spots. If emergence is patchy, gap up (fill empty hills) this week.",
      priority: "medium",
      cta: "Check crop",
    },
    {
      stageKey: "maize-weeding-1",
      title: "1st Weeding due (Palizi ya kwanza)",
      dayOffset: 14,
      category: "weeding",
      detail: "Weeds in the first 4 weeks steal 30-50% of your crop's final yield. Clear early.",
      priority: "high",
      moneyImpact: "Prevents early yield loss",
      cta: "Record weeding",
    },
    {
      stageKey: "maize-top-dressing",
      title: "Top dressing CAN due (Mbolea ya kukuzia)",
      dayOffset: 28,
      category: "fertilizer",
      detail: "Maize is knee-high. Apply CAN along the rows before rains so roots take it up.",
      priority: "high",
      moneyImpact: "+20-30% bag yield with timely CAN",
      cta: "Record fertilizer",
    },
    {
      stageKey: "maize-pest-scout",
      title: "Scout Fall Armyworm (Kukagua funza)",
      dayOffset: 45,
      category: "pest_control",
      detail: "Inspect 20 random plant whorls for fresh frass (sawdust) or windowed leaves.",
      priority: "medium",
      cta: "Log pest check",
    },
    {
      stageKey: "maize-weeding-2",
      title: "2nd Weeding due (Palizi ya pili)",
      dayOffset: 60,
      category: "weeding",
      detail: "Tasselling stage. Clear tall weeds so light and moisture feed the developing cob.",
      priority: "medium",
      cta: "Record weeding",
    },
    {
      stageKey: "maize-harvest-prep",
      title: "Prepare harvest & storage (Maandalizi ya mavuno)",
      dayOffset: 115,
      category: "harvest_prep",
      detail: "Check cob drooping and dry husk color. Clean cribs, line up hermetic bags or buyers now.",
      priority: "high",
      moneyImpact: "Avoid post-harvest rot",
      cta: "Plan harvest",
    },
  ],
  beans: [
    {
      stageKey: "beans-weeding-1",
      title: "1st Weeding due (Kupalilia maharagwe)",
      dayOffset: 14,
      category: "weeding",
      detail: "Shallow weeding: bean roots sit near the surface. Avoid pulling soil away from stems.",
      priority: "high",
      cta: "Record weeding",
    },
    {
      stageKey: "beans-pest-scout",
      title: "Scout bean fly & aphids (Wadudu)",
      dayOffset: 25,
      category: "pest_control",
      detail: "Check lower leaves and stems for yellowing or wilt from bean fly maggot feeding.",
      priority: "medium",
      cta: "Log pest check",
    },
    {
      stageKey: "beans-flowering",
      title: "Flowering stage — do NOT spray insecticides",
      dayOffset: 40,
      category: "general",
      detail: "Bees are pollinating bean flowers. Insecticides during peak bloom destroy pod set.",
      priority: "high",
      cta: "View crop",
    },
    {
      stageKey: "beans-harvest-prep",
      title: "Harvest window (Kuvuna maharagwe)",
      dayOffset: 75,
      category: "harvest_prep",
      detail: "Harvest when lower pods turn tan/yellow. Dry promptly on clean tarpaulins.",
      priority: "high",
      cta: "Record harvest",
    },
  ],
  potatoes: [
    {
      stageKey: "potato-weeding",
      title: "1st Weeding & Sprouting check",
      dayOffset: 14,
      category: "weeding",
      detail: "Remove weeds before canopy closure so tuber development is unhindered.",
      priority: "medium",
      cta: "Record weeding",
    },
    {
      stageKey: "potato-earthing-1",
      title: "1st Earthing Up (Kuinua udongo)",
      dayOffset: 28,
      category: "general",
      detail: "Build mounds around potato stems to cover young tubers from sunlight (greening) and blight.",
      priority: "high",
      moneyImpact: "Prevents green tubers",
      cta: "Mark earthing done",
    },
    {
      stageKey: "potato-blight-scout",
      title: "Late Blight inspection (Kukagua blight)",
      dayOffset: 45,
      category: "pest_control",
      detail: "Inspect leaf tips and margins for water-soaked brown lesions, especially in cool humid weather.",
      priority: "high",
      cta: "Log disease check",
    },
    {
      stageKey: "potato-earthing-2",
      title: "2nd Earthing Up & Flower stage",
      dayOffset: 56,
      category: "general",
      detail: "Final mound building. Ensure no tubers protrude.",
      priority: "medium",
      cta: "Mark earthing done",
    },
    {
      stageKey: "potato-harvest-prep",
      title: "De-haulm & harvest prep (Kuvuna viazi)",
      dayOffset: 90,
      category: "harvest_prep",
      detail: "Cut potato vines 10 days before lifting to allow potato skins to harden for storage.",
      priority: "high",
      cta: "Plan harvest",
    },
  ],
  tomatoes: [
    {
      stageKey: "tomato-staking",
      title: "Staking & Trellising due (Kufunga kamba)",
      dayOffset: 10,
      category: "general",
      detail: "Stake tomato vines off the damp ground to cut leaf blight and fruit rot by half.",
      priority: "high",
      cta: "View crop",
    },
    {
      stageKey: "tomato-top-dressing",
      title: "Top dressing CAN / NPK due",
      dayOffset: 21,
      category: "fertilizer",
      detail: "First flower clusters appearing. Apply side-dressing fertilizer away from the stem base.",
      priority: "high",
      cta: "Record fertilizer",
    },
    {
      stageKey: "tomato-pruning",
      title: "Pruning suckers (Kutoa machipukizi)",
      dayOffset: 30,
      category: "general",
      detail: "Remove side shoots at leaf axils so food goes into large marketable fruits.",
      priority: "medium",
      cta: "View crop",
    },
    {
      stageKey: "tomato-pest-scout",
      title: "Scout Tuta Absoluta & Blight",
      dayOffset: 42,
      category: "pest_control",
      detail: "Check under leaves for mine galleries (Tuta) and stem blackening (late blight).",
      priority: "critical",
      moneyImpact: "Unchecked Tuta destroys entire harvest",
      cta: "Log pest check",
    },
    {
      stageKey: "tomato-harvest",
      title: "Harvest breaker stage (Kuvuna nyanya)",
      dayOffset: 70,
      category: "harvest_prep",
      detail: "Pick at breaker stage (first pink blush) for distant markets so fruit does not crush in transit.",
      priority: "high",
      cta: "Record harvest",
    },
  ],
  kale: [
    {
      stageKey: "kale-top-dressing",
      title: "Top dressing CAN (Mbolea ya sukuma)",
      dayOffset: 14,
      category: "fertilizer",
      detail: "Sukuma wiki needs nitrogen for deep green, broad leaves. Apply 1 teaspoon CAN per plant.",
      priority: "high",
      cta: "Record fertilizer",
    },
    {
      stageKey: "kale-pest-scout",
      title: "Check aphids & diamondback moth (Wadudu)",
      dayOffset: 28,
      category: "pest_control",
      detail: "Inspect leaf undersides for aphid clusters or caterpillar holes. Observe PHI if spraying.",
      priority: "medium",
      cta: "Log pest check",
    },
    {
      stageKey: "kale-harvest-cycle",
      title: "Weekly picking cycle (Kuvuna sukuma)",
      dayOffset: 42,
      category: "harvest_prep",
      detail: "Harvest outer 3-4 mature leaves per plant weekly. Leave top heart to keep plant producing.",
      priority: "medium",
      cta: "Record harvest",
    },
  ],
};

// Aliases for common Kenyan naming variations
const ALIASES: Record<string, string> = {
  mahindi: "maize",
  corn: "maize",
  maharagwe: "beans",
  viazi: "potatoes",
  irish_potatoes: "potatoes",
  nyanya: "tomatoes",
  sukuma: "kale",
  sukuma_wiki: "kale",
  collard_greens: "kale",
  spinach: "kale",
  cabbage: "kale",
};

/** Normalizes a cropType name to a supported template key. */
export function normalizeCropType(cropType?: string | null): string | null {
  if (!cropType) return null;
  const key = cropType.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (CROP_TEMPLATES[key]) return key;
  if (ALIASES[key]) return ALIASES[key];
  for (const templateKey of Object.keys(CROP_TEMPLATES)) {
    if (key.includes(templateKey)) return templateKey;
  }
  return null;
}

/** Returns all predefined milestones for a crop type. */
export function getCropMilestones(cropType?: string | null): CropStageMilestone[] {
  const norm = normalizeCropType(cropType);
  return norm ? CROP_TEMPLATES[norm] || [] : [];
}

/**
 * Returns any crop stage milestones that require attention today (within a window of
 * -3 days overdue to +3 days upcoming).
 */
export function findActiveMilestones(
  crops: { id: number; name: string; cropType?: string | null; plantingDate?: Date | null }[],
  today: Date = new Date()
): ActiveCropMilestone[] {
  const active: ActiveCropMilestone[] = [];
  const todayMs = new Date(today).setHours(0, 0, 0, 0);

  for (const c of crops) {
    if (!c.plantingDate) continue;
    const plantingMs = new Date(c.plantingDate).setHours(0, 0, 0, 0);
    const daysSincePlanting = Math.floor((todayMs - plantingMs) / 86400000);
    if (daysSincePlanting < 0) continue; // Future planting

    const milestones = getCropMilestones(c.cropType);
    for (const m of milestones) {
      const daysDiff = m.dayOffset - daysSincePlanting; // 0 = due today, negative = overdue, positive = upcoming
      // Fire if due within window: between 3 days overdue (daysDiff >= -3) and 2 days upcoming (daysDiff <= 2)
      if (daysDiff >= -3 && daysDiff <= 2) {
        const dueDate = new Date(plantingMs + m.dayOffset * 86400000);
        const isOverdue = daysDiff < 0;
        const daysLabel = daysDiff === 0 ? "TODAY" : daysDiff < 0 ? `${Math.abs(daysDiff)}d overdue` : `in ${daysDiff}d`;

        active.push({
          stageKey: `${m.stageKey}-${c.id}`,
          cropId: c.id,
          cropName: c.name,
          title: `${c.name}: ${m.title} (${daysLabel})`,
          detail: m.detail,
          dueDate,
          daysDiff,
          isOverdue,
          priority: isOverdue ? "high" : m.priority,
          moneyImpact: m.moneyImpact,
          cta: m.cta,
          category: m.category,
        });
      }
    }
  }

  return active;
}
