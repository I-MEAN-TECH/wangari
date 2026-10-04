/**
 * How long to wait after a 429 before trying again.
 *
 * Measured on the live account, this is where a whole farm question went:
 * "tell me the status of the farm" took 84 seconds and one tool call. The
 * tool call was correct and the answer was right - and 60 of those 84 seconds
 * were not the model thinking. A bare provider exchange on the same key,
 * same model, same moment, answered in 1.2-2.2 seconds.
 *
 * The difference is that UnoRouter's free tier accepts ONE request a minute,
 * account-wide. A farm job is two exchanges: one that decides to call a tool,
 * one that turns the tool's rows into a sentence. The second lands inside the
 * minute the first just used and comes back 429.
 *
 * The old schedule was a fixed [12s, 25s, 30s]. That is 67 seconds of
 * *guessing*, and every guess costs a request against a budget of one a
 * minute - so it fired into a closed window twice and only got through on the
 * third try. The provider told us exactly when the slot opens; the schedule
 * was not listening to it.
 *
 * So: remember when the provider last accepted a call, and sleep until that
 * minute is up. One wait, aimed, instead of three blind ones.
 */

/** How long the provider's window stays shut, when it will tell us. */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Landing exactly on the boundary loses the race. A little past the minute
 * is cheap; a retry that arrives 20ms early is another wasted request.
 */
export const WINDOW_MARGIN_MS = 400;

/**
 * Never retry faster than this. A 429 that arrives with no known window
 * behind it still gets a real pause - hammering a scarce endpoint with the
 * very requests that were just refused makes the queue longer, not shorter.
 */
export const MIN_RETRY_WAIT_MS = 2_000;

export interface RetryWaitInput {
  /**
   * When the provider last ACCEPTED a request from this key, or null if we
   * have not seen one succeed. `null` is not "now" - it is "unknown", and it
   * gets the floor wait rather than an invented deadline.
   */
  lastAcceptedAt: number | null;
  /** Now, same clock as `lastAcceptedAt`. */
  now: number;
  /** Length of the provider's shut window. */
  windowMs?: number;
  /** Ceiling on a single sleep. */
  maxWaitMs?: number;
  /** Floor on a single sleep. */
  minWaitMs?: number;
  /** Safety gap past the computed opening time. */
  marginMs?: number;
}

export interface RetryWait {
  /** Milliseconds to sleep before the next attempt. */
  waitMs: number;
  /**
   * "window" - we know when the slot opens and slept until it.
   * "floor"   - no known window; a plain pause.
   * "ceiling" - the window is further out than we are willing to hold an
   *             open connection, so we take what we can get and try again.
   */
  reason: "window" | "floor" | "ceiling";
  /** When the provider is expected to accept a request again, if known. */
  opensAt: number | null;
}

/**
 * Pick the wait for one retry after a 429.
 *
 * Pure on purpose: the decision is what is worth protecting here, and a
 * function that takes a clock returns the same answer for the same clock. The
 * socket around it is not what went wrong.
 */
export function nextRetryWait(input: RetryWaitInput): RetryWait {
  const {
    lastAcceptedAt,
    now,
    windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
    maxWaitMs = 90_000,
    minWaitMs = MIN_RETRY_WAIT_MS,
    marginMs = WINDOW_MARGIN_MS,
  } = input;

  // A window longer than the ceiling is unreachable by definition - holding
  // an SSE connection open for it would time out at nginx first, and the
  // farmer would watch a connection die with no word. Sleep the ceiling and
  // try again; the caller decides when to give up.
  const usableWindow = Math.min(Math.max(windowMs, 0), maxWaitMs);
  const ceiling = Math.max(maxWaitMs, minWaitMs);

  if (lastAcceptedAt === null || !Number.isFinite(lastAcceptedAt)) {
    return { waitMs: Math.min(minWaitMs, ceiling), reason: "floor", opensAt: null };
  }

  const opensAt = lastAcceptedAt + usableWindow + marginMs;
  const untilOpen = opensAt - now;

  if (untilOpen <= minWaitMs) {
    // The slot is already open, or all but open, and we still got a 429.
    // The provider's own accounting disagrees with our memory of it; take the
    // floor and let the next 429 re-decide.
    return { waitMs: minWaitMs, reason: "floor", opensAt };
  }

  if (untilOpen > ceiling) {
    return { waitMs: ceiling, reason: "ceiling", opensAt };
  }

  return { waitMs: untilOpen, reason: "window", opensAt };
}