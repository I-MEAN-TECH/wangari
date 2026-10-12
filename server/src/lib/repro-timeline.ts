/**
 * Dairy reproduction timeline — days in milk, calving interval, and how many
 * services it took to get a cow settled, computed from the Breeding rows the
 * farmer already enters. Pure, like delivery-quality: the route fetches, this
 * file decides what the dates mean. No new table — these are computations
 * over breeding_records, which is the whole point of "extend never rebuild"
 * (gap report §1 A3).
 *
 * Honesty rules:
 *  - A missing date is never turned into a number. `null` here means "the
 *    farmer hasn't recorded the birth yet", not 0 and not a guess. A report
 *    that invents a calving date would poison the one record a vet or buyer
 *    relies on.
 *  - No invented thresholds. Standard dairy practice targets are common
 *    knowledge (a 12–13-month calving interval, ~2 services per conception),
 *    but we compute the FARMER'S OWN figures and never grade against a
 *    benchmark the farmer didn't choose. The comparison is the reader's job.
 */

const DAY = 86400000;

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

export interface BreedingEvent {
  /** Which cow, by the farmer's own name for her on the Breeding row. */
  damName: string | null;
  matingDate: Date;
  expectedBirth: Date | null;
  actualBirth: Date | null;
  offspringCount: number | null;
  offspringAlive: number | null;
  /** natural | ai | ivf — the method the row recorded */
  method: string | null;
  /** pending | confirmed | born | failed — the row's own status */
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
}

/** Group a farm's breeding rows by dam (the farmer's damName), computing each cow's timeline. */
export function cowTimeline(damName: string, events: BreedingEvent[], on: Date = new Date()): CowTimeline {
  const own = events
    .filter((e) => e.damName != null && e.damName.toLowerCase() === damName.toLowerCase() && e.matingDate instanceof Date && !isNaN(e.matingDate.getTime()))
    .sort((a, b) => a.matingDate.getTime() - b.matingDate.getTime());

  const calvings = own.filter((e) => e.actualBirth != null).map((e) => e.actualBirth as Date).sort((a, b) => a.getTime() - b.getTime());
  const lastCalving = calvings.length ? calvings[calvings.length - 1] : null;
  const daysInMilk = lastCalving ? daysBetween(lastCalving, on) : null;

  const calvingIntervalsDays: number[] = [];
  for (let i = 1; i < calvings.length; i++) calvingIntervalsDays.push(daysBetween(calvings[i - 1], calvings[i]));

  // Services per conception: services after the last calving, up to the next
  // confirmed/born event. Zero recorded services since the last calving is
  // meaningful only if something has been recorded since at all.
  const servicesPerConception = (() => {
    if (!lastCalving) return null;
    const afterLast = own.filter((e) => e.matingDate.getTime() > lastCalving.getTime());
    if (!afterLast.length) return null;
    const settled = afterLast.findIndex((e) => e.status === "confirmed" || e.status === "born");
    const attempts = settled >= 0 ? afterLast.slice(0, settled + 1) : afterLast;
    return attempts.length;
  })();

  const pendingServices = own
    .filter((e) => e.status === "pending")
    .map((e) => ({ matingDate: e.matingDate, method: e.method, expectedBirth: e.expectedBirth }));

  const calvingSoon = own.some((e) => {
    if (!e.expectedBirth) return false;
    const diff = e.expectedBirth.getTime() - on.getTime();
    return diff >= 0 && diff <= 7 * DAY;
  });

  return {
    damName,
    calvings,
    lastCalving,
    daysInMilk,
    calvingIntervalsDays,
    servicesPerConception,
    pendingServices,
    calvingSoon,
  };
}

/** Every distinct dam on the farm, in the farmer's own naming. */
export function allCows(events: BreedingEvent[], on: Date = new Date()): CowTimeline[] {
  const names = [...new Set(events.map((e) => e.damName).filter((n): n is string => !!n))];
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
}

export function herdRepro(events: BreedingEvent[], on: Date = new Date()): HerdRepro {
  const cows = allCows(events, on);
  const intervals = cows.flatMap((c) => c.calvingIntervalsDays);
  const services = cows.map((c) => c.servicesPerConception).filter((s): s is number => s != null);
  return {
    cowCount: cows.length,
    cowsWithCalvingRecord: cows.filter((c) => c.lastCalving != null).length,
    meanCalvingIntervalDays: intervals.length ? Math.round(intervals.reduce((s, x) => s + x, 0) / intervals.length) : null,
    meanServicesPerConception: services.length ? Math.round((services.reduce((s, x) => s + x, 0) / services.length) * 10) / 10 : null,
    cowsPendingService: cows.filter((c) => c.pendingServices.length > 0).map((c) => c.damName),
  };
}
