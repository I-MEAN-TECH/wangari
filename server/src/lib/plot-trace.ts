/**
 * Plot traceability — the pure shape behind the EUDR/agronomy chain (§2 B1/B2).
 *
 * A crop farm is not one record with an acreage; it is plots. This file turns a
 * Plot and the crops/harvests/batches that hang off it into the ONE document a
 * farmer can hand a buyer: "here is the piece of ground, here are its GPS
 * coordinates, and here is every harvest and post-harvest batch that left it."
 *
 * ## The EUDR honesty frame (read once, it matters)
 *
 * EUDR applies to European operators, not to non-EU producers themselves — a
 * Kenyan smallholder will be ASKED for location data so an EU buyer can comply.
 * So the practical deadline is **the day their buyer asks**, not a statutory
 * date served on them. This file therefore *collects and chains* geolocation;
 * it never asserts a legal obligation, and it never lets a missing coordinate
 * masquerade as a complete one. If we lie and the farmer finds out, they stop
 * trusting the app — and the trust is the whole product.
 *
 * ## What "traceable" means here
 *
 * A delivery is traceable back to a piece of ground only when its crop hangs
 * off a plot that actually carries a GPS pair. A plot with no coordinates, or a
 * crop with no plot, is not traceable — and the chain says so out loud rather
 * than pretending.
 */

/** A bare input row the route already loaded — no Prisma dependency. */
export interface PlotTraceInput {
  plotId: number;
  name: string;
  /** both-or-neither: a lone coordinate is an error, never a half-save */
  latitude: number | null;
  longitude: number | null;
  /** "acre" | "hectare" | null */
  areaUnit: string | null;
  areaValue: number | null;
  soilType: string | null;
  /** every crop planted on this plot, harvested or not */
  crops: PlotCropTraceInput[];
}

export interface PlotCropTraceInput {
  cropId: number;
  name: string;
  cropType: string;
  /** all harvests for this crop, newest first */
  harvests: { harvestId: number; date: Date; quantityKg: number; quality: string | null }[];
  /** post-harvest export batches (coffee/avocado chain), newest first */
  batches: { batchId: number; batchCode: string; harvestDate: Date; destination: string | null; grade: string | null }[];
}

export interface TraceCropLine {
  cropId: number;
  name: string;
  cropType: string;
  /** total kg ever harvested off this plot through this crop */
  totalKg: number;
  harvests: number;
  batches: number;
  /** true when this crop has a post-harvest batch with a destination — i.e. it left the farm */
  exported: boolean;
}

export interface PlotTrace {
  plotId: number;
  name: string;
  /** GPS geometry for the buyer. Absent when the plot never got coordinates. */
  geo: {
    latitude: number | null;
    longitude: number | null;
    /** "ready to hand a buyer" = the plot actually has both coordinates */
    hasCoordinates: boolean;
  } | null;
  areaValue: number | null;
  areaUnit: string | null;
  soilType: string | null;
  crops: TraceCropLine[];
  /** does every crop on this plot hang off it with coordinates? drives the checklist */
  traceable: boolean;
  /** names exactly what stands between this plot and a hand-to-buyer chain */
  missing: string[];
  /** a one-line "what this plot is" for the buyer, or null if nothing left it yet */
  summary: string | null;
}

/** A crop is only "exported" if it has a post-harvest batch with a destination. */
function cropLine(c: PlotCropTraceInput): TraceCropLine {
  const totalKg = c.harvests.reduce((s, h) => s + Number(h.quantityKg), 0);
  const exported = c.batches.some((b) => !!b.destination);
  return {
    cropId: c.cropId,
    name: c.name,
    cropType: c.cropType,
    totalKg: Math.round(totalKg * 100) / 100,
    harvests: c.harvests.length,
    batches: c.batches.length,
    exported,
  };
}

/**
 * Shape one plot (with its crops' full history) into the traceability chain.
 *
 * The `missing[]` list is the contract — never abbreviated or softened. The
 * farmer reads it as the checklist of what is left before a buyer will accept
 * this plot's produce as traceable.
 */
export function buildPlotTrace(input: PlotTraceInput): PlotTrace {
  const missing: string[] = [];
  // Both-or-neither: a lone coordinate is a point somewhere in the Indian Ocean.
  const hasLat = input.latitude !== null && input.latitude !== undefined;
  const hasLng = input.longitude !== null && input.longitude !== undefined;
  if (!hasLat && !hasLng) missing.push("plot GPS coordinates — capture them with one tap");
  else if (!(hasLat && hasLng)) missing.push("a matching longitude for the latitude — coordinates are a pair");

  const crops = input.crops.map(cropLine);
  // Traceable = the plot carries a real GPS pair, so any produce that leaves it
  // can be pointed at an actual piece of ground. A plot with no coordinates—or
  // half a pair—is not traceable, and the missing[] list says so out loud.
  const traceable = hasLat && hasLng;

  // Summarise what actually left this plot, in plain words the buyer reads.
  const exportedCount = crops.filter((c) => c.exported).length;
  const summary =
    crops.length === 0
      ? null
      : exportedCount > 0
        ? `${input.name}: ${exportedCount} crop${exportedCount === 1 ? "" : "s"} leaving the farm, GPS ${traceable ? "recorded" : "needed"}`
        : `${input.name}: ${crops.length} crop${crops.length === 1 ? "" : "s"} grown so far, none exported yet`;

  return {
    plotId: input.plotId,
    name: input.name,
    geo: hasLat || hasLng ? { latitude: input.latitude, longitude: input.longitude, hasCoordinates: hasLat && hasLng } : null,
    areaValue: input.areaValue,
    areaUnit: input.areaUnit,
    soilType: input.soilType,
    crops,
    traceable,
    missing,
    summary,
  };
}