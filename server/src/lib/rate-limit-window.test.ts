import { describe, it, expect } from "vitest";
import {
  nextRetryWait,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  MIN_RETRY_WAIT_MS,
  WINDOW_MARGIN_MS,
} from "./rate-limit-window";

/**
 * These numbers come from the live account, not from a guess.
 *
 * Measured on UnoRouter with `space-bunny-alpha:free`:
 *   - "tell me the status of the farm" took 84,388ms and made ONE tool call.
 *   - A bare provider exchange, same key, same model, same moment: 1,249ms
 *     and 2,193ms.
 *
 * So the model is not slow. The 60-second free-tier window is, and it lands
 * between the two halves of every agentic turn: the call that decides to use
 * a tool, and the call that turns the tool's rows into a sentence.
 *
 * Every assertion below is about that gap and what we do in it.
 */

const T0 = 1_757_000_000_000;

describe("nextRetryWait", () => {
  it("sleeps until the provider's window actually opens, rather than guessing", () => {
    // Step 1 was accepted at T0. Step 2 is refused 200ms later. The slot
    // reopens at T0 + 60s, plus the margin.
    const got = nextRetryWait({ lastAcceptedAt: T0, now: T0 + 200, windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS });
    expect(got.reason).toBe("window");
    expect(got.opensAt).toBe(T0 + DEFAULT_RATE_LIMIT_WINDOW_MS + WINDOW_MARGIN_MS);
    expect(got.waitMs).toBe(DEFAULT_RATE_LIMIT_WINDOW_MS + WINDOW_MARGIN_MS - 200);
  });

  it("aims past the boundary, never exactly on it", () => {
    // A retry that lands on the closing edge of the minute is a coin flip,
    // and the loser of that coin flip costs a request from a budget of one a
    // minute. The margin is what makes this a plan rather than a wager.
    const got = nextRetryWait({ lastAcceptedAt: T0, now: T0, windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS });
    expect(got.opensAt! - T0).toBeGreaterThan(DEFAULT_RATE_LIMIT_WINDOW_MS);
  });

  it("does not retry instantly when the window is already open", () => {
    // If we get a 429 with no open window to wait for, the provider's
    // accounting disagrees with ours. Pausing briefly beats firing again
    // immediately: the refused requests still come out of the same budget.
    const got = nextRetryWait({ lastAcceptedAt: T0, now: T0 + 120_000, windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS });
    expect(got.reason).toBe("floor");
    expect(got.waitMs).toBe(MIN_RETRY_WAIT_MS);
  });

  it("has no deadline to invent when no call has ever succeeded", () => {
    // `null` is "unknown", not "now". Treating it as now produces a zero
    // wait and an instant retry, which is exactly the behaviour that turned
    // one refusal into a burst of refusals.
    const got = nextRetryWait({ lastAcceptedAt: null, now: T0 });
    expect(got.reason).toBe("floor");
    expect(got.waitMs).toBe(MIN_RETRY_WAIT_MS);
    expect(got.opensAt).toBeNull();
  });

  it("never holds the connection past the ceiling", () => {
    // nginx allows 120s of proxy_read_timeout on this route. Past the
    // ceiling the farmer watches a dead connection with no word, which is
    // worse than being told the wait was too long - so cap it and say why.
    const got = nextRetryWait({ lastAcceptedAt: T0, now: T0, windowMs: 600_000, maxWaitMs: 90_000 });
    expect(got.reason).toBe("ceiling");
    expect(got.waitMs).toBe(90_000);
  });

  it("keeps a single sleep inside the proxy timeout on this route", () => {
    // The reason the schedule exists at all: it has to outlast the 60s free
    // window or step 2 of every job fails, and stay under 120s or the farmer
    // loses the connection mid-answer.
    const got = nextRetryWait({ lastAcceptedAt: T0, now: T0, windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS, maxWaitMs: 90_000 });
    expect(got.waitMs).toBeGreaterThan(60_000);
    expect(got.waitMs).toBeLessThan(120_000);
  });

  it("gets shorter as the window runs out, instead of restarting", () => {
    // A second 429 inside the same minute must not buy another full minute.
    // Time already spent waiting counts.
    const first = nextRetryWait({ lastAcceptedAt: T0, now: T0 + 1_000 });
    const later = nextRetryWait({ lastAcceptedAt: T0, now: T0 + 20_000 });
    expect(later.waitMs).toBeLessThan(first.waitMs);
    expect(later.waitMs).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_MS);
  });

  it("rejects nonsense instead of returning NaN into a setTimeout", () => {
    // A NaN wait is a zero wait to setTimeout. That is the burst bug again,
    // reached by a different road.
    for (const lastAcceptedAt of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const got = nextRetryWait({ lastAcceptedAt, now: T0 });
      expect(Number.isFinite(got.waitMs)).toBe(true);
      expect(got.waitMs).toBeGreaterThan(0);
    }
  });

  it("is not fooled by a clock that has run backwards", () => {
    // `now` before `lastAcceptedAt` would make the window look open and
    // return a floor wait, which is survivable. Assert it stays finite and
    // positive rather than trusting NTP.
    const got = nextRetryWait({ lastAcceptedAt: T0, now: T0 - 30_000 });
    expect(Number.isFinite(got.waitMs)).toBe(true);
    expect(got.waitMs).toBeGreaterThanOrEqual(MIN_RETRY_WAIT_MS);
  });
});