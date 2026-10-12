/**
 * Per-cow milk yield — what a handful of milking rows mean.
 *
 * Pure, like delivery-quality and repro-timeline: the route fetches rows, this
 * file decides what they say. Same posture as the rest of the dairy work, and
 * for the same reason — a farmer may take this to a co-op or a vet, so the
 * arithmetic has to be answerable on its own.
 *
 * ## The honesty rule that shapes this whole file
 *
 * `AnimalProduction` rows and `DailyProduction.milkCollected` are **different
 * grains of fact and must not be silently compared to each other**. A farmer
 * with five cows may record per-cow milkings for three of them and the flock
 * total for all five. If we divided or summed across the two, we would produce
 * a per-cow average that looks authoritative and is simply wrong.
 *
 * So every function here keeps the two apart, and `coverage()` exists purely
 * to *show the gap* rather than paper over it: "you recorded 3 of 5 cows;
 * 9.4 of 31 litres are not attributed to a cow." A number the farmer cannot
 * trust is worse than no number, which is the rule the rest of this codebase
 * already holds (see unit-economics, record-grade).
 *
 * No invented benchmarks. We never grade a cow against a breed standard the
 * farmer did not choose — we report their own figures and leave the comparison
 * to whoever is reading.
 */

/** One milking row, as stored. */
export interface MilkingRow {
  animalId: number;
  date: Date;
  /** morning | evening | full_day */
  session: string;
  milkLitres: number;
}

/** An animal the farm actually has, so "not recorded" is distinguishable from "no cow". */
export interface HerdAnimal {
  id: number;
  /** The farmer's tag or name — what they will recognise on screen. */
  label: string;
  flockId?: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400000;

/** Morning + evening rows for one cow-day collapsed into that day's total. */
export interface CowDay {
  date: Date;
  litres: number;
  /** How many separate milking rows made up this day. */
  sessions: number;
  /** True when the day is a single `full_day` row, not a morning+evening pair. */
  isWholeDay: boolean;
}

export interface CowYield {
  animalId: number;
  label: string;
  flockId: number | null;
  /** Days on which this cow was milked at all, oldest first. */
  days: CowDay[];
  daysRecorded: number;
  totalLitres: number;
  /** Mean of the RECORDED days only. Null when nothing was recorded. */
  avgLitresPerRecordedDay: number | null;
  best: CowDay | null;
  worst: CowDay | null;
  lastRecordedOn: Date | null;
  /** Litres per day over the window, counting unrecorded days as zero. */
  avgLitresPerWindowDay: number | null;
}

export interface Coverage {
  /** Litres the farmer attributed to individual cows. */
  attributedLitres: number;
  /** The flock total for the same window, as logged. */
  flockTotalLitres: number;
  /** flockTotal − attributed. Positive = not attributed to any cow. */
  unattributedLitres: number;
  /** attributed ÷ flockTotal, 0–100. Null when no flock total was logged. */
  coveragePct: number | null;
  cowsRecorded: number;
  cowsInHerd: number;
  /** Cow ids in the herd with no milking row at all — the ones to go and milk-record. */
  cowsNotRecorded: number[];
  /**
   * True when per-cow rows add up to MORE than the flock total. That is not a
   * rounding matter — it means one of the two numbers was entered wrongly, and
   * the farmer should be told rather than shown a confident average.
   */
  exceedsFlockTotal: boolean;
}

export interface HerdSummary {
  cows: CowYield[];
  herdTotalLitres: number;
  /** The single best-yielding cow in the window — one line, no charting. */
  topCow: CowYield | null;
  /** Herd average per recorded day, across cows that were recorded. */
  herdAvgPerRecordedDay: number | null;
}

/**
 * Collapse milking rows for one cow into per-day totals, oldest first.
 * A morning + evening pair becomes one day; a `full_day` row becomes one day.
 */
export function cowDays(rows: MilkingRow[]): CowDay[] {
  const byDay = new Map<string, { date: Date; litres: number; sessions: number; hasFullDay: boolean }>();
  for (const r of rows) {
    if (!(r.date instanceof Date) || isNaN(r.date.getTime())) continue;
    const litres = Number(r.milkLitres);
    if (!isFinite(litres)) continue;
    const key = r.date.toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { date: r.date, litres: 0, sessions: 0, hasFullDay: false };
    cur.litres += litres;
    cur.sessions += 1;
    if (r.session === "full_day") cur.hasFullDay = true;
    byDay.set(key, cur);
  }
  return [...byDay.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((d) => ({
      date: d.date,
      litres: round2(d.litres),
      sessions: d.sessions,
      isWholeDay: d.hasFullDay,
    }));
}

/**
 * One cow's yield over the rows given.
 *
 * `windowDays` is the number of days the caller considers the window (e.g. 30
 * for a 30-day query). It is only used for the per-window-day average, which
 * counts days with no record as zero — the number a farmer compares against
 * what the cow *should* be giving, unlike the per-recorded-day mean which
 * flatters a cow that was only recorded on her best days.
 */
export function cowYield(animal: HerdAnimal, rows: MilkingRow[], windowDays?: number): CowYield {
  const mine = rows.filter((r) => r.animalId === animal.id);
  const days = cowDays(mine);
  const totalLitres = round2(days.reduce((s, d) => s + d.litres, 0));
  const daysRecorded = days.length;
  const avgLitresPerRecordedDay = daysRecorded ? round2(totalLitres / daysRecorded) : null;
  let best: CowDay | null = null;
  let worst: CowDay | null = null;
  for (const d of days) {
    if (!best || d.litres > best.litres) best = d;
    if (!worst || d.litres < worst.litres) worst = d;
  }
  const win = windowDays && windowDays > 0 ? windowDays : daysRecorded || null;
  return {
    animalId: animal.id,
    label: animal.label,
    flockId: animal.flockId ?? null,
    days,
    daysRecorded,
    totalLitres,
    avgLitresPerRecordedDay,
    best,
    worst,
    lastRecordedOn: days.length ? days[days.length - 1].date : null,
    avgLitresPerWindowDay: win ? round2(totalLitres / win) : null,
  };
}

/** Every animal in the herd with its yield, best producer first. */
export function herdSummary(herd: HerdAnimal[], rows: MilkingRow[], windowDays?: number): HerdSummary {
  const cows = herd
    .map((a) => cowYield(a, rows, windowDays))
    .sort((a, b) => b.totalLitres - a.totalLitres || a.label.localeCompare(b.label));
  const herdTotalLitres = round2(cows.reduce((s, c) => s + c.totalLitres, 0));
  const recorded = cows.filter((c) => c.daysRecorded > 0);
  const herdAvgPerRecordedDay = recorded.length
    ? round2(recorded.reduce((s, c) => s + (c.avgLitresPerRecordedDay ?? 0), 0) / recorded.length)
    : null;
  return {
    cows,
    herdTotalLitres,
    topCow: recorded.length ? recorded[0] : null,
    herdAvgPerRecordedDay,
  };
}

/**
 * How much of the flock total the per-cow records actually explain.
 *
 * This is the function that keeps the two grains of fact honest. It never
 * divides one by the other to invent a per-cow figure; it reports the
 * shortfall so the farmer knows whether they can trust a per-cow average yet.
 */
export function coverage(herd: HerdAnimal[], rows: MilkingRow[], flockTotalLitres: number): Coverage {
  const attributedLitres = round2(rows.reduce((s, r) => s + Number(r.milkLitres || 0), 0));
  const flockTotal = round2(Number(flockTotalLitres) || 0);
  const recordedIds = new Set(rows.map((r) => r.animalId));
  const cowsRecorded = herd.filter((a) => recordedIds.has(a.id)).length;
  const unattributedLitres = round2(flockTotal - attributedLitres);
  const exceedsFlockTotal = attributedLitres - flockTotal > 0.01;
  return {
    attributedLitres,
    flockTotalLitres: flockTotal,
    unattributedLitres,
    // A missing flock total means no denominator — say so instead of 0% or 100%.
    coveragePct: flockTotal > 0 ? Math.min(100, round2((attributedLitres / flockTotal) * 100)) : null,
    cowsRecorded,
    cowsInHerd: herd.length,
    cowsNotRecorded: herd.filter((a) => !recordedIds.has(a.id)).map((a) => a.id),
    exceedsFlockTotal,
  };
}

/** Allowed milking sessions — mirrors the column's values, shared with the route. */
export const SESSIONS = ["morning", "evening", "full_day"] as const;
export type Session = (typeof SESSIONS)[number];

/** Normalise a client-supplied session to a stored value, defaulting to full_day. */
export function normaliseSession(raw: unknown): Session {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (SESSIONS as readonly string[]).includes(s) ? (s as Session) : "full_day";
}
