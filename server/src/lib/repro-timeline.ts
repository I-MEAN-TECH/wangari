/**
 * Dairy reproduction timeline — days in milk, calving interval, how many
 * services it took to get a cow settled, WHERE SHE IS IN HER HEAT CYCLE, and
 * whether she is dry. Computed from the Breeding rows the farmer already enters.
 * Pure, like delivery-quality: the route fetches, this file decides what the
 * dates mean. No new table — these are computations over breeding_records,
 * which is the whole point of "extend never rebuild" (gap report §1 A3/A4).
 *
 * Honesty rules:
 *  - A missing date is never turned into a number. `null` here means "the
 *    farmer hasn't recorded it yet", not 0 and not a guess. A report that
 *    invents a calving date would poison the one record a vet or buyer relies on.
 *  - No invented thresholds. Standard dairy practice targets are common
 *    knowledge (a 12–13-month calving interval, ~2 services per conception, a
 *    21-day cycle), but we compute the FARMER'S OWN figures and never grade
 *    against a benchmark the farmer didn't choose. The comparison is the
 *    reader's job.
 *  - A heat observed 40 days ago is NOT reported as "overdue". She may have been
 *    served and settled, or the farmer may simply not have looked. The panel
 *    states the arithmetic ("the next one would be around the 14th") and leaves
 *    the conclusion to the person who has actually seen the animal. An app that
 *    shouts "overdue" at a settled cow is an app that gets muted.
 */

const DAY = 86400000;

/** The interval a cow's cycle repeats on when nothing intervenes. */
export const HEAT_CYCLE_DAYS = 21;

/** How far ahead of the predicted date a cow belongs on the watch list. */
export const HEAT_WATCH_AHEAD_DAYS = 7;
/** How far behind — a heat she may have shown unnoticed. Beyond this, dropped. */
export const HEAT_WATCH_BACK_DAYS = 3;

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/** A usable Date or null — never an Invalid Date leaking into arithmetic. */
function realDate(d: Date | null | undefined): Date | null {
  return d instanceof Date && !isNaN(d.getTime()) ? d : null;
}

export interface BreedingEvent {
  /** Which cow, by the farmer's own name for her on the Breeding row. */
  damName: string | null;
  /**
   * Null when the row is a HEAT rather than a service — a heat with no mating
   * date yet is a real observation and must not be dropped or forced onto a
   * date nobody recorded.
   */
  matingDate: Date | null;
  /** The day she was seen in heat (A4), if this row carries one. */
  heatObservedAt: Date | null;
  /** What was seen — standing, mucus, bellowing. Free text, the farmer's words. */
  heatSigns: string | null;
  /** The day milking stopped ahead of the next calving, if recorded. */
  dryOffDate: Date | null;
  expectedBirth: Date | null;
  actualBirth: Date | null;
  offspringCount: number | null;
  offspringAlive: number | null;
  /** natural | ai | ivf — the method the row recorded */
  method: string | null;
  /** heat | pending | confirmed | born | failed | dried_off — the row's own status */
  status: string;
}

export interface CowTimeline {
  damName: string;
  /** Births recorded (status=born with actualBirth). */
  calvings: Date[];
  /** Latest recorded actual birth — the start of the current lactation. */
  lastCalving: Date | null;
  /** Days since the last calving. Null when no birth has been recorded. */
  daysInMilk: number | null;
  /** Days between consecutive recorded calvings (the interval per pair). */
  calvingIntervalsDays: number[];
  /** Services recorded AFTER a calving and BEFORE the next — the attempts per cycle. */
  servicesPerConception: number | null;
  /** The service rows still pending, in mating-date order. */
  pendingServices: { matingDate: Date; method: string | null; expectedBirth: Date | null }[];
  /** Expected births within the next 7 days — matches cron-lifecycle's kit nudge. */
  calvingSoon: boolean;
  /** The most recent heat observation, and how long ago it was. */
  lastHeat: Date | null;
  daysSinceHeat: number | null;
  /**
   * When the next heat would fall on a normal 21-day cycle. Null when no heat
   * has ever been recorded. A date to watch for, never a due date.
   */
  nextHeatExpected: Date | null;
  /** Days until `nextHeatExpected`. Negative means that window has already passed. */
  daysToNextHeat: number | null;
  /** Days between the last heat and the service that followed it, if both exist. */
  heatToServiceDays: number | null;
  /** The last recorded dry-off date. */
  lastDryOff: Date | null;
  /** True when she was dried off and has not calved since. */
  isDry: boolean;
  /** Days since dry-off, counted only while she is still dry. */
  dryDays: number | null;
}

/**
 * The date a row should be sorted by, and the test for whether it carries an
 * event at all.
 *
 * A heat row has no mating date, so ordering by matingDate would drop it into a
 * null heap and make the cycle arithmetic read the wrong event. `dryOffDate` is
 * in the chain for a less obvious reason that a test caught: a row recording
 * ONLY a dry-off date is still a reproduction event, and omitting it here dropped
 * the whole row — so `cowsDry` reported zero for a herd with two dry cows.
 */
function eventDate(e: BreedingEvent): Date | null {
  return (
    realDate(e.matingDate) ?? realDate(e.heatObservedAt) ?? realDate(e.actualBirth) ?? realDate(e.dryOffDate)
  );
}

/** Group a farm's breeding rows by dam (the farmer's damName), computing each cow's timeline. */
export function cowTimeline(damName: string, events: BreedingEvent[], on: Date = new Date()): CowTimeline {
  const own = events
    .filter((e) => e.damName != null && e.damName.toLowerCase() === damName.toLowerCase() && eventDate(e) != null)
    .sort((a, b) => (eventDate(a) as Date).getTime() - (eventDate(b) as Date).getTime());

  const calvings = own
    .map((e) => realDate(e.actualBirth))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const lastCalving = calvings.length ? calvings[calvings.length - 1] : null;
  const daysInMilk = lastCalving ? daysBetween(lastCalving, on) : null;

  const calvingIntervalsDays: number[] = [];
  for (let i = 1; i < calvings.length; i++) calvingIntervalsDays.push(daysBetween(calvings[i - 1], calvings[i]));

  // Services per conception: services after the last calving, up to the next
  // confirmed/born event. Zero recorded services since the last calving is
  // meaningful only if something has been recorded since at all.
  const servicesPerConception = (() => {
    if (!lastCalving) return null;
    const afterLast = own.filter((e) => {
      const d = realDate(e.matingDate);
      return d != null && d.getTime() > lastCalving.getTime();
    });
    if (!afterLast.length) return null;
    const settled = afterLast.findIndex((e) => e.status === "confirmed" || e.status === "born");
    const attempts = settled >= 0 ? afterLast.slice(0, settled + 1) : afterLast;
    return attempts.length;
  })();

  const pendingServices = own
    .map((e) => ({ e, d: realDate(e.matingDate) }))
    .filter((x): x is { e: BreedingEvent; d: Date } => x.d != null && x.e.status === "pending")
    .map(({ e, d }) => ({ matingDate: d, method: e.method, expectedBirth: realDate(e.expectedBirth) }));

  const calvingSoon = own.some((e) => {
    const d = realDate(e.expectedBirth);
    if (!d) return false;
    const diff = d.getTime() - on.getTime();
    return diff >= 0 && diff <= 7 * DAY;
  });

  // ── A4: the heat cycle ────────────────────────────────────────────────────
  const heats = own
    .map((e) => realDate(e.heatObservedAt))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const lastHeat = heats.length ? heats[heats.length - 1] : null;
  const daysSinceHeat = lastHeat ? daysBetween(lastHeat, on) : null;
  // 21 days on. Stated as "around", and never as a due date — see the header.
  const nextHeatExpected = lastHeat ? new Date(lastHeat.getTime() + HEAT_CYCLE_DAYS * DAY) : null;
  const daysToNextHeat = nextHeatExpected ? daysBetween(on, nextHeatExpected) : null;

  // How long after the heat the service actually happened. This is the number a
  // farmer checks when a conception fails: served 3 days late is a plausible
  // explanation, served the same day is not.
  const heatToServiceDays = (() => {
    if (!lastHeat) return null;
    const served = own
      .map((e) => realDate(e.matingDate))
      .filter((d): d is Date => d != null && d.getTime() >= lastHeat.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return served ? daysBetween(lastHeat, served) : null;
  })();

  // ── A3: dry-off ───────────────────────────────────────────────────────────
  const dryOffs = own
    .map((e) => realDate(e.dryOffDate))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const lastDryOff = dryOffs.length ? dryOffs[dryOffs.length - 1] : null;
  // Dried off and not calved since: she is dry today. A calving after the dry-off
  // date starts the next lactation and ends the dry period — without this check
  // every cow that has ever been dried off would stay "dry" forever.
  const isDry = lastDryOff != null && (lastCalving == null || lastDryOff.getTime() > lastCalving.getTime());
  const dryDays = isDry && lastDryOff ? daysBetween(lastDryOff, on) : null;

  return {
    damName,
    calvings,
    lastCalving,
    daysInMilk,
    calvingIntervalsDays,
    servicesPerConception,
    pendingServices,
    calvingSoon,
    lastHeat,
    daysSinceHeat,
    nextHeatExpected,
    daysToNextHeat,
    heatToServiceDays,
    lastDryOff,
    isDry,
    dryDays,
  };
}

/** Every distinct dam on the farm, in the farmer's own naming. */
export function allCows(events: BreedingEvent[], on: Date = new Date()): CowTimeline[] {
  const names = [...new Set(events.map((e) => e.damName).filter((n): n is string => n != null && n !== ""))];
  return names.map((n) => cowTimeline(n, events, on));
}

/**
 * Farm-level reproduction summary. Every number is a plain aggregate of the
 * cow timelines — no benchmark, no grade, no invented target.
 */
export interface HerdRepro {
  cowCount: number;
  cowsWithCalvingRecord: number;
  /** Mean calving interval across all recorded pairs, in days. Null if none. */
  meanCalvingIntervalDays: number | null;
  /** Mean services per conception across cows that have the data. Null if none. */
  meanServicesPerConception: number | null;
  /** Cows with a pending service — the AI/heat follow-up list. */
  cowsPendingService: string[];
  /** Cows with at least one recorded heat. */
  cowsWithHeatRecord: number;
  /**
   * Cows whose next heat window is coming up — the watch list.
   *
   * The window is the next seven days, plus the last three (a heat she may have
   * shown while nobody was looking). Everything further back is DROPPED rather
   * than labelled overdue: she may have been served and settled, and this app
   * cannot know that from a distance. A watch list that keeps crying wolf is a
   * watch list nobody opens.
   */
  cowsDueForHeatCheck: string[];
  /** Cows currently dry, and how long the longest has been dry. */
  cowsDry: number;
  longestDryDays: number | null;
}

export function herdRepro(events: BreedingEvent[], on: Date = new Date()): HerdRepro {
  const cows = allCows(events, on);
  const intervals = cows.flatMap((c) => c.calvingIntervalsDays);
  const services = cows.map((c) => c.servicesPerConception).filter((s): s is number => s != null);
  const dry = cows.filter((c) => c.isDry);
  return {
    cowCount: cows.length,
    cowsWithCalvingRecord: cows.filter((c) => c.lastCalving != null).length,
    meanCalvingIntervalDays: intervals.length ? Math.round(intervals.reduce((s, x) => s + x, 0) / intervals.length) : null,
    meanServicesPerConception: services.length ? Math.round((services.reduce((s, x) => s + x, 0) / services.length) * 10) / 10 : null,
    cowsPendingService: cows.filter((c) => c.pendingServices.length > 0).map((c) => c.damName),
    cowsWithHeatRecord: cows.filter((c) => c.lastHeat != null).length,
    cowsDueForHeatCheck: cows
      .filter((c) => c.daysToNextHeat != null && c.daysToNextHeat >= -HEAT_WATCH_BACK_DAYS && c.daysToNextHeat <= HEAT_WATCH_AHEAD_DAYS)
      .map((c) => c.damName),
    cowsDry: dry.length,
    longestDryDays: dry.length ? Math.max(...dry.map((c) => c.dryDays ?? 0)) : null,
  };
}
