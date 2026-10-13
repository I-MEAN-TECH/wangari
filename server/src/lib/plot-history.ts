/**
 * What a plot has grown, in order, and what it actually gave (gap report §2
 * B4 and B6).
 *
 * Both of these are queries over the Plot + Crop + CropHarvest rows that already
 * exist — the doc is explicit that rotation history is "a query, not a table"
 * and that B6 is "compare against Plot.area". So there is no new storage here at
 * all, just the arithmetic that was missing.
 *
 * Rules:
 *  - **The comparison is against the FARMER'S OWN expected yield**, never a
 *    variety potential from a research station. KALRO's "16–21 bags/acre" for
 *    Coast Composite is guidance for a district, not what this farmer achieved,
 *    and treating it as a target would be us marking their homework.
 *  - **Every derived figure is an estimate and says so** (`isEstimate` on the
 *    result) — a farmer reading "2.1 tonnes" must be able to tell it came from
 *    dividing their own harvest by their own acreage and not from a scale.
 *  - **Per-acre needs an area.** With no area recorded there is no denominator
 *    and the figure is null, not a national average.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PlotHarvest {
  id: number;
  date: Date;
  quantityKg: number;
  /** A | B | C or the farmer's own words. */
  quality: string | null;
  salePrice: number | null;
}

export interface PlotCrop {
  cropId: number;
  name: string;
  cropType: string;
  variety: string | null;
  /** The crop's own acreage, when it differs from the plot's. */
  areaAcres: number | null;
  plantingDate: Date | null;
  /** harvested | failed still carry history — a failed season is a rotation fact. */
  status: string;
  expectedYieldKg: number | null;
  harvests: PlotHarvest[];
}

export interface RotationStep {
  cropId: number;
  name: string;
  cropType: string;
  plantingDate: Date | null;
  /** The last harvest on this crop, or null when nothing was harvested. */
  lastHarvest: Date | null;
  harvestedKg: number;
  status: string;
  /** Days between this crop's planting and the previous crop's last harvest. */
  fallowDays: number | null;
  /**
   * The same crop type as the step before it. A FACT about the farmer's own
   * records — we note it and stop there. Whether it matters depends on the
   * crop, the pest and the soil, and that is a conversation with an agronomist.
   */
  repeatsPrevious: boolean;
}

export interface PlotHistory {
  steps: RotationStep[];
  /** Distinct crop types grown here, in first-planted order. */
  cropTypesGrown: string[];
  totalHarvestedKg: number;
  seasonsRecorded: number;
}

/** The plot's crops in the order they were planted. */
export function rotation(crops: PlotCrop[]): PlotHistory {
  // Undated crops sort last rather than first: a planting date nobody recorded
  // is not evidence of having planted first.
  const ordered = [...crops].sort((a, b) => {
    const at = a.plantingDate?.getTime();
    const bt = b.plantingDate?.getTime();
    if (at == null && bt == null) return a.cropId - b.cropId;
    if (at == null) return 1;
    if (bt == null) return -1;
    return at - bt;
  });

  const DAY = 86400000;
  const steps: RotationStep[] = [];
  let previousLastHarvest: Date | null = null;
  let previousType: string | null = null;

  for (const c of ordered) {
    const lastHarvest = c.harvests.length
      ? c.harvests.reduce<Date>((latest, h) => (h.date.getTime() > latest.getTime() ? h.date : latest), c.harvests[0].date)
      : null;
    const harvestedKg = r2(c.harvests.reduce((s, h) => s + (Number(h.quantityKg) || 0), 0));

    steps.push({
      cropId: c.cropId,
      name: c.name,
      cropType: c.cropType,
      plantingDate: c.plantingDate,
      lastHarvest,
      harvestedKg,
      status: c.status,
      fallowDays:
        c.plantingDate && previousLastHarvest
          ? Math.max(0, Math.round((c.plantingDate.getTime() - previousLastHarvest.getTime()) / DAY))
          : null,
      repeatsPrevious: previousType != null && previousType === c.cropType,
    });

    previousLastHarvest = lastHarvest ?? previousLastHarvest;
    previousType = c.cropType;
  }

  // Distinct types in first-planted order, which is the sequence a rotation is
  // read as.
  const cropTypesGrown: string[] = [];
  for (const s of steps) if (!cropTypesGrown.includes(s.cropType)) cropTypesGrown.push(s.cropType);

  return {
    steps,
    cropTypesGrown,
    totalHarvestedKg: r2(steps.reduce((s, x) => s + x.harvestedKg, 0)),
    seasonsRecorded: steps.length,
  };
}

export interface YieldVariance {
  cropId: number;
  name: string;
  cropType: string;
  harvestedKg: number;
  expectedKg: number | null;
  /** harvested − expected. Null without an expectation to compare against. */
  varianceKg: number | null;
  variancePct: number | null;
  /** Which denominator was used, so the figure is reproducible. */
  perAcreBasis: "crop" | "plot" | null;
  areaAcres: number | null;
  perAcreKg: number | null;
  expectedPerAcreKg: number | null;
  /** ALWAYS true for perAcreKg and variance — they are arithmetic, not scale readings. */
  isEstimate: boolean;
  /** Harvests recorded, so a variance from one pick is visible as such. */
  harvestCount: number;
}

/**
 * Harvested against expected, per crop, with the per-acre view.
 *
 * `plotAreaAcres` is the fallback denominator: crops often have no acreage of
 * their own while the plot they stand on has one, and that shared area is the
 * better denominator than nothing — but it is flagged as `perAcreBasis: "plot"`
 * so nobody reads a per-acre figure that silently divided by a neighbour's land.
 */
export function yieldVariance(crop: PlotCrop, plotAreaAcres: number | null): YieldVariance {
  const harvestedKg = r2(crop.harvests.reduce((s, h) => s + (Number(h.quantityKg) || 0), 0));
  const expectedKg = crop.expectedYieldKg != null ? r2(crop.expectedYieldKg) : null;
  const varianceKg = expectedKg != null ? r2(harvestedKg - expectedKg) : null;

  const cropArea = crop.areaAcres != null && crop.areaAcres > 0 ? crop.areaAcres : null;
  const plotArea = plotAreaAcres != null && plotAreaAcres > 0 ? plotAreaAcres : null;
  const area = cropArea ?? plotArea;
  const basis: "crop" | "plot" | null = cropArea != null ? "crop" : plotArea != null ? "plot" : null;

  return {
    cropId: crop.cropId,
    name: crop.name,
    cropType: crop.cropType,
    harvestedKg,
    expectedKg,
    varianceKg,
    // A percentage against zero is not a big variance, it is undefined.
    variancePct: varianceKg != null && expectedKg ? Math.round((varianceKg / expectedKg) * 1000) / 10 : null,
    perAcreBasis: basis,
    areaAcres: area,
    perAcreKg: area != null ? r2(harvestedKg / area) : null,
    expectedPerAcreKg: area != null && expectedKg != null ? r2(expectedKg / area) : null,
    isEstimate: true,
    harvestCount: crop.harvests.length,
  };
}
