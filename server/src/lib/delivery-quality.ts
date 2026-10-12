/**
 * Delivery money & milk quality — the maths behind the payout statement.
 *
 * Everything here is pure. The route supplies DB rows; this file decides what
 * they mean. That split is deliberate: a farmer takes these numbers to a
 * co-operative to argue a deduction, so the arithmetic must be answerable on
 * its own, without a database to interrogate — the same posture unit-economics
 * and record-grade already hold.
 *
 * ## Terms
 *
 * - **Gross** — what the delivery was worth at the agreed price.
 * - **Deductions** — what the co-op withholds from that delivery (AI service,
 *   agrovet credit, transport, fines). Each line has its own creditor invited
 *   by the butchery of reality: some are the co-op, some are the farmer's own
 *   loan being repaid for them.
 * - **Net expected** — gross minus every deduction. This is the number the
 *   payout slip should show.
 * - **Arrears** — net expected minus what was actually paid, on deliveries
 *   whose payment date has passed. A delivery awaiting its own due date is
 *   not arrears; that is the whole point of an expected-payment date.
 *
 * ## The quality-based milk payment frame (QBMP)
 *
 * Kenyan co-ops are moving to paying milk on measured quality: fat is priced
 * per kilogram delivered, and detected added water is deducted from the
 * *volume* paid for. We do NOT price quality here — a co-op's band table is
 * its own commercial term, and shelving a made-up band table into a farmer's
 * pocket would be exactly the kind of invented number this project refuses.
 * What we do is hold the measurements the slip shows, and compute the two
 * things that are arithmetic, not policy: effective price per litre paid, and
 * what a water deduction removed. If a co-op declares band pricing, the
 * farmer enters the unit price the slip shows; the effective-rate maths
 * still holds.
 */

/** Shape the route passes in — trimmed of relations it does not need. */
export interface DeductionRow {
  label: string;
  amount: number;
  /** Who the deduction is for — "co-op AI service", "SACCO loan 2026". Optional. */
  creditor?: string | null;
}

export interface DeliveryRow {
  commodity: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  expectedPay: number | null;
  paidAmount: number | null;
  date: Date;
  /** When the buyer promised to pay. Absent = no clock, no arrears. */
  payBy?: Date | null;
  deductions: DeductionRow[];
  /** Optional milk-quality test results, as shown on the co-op slip. */
  fatPct?: number | null;
  snfPct?: number | null;
  density?: number | null;
  addedWaterPct?: number | null;
  tpc?: number | null;
}

export interface PayoutLine {
  deliveryId?: number;
  date: Date;
  commodity: string;
  quantity: number;
  unit: string;
  gross: number;
  deductionTotal: number;
  netExpected: number;
  paid: number;
  /** netExpected − paid. Positive = the buyer still owes money. */
  outstanding: number;
  /** true when the expected-payment date has passed and outstanding > tolerance */
  isArrears: boolean;
  /** days past the expected payment date, when isArrears */
  daysOverdue: number | null;
}

export interface PayoutSummary {
  lines: PayoutLine[];
  gross: number;
  deductions: number;
  netExpected: number;
  paid: number;
  outstanding: number;
  arrearsTotal: number;
  /** count of deliveries in arrears — the "how many slipped through" number */
  arrearsCount: number;
  /** longest-running arrears in days — the "how long have I been waiting" number */
  oldestArrearsDays: number | null;
  deductionsByCreditor: Record<string, number>;
}

/** KES 0.01 — money comparisons use this, never raw floating equality. */
export const MONEY_TOLERANCE = 0.01;

const round2 = (n: number) => Math.round(n * 100) / 100;

function netExpectedOf(d: DeliveryRow): { gross: number; ded: number; net: number } {
  const gross = d.expectedPay != null ? Number(d.expectedPay) : d.unitPrice != null ? Number(d.unitPrice) * d.quantity : 0;
  const ded = d.deductions.reduce((s, x) => s + Number(x.amount), 0);
  return { gross: round2(gross), ded: round2(ded), net: round2(gross - ded) };
}

/** One delivery → the line for the statement, including its arrears status. */
export function payoutLine(d: DeliveryRow, on: Date = new Date()): PayoutLine {
  const { gross, ded, net } = netExpectedOf(d);
  const paid = d.paidAmount != null ? Number(d.paidAmount) : 0;
  const outstanding = round2(net - paid);
  const isArrears = outstanding > MONEY_TOLERANCE && !!d.payBy && d.payBy.getTime() < on.getTime();
  const daysOverdue = isArrears ? Math.max(1, Math.floor((on.getTime() - d.payBy!.getTime()) / 86400000)) : null;
  return {
    date: d.date,
    commodity: d.commodity,
    quantity: Number(d.quantity),
    unit: d.unit,
    gross,
    deductionTotal: ded,
    netExpected: net,
    paid: round2(paid),
    outstanding,
    isArrears,
    daysOverdue,
  };
}

/** All deliveries → the statement summary (routes should pass newest-first rows). */
export function payoutSummary(rows: DeliveryRow[], on: Date = new Date()): PayoutSummary {
  const lines = rows.map((d) => payoutLine(d, on));
  const gross = round2(lines.reduce((s, l) => s + l.gross, 0));
  const deductions = round2(lines.reduce((s, l) => s + l.deductionTotal, 0));
  const netExpected = round2(lines.reduce((s, l) => s + l.netExpected, 0));
  const paid = round2(lines.reduce((s, l) => s + l.paid, 0));
  const outstanding = round2(netExpected - paid);
  const arrears = lines.filter((l) => l.isArrears);
  const arrearsTotal = round2(arrears.reduce((s, l) => s + l.outstanding, 0));
  const oldestArrearsDays = arrears.length ? Math.max(...arrears.map((l) => l.daysOverdue ?? 0)) : null;
  const deductionsByCreditor: Record<string, number> = {};
  for (const d of rows) {
    for (const x of d.deductions) {
      const key = x.creditor || x.label || "Unlabelled";
      deductionsByCreditor[key] = round2((deductionsByCreditor[key] ?? 0) + Number(x.amount));
    }
  }
  return { lines, gross, deductions, netExpected, paid, outstanding, arrearsTotal, arrearsCount: arrears.length, oldestArrearsDays, deductionsByCreditor };
}

/**
 * Effective price actually received per unit, after deductions.
 *
 * This is the number that decides whether a cow is worth feeding: "the slip
 * said 42 shillings but my 345 litres paid me 11,000" is a 31.9 figure, not
 * 42. Deductions are real money leaving the delivery, whatever they are for.
 * Returns null when the delivery has no gross to divide by — a null tells the
 * farmer an honest "not enough recorded" instead of pretending zero.
 */
export function effectiveUnitPriceKes(d: DeliveryRow): number | null {
  const { gross, ded, net } = netExpectedOf(d);
  if (gross <= 0 || Number(d.quantity) <= 0) return null;
  return round2(net / Number(d.quantity));
}

/**
 * Milk-quality view of one delivery — the QBMP parameters without pretending
 * to grade. A field that was never tested stays null; the UI should show
 * "not tested", not 0. Unchanged if all quality fields are null (untouched rows).
 */
export interface MilkQualityView {
  fatPct: number | null;
  snfPct: number | null;
  density: number | null;
  addedWaterPct: number | null;
  tpc: number | null;
  /** litres+kilograms of fat implied by delivery × fat test, for co-op crosschecks */
  impliedFatKg: number | null;
  /** litres the water deduction removed, if added water was measured */
  waterPenaltyLitres: number | null;
}

export function milkQualityView(d: DeliveryRow, on: Date = new Date()): MilkQualityView {
  const fatPct = d.fatPct ?? null;
  const impliedFatKg = fatPct != null && Number(d.quantity) > 0 ? round2((Number(d.quantity) * fatPct) / 100) : null;
  const aw = d.addedWaterPct ?? null;
  const waterPenalty = aw != null && aw > 0 && Number(d.quantity) > 0 ? round2((Number(d.quantity) * aw) / 100) : null;
  return {
    fatPct, snfPct: d.snfPct ?? null, density: d.density ?? null, tpc: d.tpc ?? null, addedWaterPct: aw,
    impliedFatKg, waterPenaltyLitres: waterPenalty,
  };
}
