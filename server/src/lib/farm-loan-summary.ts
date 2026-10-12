/**
 * Farm loan summary — the pure shape behind §3 C2 (the farmer's own debt).
 *
 * Wangari records a loan and every repayment; it never makes a credit decision.
 * This file turns a FarmLoan row (principal, amount paid, instalment plan) into
 * the numbers the farmer actually reads: what is still owed, which instalment is
 * next, and whether anything is overdue.
 *
 * The honesty rule: if the loan has no instalment plan (no first due date or no
 * count), we still report the balance honestly but do not fabricate a schedule.
 * A loan with no plan is just "principal minus paid" — nothing more.
 */

export interface FarmLoanSummaryInput {
  principal: number;
  amountPaid: number;
  firstInstalmentDue: Date | null;
  instalmentCount: number | null;
  instalmentAmount: number | null;
  status: string;
  /** "today" injected so tests don't depend on the wall clock */
  today: Date;
}

export interface InstalmentLine {
  index: number; // 1-based
  dueDate: Date;
  amount: number | null;
  paid: boolean;
  missed: boolean;
}

export interface FarmLoanSummary {
  balance: number;
  paidPct: number;
  /** the next instalment due date not yet covered by payments, or null */
  nextInstalmentDue: Date | null;
  missedInstalments: number;
  isArrears: boolean;
  daysInArrears: number | null;
  schedule: InstalmentLine[];
  status: string;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Build the monthly instalment schedule from the loan's plan.
 * Returns [] when there is no plan (no first due date or no count).
 */
export function buildInstalmentSchedule(
  firstInstalmentDue: Date | null,
  instalmentCount: number | null,
  instalmentAmount: number | null,
): Date[] {
  if (!firstInstalmentDue || !instalmentCount || instalmentCount <= 0) return [];
  const dates: Date[] = [];
  const first = startOfDay(firstInstalmentDue);
  for (let i = 0; i < instalmentCount; i++) {
    dates.push(addMonths(first, i));
  }
  return dates;
}

/**
 * How many whole instalments the payments so far cover.
 * Returns null when there is no per-instalment amount (then we can't map
 * money to instalments and the schedule is purely informational).
 */
export function paidInstalmentCount(
  amountPaid: number,
  instalmentAmount: number | null,
): number | null {
  if (!instalmentAmount || instalmentAmount <= 0) return null;
  return Math.floor(amountPaid / instalmentAmount);
}

/**
 * Shape one loan into its readable summary.
 *
 * Missed = a due date in the past that the payments so far do not cover.
 * We never call a loan "in arrears" against a date that was never promised —
 * if there is no plan, isArrears is false and missedInstalments is 0.
 */
export function summarizeFarmLoan(input: FarmLoanSummaryInput): FarmLoanSummary {
  const principal = Math.max(0, input.principal);
  const amountPaid = Math.max(0, Math.min(input.amountPaid, principal));
  const balance = Math.round((principal - amountPaid) * 100) / 100;
  const paidPct = principal > 0 ? Math.round((amountPaid / principal) * 1000) / 10 : 0;

  const dueDates = buildInstalmentSchedule(
    input.firstInstalmentDue,
    input.instalmentCount,
    input.instalmentAmount,
  );
  const paidCount = paidInstalmentCount(amountPaid, input.instalmentAmount);

  const today = startOfDay(input.today);
  const schedule: InstalmentLine[] = dueDates.map((dueDate, i) => {
    const index = i + 1;
    const paid = paidCount !== null ? index <= paidCount : false;
    const missed = !paid && dueDate < today;
    return { index, dueDate, amount: input.instalmentAmount, paid, missed };
  });

  const nextInstalment = schedule.find((s) => !s.paid) ?? null;
  const missedInstalments = schedule.filter((s) => s.missed).length;
  const oldestMissed = schedule.find((s) => s.missed) ?? null;
  const daysInArrears = oldestMissed
    ? Math.floor((today.getTime() - oldestMissed.dueDate.getTime()) / 86_400_000)
    : null;

  return {
    balance,
    paidPct,
    nextInstalmentDue: nextInstalment?.dueDate ?? null,
    missedInstalments,
    isArrears: missedInstalments > 0,
    daysInArrears,
    schedule,
    status: input.status,
  };
}
