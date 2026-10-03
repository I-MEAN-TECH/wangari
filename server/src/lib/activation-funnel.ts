/**
 * Activation funnel — the one number that says whether Wangari is working.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * We reordered this entire product on 2 Oct 2026 because a manual audit found
 * 5 of 8 farms had never recorded anything. That audit was one person's one SQL
 * query on one afternoon. Nothing about it was repeatable, so nothing about it
 * would have been re-checked, and we would have gone straight back to shipping
 * features on a guess.
 *
 * This is the same measurement, made pure, made weekly, and made incapable of
 * flattering us. The three rules that keep it honest are documented in
 * `activation-funnel.test.ts` and are worth restating here, because the code
 * only makes sense if you know why it is written the way it is:
 *
 *  1. STEP-TO-STEP, NOT COUNT-TO-COUNT. "onboarded / signups" mixes two
 *     different populations whenever some accounts predate the instrumentation.
 *     Every rate is computed on the intersection: of the users who took the
 *     previous step, how many took this one.
 *  2. NO NaN. An empty funnel has no denominator. It reads as 0, because this
 *     number is shown to a founder and quoted to investors.
 *  3. SAY WHAT WE CANNOT SEE. Users with zero events are *untracked*, not
 *     *unactivated*. They are reported separately so the coverage of the
 *     instrumentation is visible next to the result it produces.
 *
 * Pure by construction: no DB, no clock, no randomness. The route does the I/O
 * and the tests do not need a database at all.
 */

/** The four observations that make up the funnel. */
export type FunnelStage =
  | "signup"            // the account was created
  | "onboarding_completed" // the farm was claimed
  | "first_record"      // the farmer recorded something real
  | "active";           // the farmer opened the app on this UTC day

export const FUNNEL_STAGES: FunnelStage[] = [
  "signup",
  "onboarding_completed",
  "first_record",
  "active",
];

/** Days after the FIRST RECORD at which a return counts as the habit forming. */
export const RETURN_WINDOW_DAYS = 7;

export interface FunnelEvent {
  userId: number;
  stage: FunnelStage;
  /** `YYYY-MM-DD`, UTC. One event per user per stage per day. */
  day: string;
}

export interface FunnelStep {
  id: FunnelStage;
  /** Users who reached this step, counted on the intersection with the previous. */
  count: number;
  /** Users who took the previous step — the denominator for `rate`. */
  denominator: number;
  /** 0..1. 0 when there is no denominator, never NaN. */
  rate: number;
  /** denominator - count. How many people we lost here. */
  lost: number;
  label: string;
}

export interface FunnelReport {
  /** Raw, independent distinct-user counts — what actually happened. */
  signups: number;
  onboardingCompleted: number;
  firstRecord: number;
  returnedDay7: number;

  /** The three meaningful transitions, in order. `active` is not a step. */
  steps: FunnelStep[];

  /** Of everyone who signed up, how many ever recorded. 0..1. */
  signupToFirstRecordRate: number;

  /**
   * Median whole days from signup to first record, for users who did both.
   * 0 when nobody has recorded yet. This is the number to watch weekly: if it
   * is climbing, the first-run experience is getting worse, even while the
   * absolute signup count rises.
   */
  medianDaysToFirstRecord: number;

  /** Accounts we cannot see at all — they predate the instrumentation. */
  untrackedUsers: number;
  /** Tracked users as a fraction of all accounts, 0..1. */
  coverage: number;

  /** The step that lost the most people, or null when the funnel is empty. */
  biggestDropStep: Pick<FunnelStep, "id" | "label" | "lost"> | null;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Clamp to 0..1 and treat any non-finite input as 0. Never returns NaN. */
const ratio = (part: number, whole: number): number => {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
};

/**
 * `YYYY-MM-DD` → a whole number of days since the epoch, UTC.
 *
 * Date arithmetic on `YYYY-MM-DD` strings is the classic source of off-by-one
 * funnels: "7 days later" quietly becomes 6, or 8, depending on the month
 * length and whether someone parses in local time. Converting once to an
 * integer day index and doing integer subtraction removes the whole class of
 * bug. Returns null for anything that is not a real calendar date, so a bad
 * row is dropped rather than poisoning a rate.
 */
export function dayIndex(day: string): number | null {
  if (typeof day !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Rejects 2026-02-31 and friends, which Date.UTC would happily roll over.
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.floor(t / 86_400_000);
}

const isStage = (s: unknown): s is FunnelStage =>
  typeof s === "string" && (FUNNEL_STAGES as string[]).includes(s);

/**
 * Earliest valid day per user per stage.
 *
 * "Earliest" is the whole point: a farmer's *first* record is a moment, and
 * their return window is anchored to it. Storing the last event instead would
 * quietly move the anchor every time they open the app and make the day-7
 * metric meaningless.
 */
function earliestDays(events: FunnelEvent[]): Map<number, Map<FunnelStage, number>> {
  const byUser = new Map<number, Map<FunnelStage, number>>();
  for (const e of events) {
    if (!e || !isStage(e.stage)) continue;
    const d = dayIndex(e.day);
    if (d === null) continue;
    let stages = byUser.get(e.userId);
    if (!stages) {
      stages = new Map();
      byUser.set(e.userId, stages);
    }
    const prev = stages.get(e.stage);
    if (prev === undefined || d < prev) stages.set(e.stage, d);
  }
  return byUser;
}

// ── the report ──────────────────────────────────────────────────────────────

export function computeFunnel(
  events: FunnelEvent[],
  opts: { totalUsers?: number } = {}
): FunnelReport {
  const byUser = earliestDays(events);
  const users = [...byUser.keys()];

  const has = (u: number, s: FunnelStage) => byUser.get(u)?.has(s) ?? false;
  const dayOf = (u: number, s: FunnelStage) => byUser.get(u)!.get(s)!;

  // Raw independent counts — these are what actually happened.
  const signupUsers = users.filter((u) => has(u, "signup"));
  const onboardedUsers = users.filter((u) => has(u, "onboarding_completed"));
  const recordedUsers = users.filter((u) => has(u, "first_record"));

  // Day-7 return, anchored to the first record. Measured forward only: being
  // active *before* you ever recorded is a login, not a habit, and counting it
  // would be the single easiest way to make this metric look good while the
  // product is failing.
  const returned = recordedUsers.filter((u) => {
    const started = dayOf(u, "first_record");
    const activeDays = events
      .filter((e) => e.userId === u && e.stage === "active")
      .map((e) => dayIndex(e.day))
      .filter((d): d is number => d !== null);
    return activeDays.some((d) => d >= started + RETURN_WINDOW_DAYS);
  });

  // ── the three transitions, each on its own intersection ──
  const step = (
    id: FunnelStage,
    label: string,
    population: number[],
    passed: (u: number) => boolean
  ): FunnelStep => {
    const count = population.filter(passed).length;
    const denominator = population.length;
    return {
      id,
      label,
      count,
      denominator,
      rate: ratio(count, denominator),
      lost: Math.max(0, denominator - count),
    };
  };

  const steps: FunnelStep[] = [
    step("onboarding_completed", "Claimed their farm", signupUsers, (u) => has(u, "onboarding_completed")),
    step("first_record", "Recorded something", onboardedUsers, (u) => has(u, "first_record")),
    step("active", "Came back on day 7", recordedUsers, (u) => returned.includes(u)),
  ];

  // ── days from signup to first record ──
  // Only for users who did both, and never negative: a record that predates the
  // signup row is a data-integrity failure, not a signal, and a negative number
  // here would be exactly the sort of thing that destroys trust in the whole
  // dashboard.
  const gaps = users
    .filter((u) => has(u, "signup") && has(u, "first_record"))
    .map((u) => dayOf(u, "first_record") - dayOf(u, "signup"))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const medianDaysToFirstRecord = gaps.length
    ? gaps[Math.floor((gaps.length - 1) / 2)]
    : 0;

  const trackedUsers = byUser.size;
  const totalUsers = opts.totalUsers ?? trackedUsers;
  const untrackedUsers = Math.max(0, totalUsers - trackedUsers);

  // The step that lost the most people. Ties go to the earliest step, because
  // an earlier loss is the more fixable one — you cannot lose a farmer at day
  // 7 from a step they never reached.
  const withLoss = steps.filter((s) => s.lost > 0);
  const biggestDropStep = withLoss.length
    ? withLoss.reduce((a, b) => (b.lost > a.lost ? b : a))
    : null;

  return {
    signups: signupUsers.length,
    onboardingCompleted: onboardedUsers.length,
    firstRecord: recordedUsers.length,
    returnedDay7: returned.length,

    steps,
    signupToFirstRecordRate: ratio(recordedUsers.filter((u) => has(u, "signup")).length, signupUsers.length),
    medianDaysToFirstRecord,
    untrackedUsers,
    coverage: ratio(trackedUsers, totalUsers),
    biggestDropStep: biggestDropStep
      ? { id: biggestDropStep.id, label: biggestDropStep.label, lost: biggestDropStep.lost }
      : null,
  };
}