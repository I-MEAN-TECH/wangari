/**
 * Structured pest scouting (gap report §2 B3).
 *
 * `CropHealth` already recorded date, issue, severity and treatment. What it
 * could not express is the thing an agronomist actually asks: *how many, out of
 * how many?* "Severity: high" is a feeling. "14 of 50 plants, larvae" is a
 * number a farmer can compare with last week's number, and comparing this week
 * with last week is the entire value of scouting.
 *
 * Rules:
 *  - **No action threshold.** Economic thresholds differ by crop, pest, stage
 *    and market price, and a threshold we invented would be us giving agronomic
 *    advice we are not qualified to give. This file counts and compares; it does
 *    not tell anyone to spray.
 *  - **Comparison only against the same crop AND the same issue.** Compared
 *    across issues, "up" would mean nothing.
 *  - **Counts that don't add up are shown, not silently corrected.** A farmer
 *    who recorded 60 affected out of 50 sampled has made a typo; quietly
 *    clamping it to 100% would hide a data-entry problem that recurs.
 */

const DAY = 86400000;

export interface ScoutingRecord {
  id: number;
  cropId: number;
  date: Date;
  /** pest | disease | weed | nutrient */
  issueType: string;
  description?: string | null;
  severity: string;
  /** Plants (or whorls, or berries) actually looked at. */
  sampleSize: number | null;
  /** How many of those were affected. */
  affectedCount: number | null;
  /** larva | adult | egg | egg_mass — matters for what to do about it. */
  pestStage: string | null;
  treatment: string | null;
  treatedDate: Date | null;
  followUpOn: Date | null;
  outcome: string | null;
}

export interface Incidence {
  /** affected ÷ sampled, as a percentage. Null when either count is missing. */
  pct: number | null;
  sampleSize: number | null;
  affectedCount: number | null;
  /** The counts are impossible as recorded (more affected than sampled). */
  overCounted: boolean;
}

/** The one number scouting exists to produce, with the counts beside it. */
export function incidence(r: ScoutingRecord): Incidence {
  const sample = r.sampleSize != null && r.sampleSize > 0 ? r.sampleSize : null;
  const affected = r.affectedCount != null && r.affectedCount >= 0 ? r.affectedCount : null;
  const overCounted = sample != null && affected != null && affected > sample;
  return {
    pct: sample != null && affected != null ? Math.round((affected / sample) * 1000) / 10 : null,
    sampleSize: sample,
    affectedCount: affected,
    overCounted,
  };
}

export type Trend = "rising" | "falling" | "flat" | "unknown";

/**
 * This week against last week, for the same crop and the same issue.
 *
 * Flat means within a percentage point, because scouting counts are eyeballed
 * and a 0.4-point "rise" is noise dressed up as a finding.
 */
export function trend(records: ScoutingRecord[]): Trend {
  const withCounts = records
    .map((r) => ({ r, inc: incidence(r) }))
    .filter((x) => x.inc.pct != null)
    .sort((a, b) => a.r.date.getTime() - b.r.date.getTime());
  if (withCounts.length < 2) return "unknown";
  const latest = withCounts[withCounts.length - 1].inc.pct as number;
  const previous = withCounts[withCounts.length - 2].inc.pct as number;
  const delta = latest - previous;
  if (delta > 1) return "rising";
  if (delta < -1) return "falling";
  return "flat";
}

/** Scouting entries whose follow-up date has arrived, newest first. */
export function followUpsDue(records: ScoutingRecord[], on: Date = new Date()): ScoutingRecord[] {
  return records
    .filter((r) => r.followUpOn != null && r.followUpOn.getTime() <= on.getTime())
    // A scouting record that already resolved is finished — chasing it again is
    // busywork, which is how a to-do list stops being read.
    .filter((r) => r.outcome !== "resolved")
    .sort((a, b) => (a.followUpOn as Date).getTime() - (b.followUpOn as Date).getTime());
}

export interface CropPressure {
  cropId: number;
  /** The most recent scouting entry for this crop, whatever the issue. */
  latestDate: Date | null;
  latestIssue: string | null;
  latestIncidence: number | null;
  latestStage: string | null;
  /** Trend of that same issue, compared with its previous entry. */
  latestTrend: Trend;
  /** Entries still awaiting a follow-up. */
  open: number;
  records: number;
}

/**
 * Per-crop pressure, for the market-day question "which block do I walk first?".
 *
 * A crop with no scouting entry is absent from the list rather than shown at
 * zero: "not looked at" and "nothing found" are different facts, and only one of
 * them is reassuring.
 */
export function cropPressure(records: ScoutingRecord[], on: Date = new Date()): CropPressure[] {
  const byCrop = new Map<number, ScoutingRecord[]>();
  for (const r of records) {
    if (!byCrop.has(r.cropId)) byCrop.set(r.cropId, []);
    byCrop.get(r.cropId)!.push(r);
  }

  const out: CropPressure[] = [];
  for (const [cropId, rows] of byCrop) {
    const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const latest = sorted[sorted.length - 1];
    const sameIssue = sorted.filter((r) => r.issueType === latest.issueType);
    const inc = incidence(latest);
    out.push({
      cropId,
      latestDate: latest.date,
      latestIssue: latest.issueType,
      latestIncidence: inc.pct,
      latestStage: latest.pestStage,
      latestTrend: trend(sameIssue),
      open: followUpsDue(rows, on).length,
      records: rows.length,
    });
  }

  // Most recently scouted first, then the ones with the most to follow up.
  return out.sort(
    (a, b) =>
      (b.latestDate?.getTime() ?? 0) - (a.latestDate?.getTime() ?? 0) || b.open - a.open
  );
}
