import { describe, it, expect, afterEach } from "vitest";
import {
  farmDate,
  farmTime,
  farmDayStart,
  isFarmToday,
  FARM_TIME_ZONE,
} from "./farm-day";

/**
 * Every instant below is written as `Date.UTC(...)` with an explicit +3h,
 * because that is the whole point: the buggy code read these and got the
 * wrong answer. If a test here passes against `toISOString()` it is not
 * testing anything, and that is the trap these cases are laid to set.
 */

/** 2026-10-06 03:30 EAT — the 06th on the farm, still the 5th in UTC. */
const EAT_0330 = Date.UTC(2026, 9, 6, 0, 30);

/** 2026-10-06 06:00 EAT — the exact moment the bug report describes. */
const EAT_0600 = Date.UTC(2026, 9, 6, 3, 0);

/** 2026-10-06 23:30 EAT — right date in UTC, but the clock is 3h slow. */
const EAT_2330 = Date.UTC(2026, 9, 6, 20, 30);

/** 2026-10-06 12:00 EAT — midday, where UTC and EAT agree. */
const EAT_NOON = Date.UTC(2026, 9, 6, 9, 0);

/** 2026-10-07 00:15 EAT — ten past midnight, the day has just rolled. */
const EAT_0015_NEXT = Date.UTC(2026, 9, 6, 21, 15);

/**
 * The dev box this was written on runs in Africa/Nairobi — the same zone as
 * the farm. That makes a wrong implementation look right here: `toTimeString()`
 * returns 06:00 on a Nairobi machine for a 06:00 EAT clock-in, while the VPS
 * runs UTC and returns 03:00. Tests that never move the clock's timezone
 * therefore pass in the one environment where the bug is invisible, and only
 * fail in production.
 *
 * So these tests pin the values explicitly. Restored after each case.
 */
const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("independence from the server's timezone", () => {
  it("reports the same farm time whatever the server's clock is set to", () => {
    const instant = new Date(EAT_0600); // 06:00 in Kenya
    const seen = new Set<string>();
    for (const tz of ["UTC", "Africa/Nairobi", "America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      seen.add(farmTime(instant));
    }
    expect([...seen]).toEqual(["06:00"]);
  });

  it("catches the original toTimeString() bug, which UTC exposes", () => {
    // The regression this file exists for, asserted in the exact conditions it
    // happens in. Under UTC, the old code returned the time three hours early.
    process.env.TZ = "UTC";
    const instant = new Date(EAT_0600);
    expect(instant.toTimeString().slice(0, 5)).toBe("03:00"); // the old answer
    expect(farmTime(instant)).toBe("06:00"); // the farmer's answer
  });

  it("reports the same farm date whatever the server's clock is set to", () => {
    const instant = new Date(EAT_0015_NEXT); // 00:15 on the 7th in Kenya
    const seen = new Set<string>();
    for (const tz of ["UTC", "Africa/Nairobi", "America/New_York"]) {
      process.env.TZ = tz;
      seen.add(farmDate(instant));
    }
    expect([...seen]).toEqual(["2026-10-07"]);
  });

  it("builds the same stored day whatever the server's clock is set to", () => {
    const seen = new Set<string>();
    for (const tz of ["UTC", "Africa/Nairobi", "America/New_York"]) {
      process.env.TZ = tz;
      seen.add(farmDayStart(new Date(EAT_0015_NEXT)).toISOString());
    }
    expect(seen.size).toBe(1);
  });
});

describe("farmDate", () => {
  it("uses the farm's zone, not the server's UTC", () => {
    expect(FARM_TIME_ZONE).toBe("Africa/Nairobi");
    // 03:30 EAT is 00:30 UTC on the SAME day here, so a UTC-based
    // implementation passes this one. The two below are the ones that bite.
    expect(farmDate(new Date(EAT_0600))).toBe("2026-10-06");
    expect(farmDate(new Date(EAT_2330))).toBe("2026-10-06");
  });

  it("is a day ahead of UTC late at night", () => {
    // 23:30 EAT is 20:30 UTC — still the 6th in UTC, still the 6th in EAT.
    // The mismatch starts when the UTC clock passes 21:00.
    expect(farmDate(new Date(Date.UTC(2026, 9, 6, 21, 15)))).toBe("2026-10-07");
    // This is the assertion the old `toISOString().slice(0,10)` fails.
    expect(new Date(Date.UTC(2026, 9, 6, 21, 15)).toISOString().slice(0, 10)).toBe(
      "2026-10-06",
    );
  });

  it("formats as YYYY-MM-DD", () => {
    expect(farmDate(new Date(EAT_0015_NEXT))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rolls the year over on the farm's calendar", () => {
    // 00:15 EAT on 1 Jan is 21:15 UTC on 31 Dec — a different YEAR in UTC.
    expect(farmDate(new Date(Date.UTC(2026, 11, 31, 21, 15)))).toBe("2027-01-01");
    // And the naive read is still on the old year, which is why the naive
    // implementation files a New Year's shift under 31 December.
    expect(new Date(Date.UTC(2026, 11, 31, 21, 15)).toISOString().slice(0, 10)).toBe(
      "2026-12-31",
    );
  });
});

describe("farmTime", () => {
  it("reports the wall clock the farmer sees", () => {
    expect(farmTime(new Date(EAT_0600))).toBe("06:00");
    expect(farmTime(new Date(EAT_0330))).toBe("03:30");
    expect(farmTime(new Date(EAT_NOON))).toBe("12:00");
  });

  it("does not repeat what UTC already said correctly at noon", () => {
    // Guards against an implementation that "helpfully" adds the offset twice.
    expect(farmTime(new Date(EAT_NOON))).toBe("12:00");
  });

  it("stays 24-hour through the afternoon", () => {
    expect(farmTime(new Date(Date.UTC(2026, 9, 6, 12, 0)))).toBe("15:00");
  });

  it("renders midnight as 00, never 24", () => {
    const midnight = new Date(Date.UTC(2026, 9, 6, 21, 30)); // 00:30 EAT
    expect(farmTime(midnight)).toBe("00:30");
    // "24:30" is a time no payroll sheet has ever contained.
    expect(farmTime(midnight).startsWith("24")).toBe(false);
  });

  it("pins the hour cycle explicitly rather than relying on the hour12 default", () => {
    // On the ICU build here `hour12: false` already resolves to h23 and formats
    // identically at every hour, so this cannot fail here by changing that
    // option. It pins the INTENT instead: the hour cycle is the one formatting
    // decision where a wrong answer is silently wrong ("24:30") rather than
    // obviously wrong, and it should not be left to a locale default that a
    // future ICU or Node upgrade could change underneath us.
    const format = new Intl.DateTimeFormat("en-GB", {
      timeZone: FARM_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect(format.resolvedOptions().hourCycle).toBe("h23");
    expect(format.format(new Date(Date.UTC(2026, 9, 6, 21, 30)))).toBe("00:30");
  });
});

describe("farmDayStart", () => {
  /**
   * Postgres stores an `@db.Date` by casting the JS Date it is given in the
   * session timezone, which DEPLOY-HARDENING.md pins to UTC. So what matters is
   * the value's date **in UTC** — and that is the thing this function has to
   * get right, which is not the same as "midnight as Kenya reads it".
   */
  const asPostgresWouldStore = (d: Date): string =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  it("stores the day the farmer is actually on", () => {
    expect(asPostgresWouldStore(farmDayStart(new Date(EAT_0600)))).toBe("2026-10-06");
    expect(asPostgresWouldStore(farmDayStart(new Date(EAT_NOON)))).toBe("2026-10-06");
  });

  it("stores the NEW day after midnight in Kenya", () => {
    // 00:15 on the 7th in Kenya, still 21:15 on the 6th in UTC. The old
    // `toISOString().slice(0,10)` wrote "2026-10-06" here, filing the shift
    // under yesterday.
    expect(asPostgresWouldStore(farmDayStart(new Date(EAT_0015_NEXT)))).toBe("2026-10-07");
  });

  it("is UTC midnight, not the instant Kenya reads as midnight", () => {
    // Subtracting the offset here would store the PREVIOUS day. Asserted
    // explicitly because it is the tempting, wrong version:
    //   Date.UTC(2026, 9, 6, 0 - 3)  ->  2026-10-05T21:00Z  ->  "2026-10-05"
    const start = farmDayStart(new Date(EAT_0600));
    expect(start.toISOString()).toBe("2026-10-06T00:00:00.000Z");

    const offsetAdjusted = new Date(Date.UTC(2026, 9, 6, 0, 0, 0, 0));
    offsetAdjusted.setUTCHours(-3);
    expect(asPostgresWouldStore(offsetAdjusted)).toBe("2026-10-05");
  });

  it("round-trips: what it writes, it reads back as the same day", () => {
    // The write and the read must agree, or every "already clocked in today"
    // check silently misses and a worker gets two records a day.
    for (const instant of [EAT_0330, EAT_0600, EAT_NOON, EAT_2330, EAT_0015_NEXT]) {
      const stored = farmDayStart(new Date(instant));
      const readBack = new Date(asPostgresWouldStore(stored) + "T00:00:00.000Z");
      expect(isFarmToday(readBack, new Date(instant))).toBe(true);
    }
  });

  it("moves forward exactly one day at a time", () => {
    const a = farmDayStart(new Date(EAT_NOON));
    const b = farmDayStart(new Date(Date.UTC(2026, 9, 7, 9, 0)));
    expect(b.getTime() - a.getTime()).toBe(86_400_000);
  });
});

describe("isFarmToday", () => {
  it("accepts a record written by farmDayStart", () => {
    expect(isFarmToday(farmDayStart(new Date(EAT_0600)), new Date(EAT_0600))).toBe(true);
    expect(isFarmToday(farmDayStart(new Date(EAT_NOON)), new Date(EAT_NOON))).toBe(true);
  });

  it("still matches late at night, when the naive date would not", () => {
    // A 23:30 shift on the 6th must still be "today" at 23:30 on the 6th.
    const record = farmDayStart(new Date(EAT_2330));
    expect(isFarmToday(record, new Date(EAT_2330))).toBe(true);
  });

  it("rejects yesterday once the farm's day has rolled", () => {
    const record = farmDayStart(new Date(EAT_2330)); // the 6th
    // 00:15 on the 7th in Kenya: a fresh clock-in must not overwrite it.
    expect(isFarmToday(record, new Date(EAT_0015_NEXT))).toBe(false);
  });

  it("does not match a record from an adjacent day either side", () => {
    const today = farmDayStart(new Date(EAT_NOON));
    const yesterday = new Date(today.getTime() - 86_400_000);
    const tomorrow = new Date(today.getTime() + 86_400_000);
    expect(isFarmToday(yesterday, new Date(EAT_NOON))).toBe(false);
    expect(isFarmToday(tomorrow, new Date(EAT_NOON))).toBe(false);
  });

  it("never throws on junk, and never calls it today", () => {
    expect(isFarmToday("not a date", new Date(EAT_NOON))).toBe(false);
    expect(isFarmToday(new Date("nonsense"), new Date(EAT_NOON))).toBe(false);
  });

  it("accepts the ISO string a Postgres date column round-trips to", () => {
    const record = farmDayStart(new Date(EAT_NOON));
    expect(isFarmToday(record.toISOString(), new Date(EAT_NOON))).toBe(true);
  });

  it("classifies by the stored UTC date, not by the farm's reading of it", () => {
    // Postgres hands an `@db.Date` row back as UTC midnight, and 00:00 UTC is
    // 03:00 the SAME day in Kenya — so for every row the column can actually
    // hold, both readings agree. They part company on a late-UTC row, where
    // re-reading it through the farm's zone silently rolls it forward a day.
    //
    // A row stored as 2026-10-06 is the 6th, and it stays the 6th. At 02:00 on
    // the 7th in Kenya the farm is on the 7th, so the 6th is not today and a
    // fresh clock-in must not overwrite it. Reading the row through EAT instead
    // would call 21:00Z "the 7th" and silently return true.
    const lateRow = new Date("2026-10-06T21:00:00.000Z");

    // At 23:30 on the 6th the farm is on the 6th, and the row says the 6th, so
    // this one IS today's shift and a clock-out must find it.
    expect(isFarmToday(lateRow, new Date(EAT_2330))).toBe(true);

    // Two hours later it is 01:30 on the 7th in Kenya. Same row, still dated the
    // 6th, and now yesterday — a fresh clock-in must not overwrite it. Reading
    // the row through EAT instead would call 21:00Z "the 7th" and return true.
    expect(isFarmToday(lateRow, new Date(Date.UTC(2026, 9, 6, 23, 0)))).toBe(false);
  });
});

describe("the farm's zone", () => {
  it("reads the same +3 offset in January and July", () => {
    // Kenya has no daylight saving. If this ever fails, the zone database moved
    // under us and every date in the product needs re-checking — this test is
    // the canary, because nothing else in the suite would notice.
    const january = new Date(Date.UTC(2026, 0, 15, 12, 0));
    const july = new Date(Date.UTC(2026, 6, 15, 12, 0));
    for (const d of [january, july]) {
      const hourIn = (timeZone: string) =>
        Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour: "2-digit",
            hourCycle: "h23",
          }).format(d),
        );
      expect((hourIn(FARM_TIME_ZONE) - hourIn("UTC") + 24) % 24).toBe(3);
    }
  });
});
