/**
 * Fertiliser subsidy, as a cost line (gap report §2 B5).
 *
 * The KIAMIS export already proves a farmer is ELIGIBLE. This is about what
 * happened afterwards, and the reason it needs its own arithmetic is one
 * mistake with real consequences: **counting a subsidy as income, or as a
 * discount on cost, silently understates what a crop cost to grow.**
 *
 * The e-voucher is a transfer, not a sale. The farmer pays `farmerContribution`
 * at the dealer and the programme covers the rest. So:
 *
 *  - The **input cost** is the cash that left the farmer's hands.
 *  - The **face value** is disclosed beside it, never added to income and never
 *    netted off the cost to produce a flattering number.
 *  - Cost per kg, where the voucher records a quantity, uses **cash only** —
 *    because that is what the farmer must earn back before the crop pays.
 *
 * No agricultural advice and no programme terms appear here: the 2025 NFSP price
 * and procedure are not 2026 terms (gap report §5), so nothing about them is
 * asserted in a farmer-facing number.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface VoucherRecord {
  id: number;
  /** nfsp | kcep_cral | county | other — free text, programmes rename themselves. */
  program: string;
  dealer: string | null;
  /** The face value the programme covered. NOT income. */
  voucherValue: number;
  /** What the farmer actually paid. THIS is the cost. */
  farmerContribution: number;
  quantityKg: number | null;
  inputName: string | null;
  redeemedOn: Date;
  cropId: number | null;
  plotId: number | null;
}

export interface SubsidySplit {
  id: number;
  /** Total value of the inputs received. */
  totalValue: number;
  /** Cash the farmer paid — the cost. */
  cashPaid: number;
  /** Value covered by the programme — a transfer, disclosed separately. */
  subsidyValue: number;
  /** Subsidy as a share of the total value, when the total is above zero. */
  subsidySharePct: number | null;
}

export function subsidySplit(v: VoucherRecord): SubsidySplit {
  const face = Number(v.voucherValue) || 0;
  const cash = Number(v.farmerContribution) || 0;
  const total = face + cash;
  return {
    id: v.id,
    totalValue: r2(total),
    cashPaid: r2(cash),
    subsidyValue: r2(face),
    subsidySharePct: total > 0 ? Math.round((face / total) * 1000) / 10 : null,
  };
}

export interface VoucherTotals {
  redemptions: number;
  /** Total face value received across redemptions — a transfer, not income. */
  subsidyValue: number;
  /** Cash the farmer actually spent on these inputs. */
  cashPaid: number;
  totalValue: number;
  subsidySharePct: number | null;
  /**
   * Cash paid per kg, over the vouchers that recorded BOTH a quantity and a
   * price. A voucher whose quantity nobody wrote down cannot be priced, and
   * dividing its cash by someone else's kilos would produce a figure with no
   * meaning at all.
   */
  cashPerKg: number | null;
  byProgram: { program: string; redemptions: number; subsidyValue: number; cashPaid: number }[];
}

export function voucherTotals(records: VoucherRecord[]): VoucherTotals {
  let subsidy = 0;
  let cash = 0;
  // Kept apart from `cash`: only money spent on inputs whose quantity is known
  // can carry a price per kg.
  let cashWithQuantity = 0;
  let kg = 0;
  const byProgram = new Map<string, { program: string; redemptions: number; subsidyValue: number; cashPaid: number }>();

  for (const v of records) {
    const s = subsidySplit(v);
    subsidy += s.subsidyValue;
    cash += s.cashPaid;
    if (v.quantityKg != null && v.quantityKg > 0) {
      kg += v.quantityKg;
      cashWithQuantity += s.cashPaid;
    }

    const key = v.program || "other";
    const bucket = byProgram.get(key) ?? { program: key, redemptions: 0, subsidyValue: 0, cashPaid: 0 };
    bucket.redemptions += 1;
    bucket.subsidyValue = r2(bucket.subsidyValue + s.subsidyValue);
    bucket.cashPaid = r2(bucket.cashPaid + s.cashPaid);
    byProgram.set(key, bucket);
  }

  const total = subsidy + cash;
  return {
    redemptions: records.length,
    subsidyValue: r2(subsidy),
    cashPaid: r2(cash),
    totalValue: r2(total),
    subsidySharePct: total > 0 ? Math.round((subsidy / total) * 1000) / 10 : null,
    cashPerKg: kg > 0 ? r2(cashWithQuantity / kg) : null,
    byProgram: [...byProgram.values()].sort((a, b) => b.subsidyValue - a.subsidyValue),
  };
}

export interface InputCostLine {
  /** What the crop actually cost the farmer, in cash. */
  cashCost: number;
  /** Inputs received, valued at what the programme covered them for. */
  nonCashValue: number;
  /** One line for the ledger, in the farmer's own words. */
  description: string;
  /** True when this row must NOT be booked as a transaction — no money moved. */
  nonCash: boolean;
}

/**
 * The ledger line for a redemption.
 *
 * `nonCash` is the load-bearing part: the subsidy half is returned as a line
 * that the transaction writer must refuse to store. Booking a transfer as
 * neither income nor expense is right, but the farmer still needs to see the
 * value they received — so it is shown on screen and kept out of the money
 * totals.
 */
export function inputCostLine(v: VoucherRecord): InputCostLine {
  const s = subsidySplit(v);
  const what = v.inputName?.trim() || "Inputs";
  const where = v.dealer?.trim() ? ` at ${v.dealer.trim()}` : "";
  return {
    cashCost: s.cashPaid,
    nonCashValue: s.subsidyValue,
    description: `${what}${where} (subsidy: KES ${s.subsidyValue.toLocaleString()})`,
    nonCash: s.cashPaid <= 0,
  };
}
