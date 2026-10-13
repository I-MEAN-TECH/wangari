/**
 * The forward view: what is coming in, what is going out, and which month looks
 * tight (gap report §3 C4).
 *
 * The doc is specific that this must "extend the ledger into a forward view; do
 * not build a new ledger". So nothing here writes money. It reads three things
 * the farm already has — what it is OWED, what it has PLANNED, what its loans
 * COST each month — projects them across a horizon, and labels every figure a
 * projection.
 *
 * Rules:
 *  - **Money already overdue is never counted as income.** A co-op that is three
 *    months late is the normal case on this farm, not the exception. Overdue
 *    promises go in their own bucket, shown on screen and excluded from every
 *    opening balance, because a farmer budgeting on money that has not arrived is
 *    how a farm misses a school-fees deadline.
 *  - **Trailing costs are the farmer's own average**, not a benchmark, and the
 *    line says how many months it was averaged over. With less than a full month
 *    of history the projection says so rather than smoothing one week into a
 *    month.
 *  - **No balance is invented.** We do not track bank or M-Pesa balances, so the
 *    projection is a FLOW ("you will be down KES 8,000 in March"), never a
 *    closing bank balance. A made-up opening balance would make the whole
 *    projection fiction.
 */

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface OwedMoney {
  id: number;
  amount: number;
  /** The date the buyer promised. Null = no promise, so no date to project. */
  payBy: Date | null;
  label: string;
}

export interface PlannedItem {
  id: number;
  label: string;
  direction: "inflow" | "outflow";
  amount: number;
  dueOn: Date;
  /** once | weekly | monthly | seasonal */
  recurring: string | null;
  category: string | null;
}

export interface LoanCommitment {
  id: number;
  lender: string;
  instalmentAmount: number | null;
  firstInstalmentDue: Date | null;
  instalmentCount: number | null;
  /** Already repaid, so the remaining instalments can be worked out. */
  amountPaid: number;
}

export interface TrailingCost {
  label: string;
  monthlyAverage: number;
  /** How many months the average was taken over — printed, so it can be judged. */
  monthsAveraged: number;
}

export interface CashFlowInputs {
  owed: OwedMoney[];
  planned: PlannedItem[];
  loans: LoanCommitment[];
  trailingCosts: TrailingCost[];
  /** The farm's own stated monthly income it can rely on, when it has one. */
  regularMonthlyIncome?: number | null;
}

export interface CashFlowBucket {
  label: string;
  from: Date;
  to: Date;
  expectedIn: number;
  expectedOut: number;
  /** In − out. Negative means the month is projected short. */
  net: number;
  /** What each figure is made of, in the farmer's own labels. */
  lines: { label: string; amount: number; direction: "in" | "out" }[];
}

export interface OverdueBucket {
  /** Money whose promise date has already passed. Deliberately NOT projected. */
  amount: number;
  deliveries: number;
  /** The date the oldest promise was made for. */
  oldest: Date | null;
  note: string;
}

export interface CashFlow {
  horizonDays: number;
  buckets: CashFlowBucket[];
  overdue: OverdueBucket;
  totalIn: number;
  totalOut: number;
  net: number;
  /** The first month projected short, when there is one. */
  firstShortMonth: string | null;
  /** Plain sentences a farmer can act on, worst first. */
  warnings: string[];
  basis: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Month label built from the UTC parts, NOT from toLocaleString.
 *
 * The buckets are constructed at UTC midnight, and a local formatter in a
 * negative offset would render 1 October as "Sep" — a label that disagrees with
 * the month it is labelled. Building the string from the same UTC fields the
 * bucket was made from cannot drift.
 */
function monthLabel(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Project the next `horizonDays` in calendar months.
 *
 * Monthly buckets, not weekly: farm money moves on co-op payment cycles and
 * school terms, both monthly, and a weekly grid would produce four numbers where
 * the farmer has one decision.
 */
export function cashFlow(inputs: CashFlowInputs, on: Date = new Date(), horizonDays = 90): CashFlow {
  const horizonEnd = new Date(on.getTime() + horizonDays * DAY);
  const months: CashFlowBucket[] = [];
  let cursor = monthStart(on);
  while (cursor.getTime() <= horizonEnd.getTime()) {
    const next = addMonths(cursor, 1);
    months.push({
      label: monthLabel(cursor),
      from: cursor,
      // Exclusive end, so a payment on the 1st lands in one month only.
      to: next,
      expectedIn: 0,
      expectedOut: 0,
      net: 0,
      lines: [],
    });
    cursor = next;
  }
  const bucketFor = (d: Date) => months.find((m) => d.getTime() >= m.from.getTime() && d.getTime() < m.to.getTime());

  const add = (d: Date, amount: number, label: string, direction: "in" | "out") => {
    if (amount <= 0) return;
    const b = bucketFor(d);
    // A date outside the horizon is simply not shown. Stretching it into the
    // last bucket would put money in a month it does not belong to.
    if (!b) return;
    if (direction === "in") b.expectedIn += amount;
    else b.expectedOut += amount;
    b.lines.push({ label, amount: r2(amount), direction });
  };

  // ── Money owed, on the date the buyer promised ────────────────────────────
  let overdueAmount = 0;
  let overdueCount = 0;
  let overdueOldest: Date | null = null;
  for (const o of inputs.owed) {
    if (o.amount <= 0) continue;
    if (o.payBy == null) continue; // no promise, no date, nothing to project
    if (o.payBy.getTime() < on.getTime()) {
      overdueAmount += o.amount;
      overdueCount += 1;
      if (!overdueOldest || o.payBy.getTime() < overdueOldest.getTime()) overdueOldest = o.payBy;
      continue;
    }
    add(o.payBy, o.amount, o.label, "in");
  }

  // ── The plan ──────────────────────────────────────────────────────────────
  for (const p of inputs.planned) {
    const direction = p.direction === "inflow" ? "in" : "out";
    if (p.recurring === "monthly") {
      // Repeat across the horizon rather than once, which is the whole point of
      // marking something recurring.
      let d = p.dueOn;
      while (d.getTime() <= horizonEnd.getTime()) {
        add(d, p.amount, p.label, direction);
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
      }
    } else if (p.recurring === "weekly") {
      let d = p.dueOn;
      let guard = 0;
      while (d.getTime() <= horizonEnd.getTime() && guard++ < 60) {
        add(d, p.amount, p.label, direction);
        d = new Date(d.getTime() + 7 * DAY);
      }
    } else {
      add(p.dueOn, p.amount, p.label, direction);
    }
  }

  // ── Loan instalments still to come ────────────────────────────────────────
  for (const l of inputs.loans) {
    if (l.instalmentAmount == null || l.instalmentAmount <= 0 || l.firstInstalmentDue == null) continue;
    const total = l.instalmentCount ?? null;
    // How many instalments the payments so far have covered. Rounded DOWN, so a
    // partly-paid instalment still counts as outstanding — the farmer owes it.
    const covered = Math.floor((Number(l.amountPaid) || 0) / l.instalmentAmount);
    const remaining = total != null ? Math.max(0, total - covered) : null;

    let paid = 0;
    let index = covered;
    let guard = 0;
    while (guard++ < 60) {
      const due = new Date(
        Date.UTC(
          l.firstInstalmentDue.getUTCFullYear(),
          l.firstInstalmentDue.getUTCMonth() + index,
          l.firstInstalmentDue.getUTCDate()
        )
      );
      if (due.getTime() > horizonEnd.getTime()) break;
      if (remaining != null && paid >= remaining) break;
      add(due, l.instalmentAmount, `${l.lender} instalment`, "out");
      paid += 1;
      index += 1;
    }
  }

  // ── The farm's own trailing costs, repeated ───────────────────────────────
  for (const c of inputs.trailingCosts) {
    if (c.monthlyAverage <= 0) continue;
    for (const m of months) {
      add(m.from, c.monthlyAverage, `${c.label} (average)`, "out");
    }
  }

  // ── Regular income, when the farm stated one ──────────────────────────────
  const regular = Number(inputs.regularMonthlyIncome ?? 0);
  if (regular > 0) {
    for (const m of months) add(m.from, regular, "Regular monthly income", "in");
  }

  // A planned inflow and a historical average can land on the same day; the lines
  // are the audit trail for the totals, so they are left as they were entered
  // rather than merged.
  for (const m of months) {
    m.expectedIn = r2(m.expectedIn);
    m.expectedOut = r2(m.expectedOut);
    m.net = r2(m.expectedIn - m.expectedOut);
  }

  const totalIn = r2(months.reduce((s, m) => s + m.expectedIn, 0));
  const totalOut = r2(months.reduce((s, m) => s + m.expectedOut, 0));
  const firstShort = months.find((m) => m.net < 0) ?? null;

  const warnings: string[] = [];
  if (overdueAmount > 0) {
    warnings.push(
      `KES ${Math.round(overdueAmount).toLocaleString()} is already past the date you were promised, across ${overdueCount} deliver${overdueCount === 1 ? "y" : "ies"}. It is not counted in the months below — chase it before you plan on it.`
    );
  }
  if (firstShort) {
    warnings.push(
      `${firstShort.label} is projected to be KES ${Math.abs(Math.round(firstShort.net)).toLocaleString()} short based on what you owe, what you have planned and your own average costs.`
    );
  }
  const thinHistory = inputs.trailingCosts.filter((c) => c.monthsAveraged < 1);
  if (thinHistory.length) {
    warnings.push(
      `Your average cost is based on less than a full month of records for: ${thinHistory.map((c) => c.label).join(", ")}. Treat those months as rough.`
    );
  }

  return {
    horizonDays,
    buckets: months,
    overdue: {
      amount: r2(overdueAmount),
      deliveries: overdueCount,
      oldest: overdueOldest,
      note: "Excluded from the months below on purpose. Overdue money is a claim, not income.",
    },
    totalIn,
    totalOut,
    net: r2(totalIn - totalOut),
    firstShortMonth: firstShort ? firstShort.label : null,
    warnings,
    basis:
      "A projection from your own records — what you are owed, what you planned, your loan instalments and your own average costs. It is a forecast, not a bank balance, and it is not a promise about prices.",
  };
}

/** Month key for a date, exported so a route can group transactions identically. */
export const monthKeyOf = (d: Date) => monthKey(d);
