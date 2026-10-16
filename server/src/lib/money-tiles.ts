/**
 * Money-shaped dashboard tiles for Free Core.
 *
 * The Free tier shows money the farmer already knows: cash on hand, what's
 * owed, what feed is left, what came in this week. None of these require a
 * paid module — they read from the ledger, the delivery log and the
 * inventory. The pure function keeps the math in one place so the route
 * cannot drift from the test.
 */

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface MoneyTileInputs {
  /** Sum of all income transactions in the current calendar month. */
  monthIncome: number;
  /** Sum of all expense transactions in the current calendar month. */
  monthExpense: number;
  /** Total KES still owed to this farm across all unpaid deliveries. */
  overdueReceivables: number;
  /** How many deliveries make up the overdue amount. */
  overdueDeliveriesCount: number;
  /** The oldest promised-pay date that has already passed. */
  oldestOverdueDate: Date | null;
  /** Sum of expected pay for deliveries in the last 7 days. */
  weeklyDeliveryRevenue: number;
  /** Number of deliveries in the last 7 days. */
  weeklyDeliveryCount: number;
  /** Total current feed stock in normalised units (bags, kg, whatever the
   *  farmer tracks in `Inventory.unit`). */
  feedStockUnits: number;
  /** Reorder level across all feed items, summed. */
  feedReorderUnits: number;
  /** KES value of inventory expiring in the next 30 days. */
  expiringInDays30Value: number;
  /** Count of inventory items expiring in the next 30 days. */
  expiringInDays30Count: number;
}

export type TileDirection = "up" | "down" | "neutral";

export interface MoneyTile {
  key: "cash_on_hand" | "overdue_receivables" | "feed_stock" | "weekly_delivery_revenue";
  label: string;
  /** KES or units, depending on the tile. */
  value: number;
  /** Optional count (deliveries, items, days). */
  count?: number;
  /** Sub-text for the dashboard, e.g. "oldest 22 days". */
  caption?: string;
  /** Net of two opposing numbers (income - expense). Negative = short. */
  delta?: number;
  /** Days since the oldest overdue. */
  daysOldest?: number;
  direction: TileDirection;
}

export interface MoneyTileResult {
  tiles: MoneyTile[];
  warnings: string[];
  /** Honest basis string — never claim a balance we don't have. */
  basis: string;
}

const k = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

export function computeMoneyTiles(input: MoneyTileInputs, on: Date = new Date()): MoneyTileResult {
  // ── Cash on hand: this month's income minus this month's expense ──────
  // The ledger is not a bank balance, so the number we display is a NET
  // FLOW for the month, not a closing balance. We clamp at zero in the
  // display, but keep the raw delta so the user can see how short they are.
  const monthNet = input.monthIncome - input.monthExpense;
  const cashTile: MoneyTile = {
    key: "cash_on_hand",
    label: "Cash on hand (this month)",
    value: Math.max(0, r2(monthNet)),
    delta: r2(monthNet),
    direction: monthNet < 0 ? "down" : monthNet > 0 ? "up" : "neutral",
    caption: input.monthIncome > 0
      ? `${k(input.monthIncome)} in · ${k(input.monthExpense)} out`
      : "No income recorded yet this month",
  };

  // ── Overdue receivables ───────────────────────────────────────────────
  const daysOldest = input.oldestOverdueDate
    ? Math.max(0, Math.floor((on.getTime() - input.oldestOverdueDate.getTime()) / DAY))
    : undefined;
  const overdueTile: MoneyTile = {
    key: "overdue_receivables",
    label: "Owed to you (overdue)",
    value: r2(input.overdueReceivables),
    count: input.overdueDeliveriesCount,
    daysOldest,
    direction: input.overdueReceivables > 0 ? "down" : "neutral",
    caption: input.overdueReceivables > 0 && daysOldest != null
      ? `oldest ${daysOldest} day${daysOldest === 1 ? "" : "s"}`
      : "Nothing overdue — well done",
  };

  // ── Feed stock vs reorder ─────────────────────────────────────────────
  // Sum across all feed items. If the total stock is below the total
  // reorder level, the tile is "low" — and "high" otherwise.
  const feedLow = input.feedStockUnits < input.feedReorderUnits;
  const feedTile: MoneyTile = {
    key: "feed_stock",
    label: "Feed in store",
    value: r2(input.feedStockUnits),
    direction: feedLow ? "down" : "neutral",
    caption: feedLow
      ? `below reorder level of ${r2(input.feedReorderUnits)}`
      : "stock is healthy",
  };

  // ── This week's delivery revenue ──────────────────────────────────────
  const weeklyTile: MoneyTile = {
    key: "weekly_delivery_revenue",
    label: "Delivery revenue (7 days)",
    value: r2(input.weeklyDeliveryRevenue),
    count: input.weeklyDeliveryCount,
    direction: input.weeklyDeliveryRevenue > 0 ? "up" : "neutral",
    caption: input.weeklyDeliveryCount > 0
      ? `${input.weeklyDeliveryCount} deliver${input.weeklyDeliveryCount === 1 ? "y" : "ies"} this week`
      : "no deliveries this week",
  };

  // ── Warnings: the three actionable items a free user can fix today ────
  const warnings: string[] = [];
  if (input.overdueReceivables > 0) {
    warnings.push(
      `${k(input.overdueReceivables)} is overdue across ${input.overdueDeliveriesCount} deliver${input.overdueDeliveriesCount === 1 ? "y" : "ies"}` +
        (daysOldest != null ? `, oldest ${daysOldest} days. Send a payment reminder from Deliveries.` : "."),
    );
  }
  if (feedLow) {
    const missing = Math.max(0, r2(input.feedReorderUnits - input.feedStockUnits));
    warnings.push(`Feed stock is below reorder level — about ${missing} units short. Restock before the next feed cycle.`);
  }
  if (input.expiringInDays30Value > 0 && input.expiringInDays30Count > 0) {
    warnings.push(
      `${input.expiringInDays30Count} inventory item${input.expiringInDays30Count === 1 ? "" : "s"} expiring in the next 30 days, worth about ${k(input.expiringInDays30Value)}. Use it first or rotate the batch.`,
    );
  }

  return {
    tiles: [cashTile, overdueTile, feedTile, weeklyTile],
    warnings,
    basis:
      "A monthly net flow, not a bank balance. Overdue money is owed, not received. Stock is current units in store, not units ordered. Numbers come from your own ledger, deliveries and inventory.",
  };
}
