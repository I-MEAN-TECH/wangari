/**
 * Co-op / group aggregates (gap-analysis rows 11 + 17).
 *
 * ── The rule this file exists to enforce ──────────────────────────────────────
 * A chairperson may see HOW MANY members are active and the GROUP TOTAL of
 * production. A chairperson may never see a member's own deliveries, sales,
 * credit, customers or profit.
 *
 * This is not enforced by hiding columns in the UI. It is enforced because the
 * only thing that ever leaves this module is a NUMBER and a COUNT, and the input
 * type here (`MemberRow`) carries no identifying fields to leak. A caller cannot
 * accidentally pass a member's price list and get it back, because there is no
 * field to pass it in.
 *
 * ── Why we suppress small groups ──────────────────────────────────────────────
 * A group of 2 members reporting a total means each member's figure is the
 * total minus the other, to the last shilling. That is a real privacy failure
 * wearing the costume of an aggregate, and it is the most likely way this
 * feature leaks. `SUPPRESS_BELOW` therefore suppresses any aggregate that would
 * reveal an individual — which for a *total* means any group with fewer than 3
 * contributing members. Per-member figures are never emitted at any group size.
 */

/** Aggregate figures are withheld below this many contributing members. */
export const SUPPRESS_BELOW = 3;

/**
 * One member farm's contribution, already reduced to counts and sums by the
 * query layer. Note what is absent: no name, no phone, no buyer, no price. If a
 * field like that ever appears here, the privacy boundary has been breached.
 */
export interface MemberRow {
  farmId: number;
  /** Distinct UTC days on which this member recorded anything at all. */
  activeDays: number;
  /** Species-aware output: eggs, litres or kg of weight gain. */
  outputQuantity: number;
  /** Farmers under this member's care — the things a group counts. */
  animalCount: number;
  /** Trees, plots and other crop units. */
  cropCount: number;
  /** Value of goods sold or delivered in the window. */
  moneyMoved: number;
}

export interface GroupAggregate {
  memberCount: number;
  /** Members with at least one active day in the window. */
  activeMemberCount: number;
  /** activeMemberCount / memberCount, 0–1. Null when there are no members. */
  activityRate: number | null;
  totalOutput: number;
  totalAnimals: number;
  totalCrops: number;
  totalMoneyMoved: number;
  /** True when every figure above is withheld for a small group. */
  suppressed: boolean;
  /** Why the figures are withheld, for the UI to state plainly. */
  suppressionReason: string | null;
}

/** Default window: one month. A co-op reviews deliveries monthly, not daily. */
export const ACTIVITY_WINDOW_DAYS = 30;

const SUPPRESSION_REASON =
  `Withheld: a group of fewer than ${SUPPRESS_BELOW} active members can have ` +
  `each member's own figures worked out by subtraction.`;

function sum(rows: MemberRow[], pick: (r: MemberRow) => number): number {
  // Every input is coerced with Number() because these arrive from Postgres
  // NUMERIC columns as strings. A JS `+` on "12" gives 12, but the moment one
  // value arrives as a Decimal object a naive reduce silently produces NaN, and
  // a NaN total renders as "KES NaN" on a chairperson's screen.
  return rows.reduce((s, r) => {
    const v = Number(pick(r));
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);
}

/**
 * Reduce member rows to the group figures a chair is allowed to see.
 *
 * Pure: no database, no clock, no identity. Everything it needs is an argument,
 * so the privacy boundary is testable without a fixture farm.
 */
export function aggregateGroup(rows: MemberRow[]): GroupAggregate {
  const memberCount = rows.length;
  const activeMemberCount = rows.filter((r) => Number(r.activeDays) > 0).length;

  // A group of zero members has no rate; 0/0 is NaN and NaN must never reach a
  // progress bar. Null means "no denominator", and the UI says so.
  const activityRate = memberCount === 0 ? null : activeMemberCount / memberCount;

  const base = {
    memberCount,
    activeMemberCount,
    activityRate,
    // While suppressed these are zeros, not nulls, so a consumer that renders
    // them cannot show a real number by accident — it shows nothing, because
    // the suppression flag tells it to hide the row entirely.
    totalOutput: 0,
    totalAnimals: 0,
    totalCrops: 0,
    totalMoneyMoved: 0,
    suppressed: true,
    suppressionReason: SUPPRESSION_REASON,
  };

  if (activeMemberCount < SUPPRESS_BELOW) {
    return base;
  }

  return {
    memberCount,
    activeMemberCount,
    activityRate,
    totalOutput: sum(rows, (r) => r.outputQuantity),
    totalAnimals: sum(rows, (r) => r.animalCount),
    totalCrops: sum(rows, (r) => r.cropCount),
    totalMoneyMoved: sum(rows, (r) => r.moneyMoved),
    suppressed: false,
    suppressionReason: null,
  };
}

/**
 * A one-line health statement for the chair. Phrased as encouragement or a
 * nudge, never as a judgement — a chair who is told "your co-op is failing"
 * loses the members who are the only ones recording.
 */
export function describeGroupHealth(agg: GroupAggregate): string {
  if (agg.memberCount === 0) return "No members yet. Send the first invite.";
  if (agg.suppressed) {
    return `${agg.memberCount} member${agg.memberCount === 1 ? "" : "s"}. Figures appear once ${SUPPRESS_BELOW} members are recording.`;
  }
  const rate = Math.round((agg.activityRate ?? 0) * 100);
  if (rate >= 70) return `${agg.activeMemberCount} of ${agg.memberCount} members recorded this month.`;
  if (rate >= 30) return `${agg.activeMemberCount} of ${agg.memberCount} members recorded this month. Worth a reminder.`;
  return `${agg.activeMemberCount} of ${agg.memberCount} members recorded this month. Most are quiet.`;
}

/** Band a member's activity for display. Never exposes their figures. */
export type MemberActivity = "active" | "quiet" | "silent";

/**
 * Classify one member from its active-day count alone.
 *
 * The thresholds are deliberately about CONSISTENCY, not volume: a farmer
 * delivering 4 litres every day and a farmer delivering 400 litres twice a month
 * are both recording, and a chair who only sees "big farmer" stops chasing the
 * small ones who are equally bankable once they have a history.
 */
export function memberActivity(activeDays: number, windowDays = ACTIVITY_WINDOW_DAYS): MemberActivity {
  const d = Number(activeDays);
  if (!Number.isFinite(d) || d <= 0) return "silent";
  if (d >= Math.max(2, Math.floor(windowDays * 0.25))) return "active";
  return "quiet";
}