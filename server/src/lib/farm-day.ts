/**
 * What day is it on the farm?
 *
 * The server runs in UTC — deliberately, and docs/DEPLOY-HARDENING.md says it
 * must stay UTC. Kenya is UTC+3 all year with no daylight saving, so the two
 * part company every night between 21:00 and 24:00 UTC: it is already tomorrow
 * in Nakuru.
 *
 * That gap is not cosmetic. A worker who clocks in at 06:00 EAT is logging at
 * 03:00 UTC, so `new Date().toISOString().split("T")[0]` returns the right day
 * there but `new Date().toTimeString().slice(0, 5)` returns "03:00" — three
 * hours before the worker arrived. The clock is wrong all day, every day; only
 * the date part goes wrong in the small hours.
 *
 * And the date fails in the opposite direction to how it looks: at 00:30 EAT on
 * the 6th it is 21:30 UTC on the *5th*, so a clock-in is filed against
 * yesterday and the worker gets two shifts on one day instead of two days.
 *
 * So one place decides what "today" means for the farm, and everything that
 * files a record against a day asks it here. Pure functions taking the clock as
 * an argument, so the 21:00-24:00 window is testable at noon.
 */

/** IANA zone the product is sold into. */
export const FARM_TIME_ZONE = "Africa/Nairobi";

/**
 * Calendar date on the farm, as `YYYY-MM-DD`.
 *
 * `Intl` rather than `date.getTimezoneOffset()` on purpose: the offset trick
 * hardcodes UTC+3 and silently rots the day a country changes its rules.
 * `Intl` asks the zone database that ships with Node.
 *
 * `en-CA` formats as YYYY-MM-DD, which is the shape every other date string in
 * this codebase already is; anything else would break the comparisons.
 */
export function farmDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FARM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Wall-clock time on the farm, as `HH:MM`, 24-hour.
 *
 * This is what a worker reads off a clock in the field, so it has to be the
 * farm's time and not the server's.
 *
 * `hourCycle: "h23"` is stated rather than left to a `hour12: false` default.
 * On the ICU build here the two produce byte-identical output at every hour of
 * the day, so this is a deliberate belt-and-braces choice, not a fix for a
 * difference anyone has observed: the hour cycle is the one formatting decision
 * where "24:30" would be silently wrong rather than obviously wrong, and
 * naming h23 says that without making the reader check the ICU version. A test
 * pins it so the intent survives the next person tidying the options away.
 */
export function farmTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: FARM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/**
 * The farm's calendar date as a Date, for handing to a Postgres `date` column.
 *
 * The subtle part, and the reason this is a function rather than a `new Date()`
 * at every call site: the value is **UTC midnight of the farm's date**, NOT the
 * instant that reads as midnight in Kenya.
 *
 * Those differ by three hours, and the difference decides which day lands in the
 * database. `Attendance.date` is `@db.Date` — a Postgres `date`, no time, no
 * zone — and Postgres casts the JS Date it is handed using the *session*
 * timezone, which DEPLOY-HARDENING.md pins to UTC. So:
 *
 *   Date.UTC(2026, 9, 6)          -> stored as 2026-10-06   correct
 *   Date.UTC(2026, 9, 6, 0 - 3)   -> stored as 2026-10-05   a day early
 *
 * Building it as "the instant whose EAT reading is 00:00" is the obvious move
 * and it is wrong: it looks like it accounts for the offset, and instead it
 * walks the record back into the previous day. UTC midnight keeps the write and
 * the read in agreement, because rows come back from Postgres as UTC midnight
 * too, which is what `isFarmToday` below relies on.
 */
export function farmDayStart(now: Date = new Date()): Date {
  const [year, month, day] = farmDate(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Does this stored record belong to today's farm day?
 *
 * Rows come back from Postgres as UTC midnight, so `toISOString().slice(0, 10)`
 * is the right way to read the stored day — it just has to be compared against
 * an equally-UTC `farmDate`. Both ends live in this one function so they cannot
 * drift apart again, which is how the original bug happened: a `todayStr`
 * computed in one zone and compared against a record normalised in another.
 */
export function isFarmToday(stored: Date | string, now: Date = new Date()): boolean {
  const asDate = stored instanceof Date ? stored : new Date(stored);
  if (Number.isNaN(asDate.getTime())) return false;
  return asDate.toISOString().slice(0, 10) === farmDate(now);
}
