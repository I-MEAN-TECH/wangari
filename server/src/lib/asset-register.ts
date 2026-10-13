/**
 * Herd and equipment as capital (gap report §3 C8).
 *
 * The doc's instruction is "present the value that is already computable", and
 * that is exactly the boundary here. `costPerAnimal` and `totalInvestment`
 * already record what the herd cost; `Inventory.unitCost` already records what
 * the tools cost. Nothing new is measured — this file only turns those into a
 * register with a book value where one is genuinely derivable.
 *
 * The one judgement in the whole file, stated because it changes a number:
 *
 *  - **Cost of a herd = the stated total investment, or the per-head cost applied
 *    to the ORIGINAL head count.** Not the current count. An animal born on the
 *    farm was never bought, so counting her would inflate what was actually
 *    paid — and a farmer who cannot tell what they spent from what they own has
 *    the exact problem an asset register is for.
 *  - **Book value needs a clock AND a life.** With either missing, the register
 *    shows cost and says book value is not computable. It never depreciates on a
 *    default we invented: a made-up useful life produces a made-up number that a
 *    lender would then rely on.
 *  - **Salvage defaults to zero and says so.** When a life is given but no end
 *    value is, straight-line-to-zero is the only honest reading, and the note on
 *    the line says "depreciated to zero".
 */

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface AssetFlock {
  id: number;
  name: string;
  type: string | null;
  /** Head now. */
  currentCount: number;
  /** Head when it was set up — what the purchase cost was based on. */
  initialCount: number;
  costPerAnimal: number | null;
  totalInvestment: number | null;
  acquiredOn: Date | null;
  usefulLifeYears: number | null;
  salvageValue: number | null;
  status: string;
}

export interface EquipmentItem {
  id: number;
  itemName: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  category?: string | null;
}

export interface AssetLine {
  kind: "livestock" | "equipment";
  id: number;
  name: string;
  /** Head for livestock, quantity for equipment. */
  units: number;
  unitLabel: string;
  /** What it cost, from the farmer's own records. Null when nothing was recorded. */
  cost: number | null;
  acquiredOn: Date | null;
  usefulLifeYears: number | null;
  salvageValue: number | null;
  /** Years since acquisition, to one decimal. Null without a date. */
  ageYears: number | null;
  annualDepreciation: number | null;
  bookValue: number | null;
  /**
   * `straight_line` — a life and a date were both given, so this is real
   * arithmetic. `cost_only` — shown at cost because something is missing.
   */
  basis: "straight_line" | "cost_only";
  note: string;
}

export interface AssetRegister {
  lines: AssetLine[];
  livestock: { lines: number; cost: number; bookValue: number };
  equipment: { lines: number; cost: number; bookValue: number };
  totalCost: number;
  totalBookValue: number;
  /** Lines with a genuine straight-line book value. */
  depreciable: number;
  /** Lines shown at cost because a date or a life is missing. */
  costOnly: number;
  basis: string;
}

/** Straight-line book value, or nulls when the inputs do not support one. */
function depreciate(
  cost: number,
  acquiredOn: Date | null,
  usefulLifeYears: number | null,
  salvageValue: number | null,
  on: Date
): { ageYears: number | null; annualDepreciation: number | null; bookValue: number | null } {
  if (acquiredOn == null || usefulLifeYears == null || usefulLifeYears <= 0) {
    return { ageYears: null, annualDepreciation: null, bookValue: null };
  }
  const ageYears = Math.round(((on.getTime() - acquiredOn.getTime()) / DAY / 365.25) * 10) / 10;
  const salvage = salvageValue ?? 0;
  // A salvage value above cost would make depreciation negative, which would
  // mean the asset is appreciating on paper. Floored at zero instead.
  const depreciable = Math.max(0, cost - salvage);
  const annual = depreciable / usefulLifeYears;
  const book = Math.max(salvage, cost - annual * Math.max(0, ageYears));
  return { ageYears, annualDepreciation: r2(annual), bookValue: r2(book) };
}

function livestockLine(f: AssetFlock, on: Date): AssetLine {
  // Total investment when stated; otherwise per-head × the ORIGINAL count.
  const cost =
    f.totalInvestment != null
      ? r2(Number(f.totalInvestment))
      : f.costPerAnimal != null && f.initialCount > 0
        ? r2(Number(f.costPerAnimal) * f.initialCount)
        : null;

  if (cost == null) {
    return {
      kind: "livestock",
      id: f.id,
      name: f.name,
      units: f.currentCount,
      unitLabel: "head",
      cost: null,
      acquiredOn: f.acquiredOn,
      usefulLifeYears: f.usefulLifeYears,
      salvageValue: f.salvageValue,
      ageYears: null,
      annualDepreciation: null,
      bookValue: null,
      basis: "cost_only",
      note: "No purchase cost recorded for this group — add it and the register can value it.",
    };
  }

  const d = depreciate(cost, f.acquiredOn, f.usefulLifeYears, f.salvageValue, on);
  const missing = f.acquiredOn == null ? "no purchase date" : f.usefulLifeYears == null ? "no useful life set" : null;
  return {
    kind: "livestock",
    id: f.id,
    name: f.name,
    units: f.currentCount,
    unitLabel: "head",
    cost,
    acquiredOn: f.acquiredOn,
    usefulLifeYears: f.usefulLifeYears,
    salvageValue: f.salvageValue,
    ...d,
    basis: d.bookValue != null ? "straight_line" : "cost_only",
    note:
      d.bookValue != null
        ? f.salvageValue == null
          ? `Depreciated over ${f.usefulLifeYears} years to zero (no end value recorded).`
          : `Depreciated over ${f.usefulLifeYears} years to KES ${Math.round(f.salvageValue).toLocaleString()}.`
        : `Shown at cost — ${missing}. Book value is not computable without it.`,
  };
}

function equipmentLine(i: EquipmentItem): AssetLine {
  const cost = i.unitCost != null && i.unitCost > 0 ? r2(Number(i.unitCost) * (Number(i.quantity) || 0)) : null;
  return {
    kind: "equipment",
    id: i.id,
    name: i.itemName,
    units: r2(Number(i.quantity) || 0),
    unitLabel: i.unit,
    cost,
    // Inventory records what a thing cost, not when it was bought or how long it
    // lasts. Asking for those on every bag of feed would be noise, so equipment
    // is shown at cost and says so.
    acquiredOn: null,
    usefulLifeYears: null,
    salvageValue: null,
    ageYears: null,
    annualDepreciation: null,
    bookValue: cost,
    basis: "cost_only",
    note: "Shown at cost — stock records value, not purchase dates.",
  };
}

export function assetRegister(flocks: AssetFlock[], items: EquipmentItem[], on: Date = new Date()): AssetRegister {
  const lines: AssetLine[] = [
    // Only groups that are still the farm's own stock: a sold flock is money
    // already received, not capital, and counting it would double-count.
    ...flocks.filter((f) => f.status !== "sold" && f.status !== "archived").map((f) => livestockLine(f, on)),
    ...items.map(equipmentLine),
  ];

  const sum = (kind: AssetLine["kind"], of: "cost" | "bookValue") =>
    r2(lines.filter((l) => l.kind === kind).reduce((s, l) => s + (Number(l[of]) || 0), 0));

  return {
    lines,
    livestock: {
      lines: lines.filter((l) => l.kind === "livestock").length,
      cost: sum("livestock", "cost"),
      bookValue: sum("livestock", "bookValue"),
    },
    equipment: {
      lines: lines.filter((l) => l.kind === "equipment").length,
      cost: sum("equipment", "cost"),
      bookValue: sum("equipment", "bookValue"),
    },
    totalCost: r2(lines.reduce((s, l) => s + (l.cost ?? 0), 0)),
    totalBookValue: r2(lines.reduce((s, l) => s + (l.bookValue ?? 0), 0)),
    depreciable: lines.filter((l) => l.basis === "straight_line").length,
    costOnly: lines.filter((l) => l.basis === "cost_only").length,
    basis:
      "Built from the costs you recorded. Book value is straight-line over the useful life you set — it is not a sale price and not a market valuation.",
  };
}
