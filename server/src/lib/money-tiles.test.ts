import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeMoneyTiles, type MoneyTileInputs } from "../lib/money-tiles.js";

/**
 * Money-shaped dashboard tiles for Free Core.
 *
 * The Free Core tier shows money the farmer already knows: cash on hand,
 * what's owed, what's expiring, this week's egg delivery revenue. None of
 * these require a paid module — they read from the ledger, the delivery
 * log, and the inventory. The tiles are the first thing the user sees;
 * getting them right is the single highest-impact change in the free tier.
 */
describe("computeMoneyTiles", () => {
  const empty: MoneyTileInputs = {
    monthIncome: 0,
    monthExpense: 0,
    overdueReceivables: 0,
    overdueDeliveriesCount: 0,
    oldestOverdueDate: null,
    weeklyDeliveryRevenue: 0,
    weeklyDeliveryCount: 0,
    feedStockUnits: 0,
    feedReorderUnits: 0,
    expiringInDays30Value: 0,
    expiringInDays30Count: 0,
  };

  it("returns four tiles plus warnings", () => {
    const t = computeMoneyTiles(empty);
    expect(t.tiles).toHaveLength(4);
    expect(Array.isArray(t.warnings)).toBe(true);
  });

  it("Cash on Hand is month income minus month expense, never below zero in display", () => {
    const t = computeMoneyTiles({ ...empty, monthIncome: 50000, monthExpense: 18000 });
    const cash = t.tiles.find((x) => x.key === "cash_on_hand")!;
    expect(cash.label).toMatch(/Cash/i);
    expect(cash.value).toBe(32000);
    // Positive net flow is "up" — money in exceeded money out for the month.
    expect(cash.direction).toBe("up");
  });

  it("Cash on Hand flips to 'short' when expenses exceed income", () => {
    const t = computeMoneyTiles({ ...empty, monthIncome: 5000, monthExpense: 18000 });
    const cash = t.tiles.find((x) => x.key === "cash_on_hand")!;
    expect(cash.value).toBe(0);
    expect(cash.delta).toBe(-13000);
    expect(cash.direction).toBe("down");
  });

  it("Overdue receivables count and amount surface when > 0", () => {
    const t = computeMoneyTiles({
      ...empty,
      overdueReceivables: 12500,
      overdueDeliveriesCount: 3,
      oldestOverdueDate: new Date("2026-09-12"),
    });
    const overdue = t.tiles.find((x) => x.key === "overdue_receivables")!;
    expect(overdue.value).toBe(12500);
    expect(overdue.count).toBe(3);
    expect(overdue.daysOldest).toBeGreaterThan(0);
    expect(overdue.direction).toBe("down");
  });

  it("Overdue tile stays at zero with no count when there is nothing overdue", () => {
    const t = computeMoneyTiles(empty);
    const overdue = t.tiles.find((x) => x.key === "overdue_receivables")!;
    expect(overdue.value).toBe(0);
    expect(overdue.count).toBe(0);
    expect(overdue.direction).toBe("neutral");
  });

  it("Feed stock is 'low' when below reorder level, 'ok' when above", () => {
    const low = computeMoneyTiles({ ...empty, feedStockUnits: 20, feedReorderUnits: 100 });
    const lowTile = low.tiles.find((x) => x.key === "feed_stock")!;
    expect(lowTile.direction).toBe("down");

    const ok = computeMoneyTiles({ ...empty, feedStockUnits: 250, feedReorderUnits: 100 });
    const okTile = ok.tiles.find((x) => x.key === "feed_stock")!;
    expect(okTile.direction).toBe("neutral");
  });

  it("Weekly delivery revenue surfaces the count of deliveries", () => {
    const t = computeMoneyTiles({ ...empty, weeklyDeliveryRevenue: 8400, weeklyDeliveryCount: 7 });
    const wk = t.tiles.find((x) => x.key === "weekly_delivery_revenue")!;
    expect(wk.value).toBe(8400);
    expect(wk.count).toBe(7);
  });

  it("warnings surface when expiring inventory is significant", () => {
    const t = computeMoneyTiles({ ...empty, expiringInDays30Value: 8000, expiringInDays30Count: 4 });
    expect(t.warnings.some((w) => /expir/i.test(w) && /4/.test(w))).toBe(true);
  });

  it("no warnings when nothing is actionable", () => {
    const t = computeMoneyTiles(empty);
    expect(t.warnings).toHaveLength(0);
  });

  it("warnings surface when overdue money is large", () => {
    const t = computeMoneyTiles({ ...empty, overdueReceivables: 15000, overdueDeliveriesCount: 2 });
    expect(t.warnings.some((w) => /overdue|owed|chase/i.test(w))).toBe(true);
  });

  it("warnings surface when feed stock is below reorder", () => {
    const t = computeMoneyTiles({ ...empty, feedStockUnits: 10, feedReorderUnits: 100 });
    expect(t.warnings.some((w) => /feed|reorder/i.test(w))).toBe(true);
  });
});

/**
 * Wiring facts: the route must use the new aggregator, not re-implement
 * the four tile math inline. Drift between the test and a copy of the
 * math is the bug this prevents.
 */
describe("the dashboard route uses the money-tiles aggregator", () => {
  const route = readFileSync(join(process.cwd(), "src", "routes", "dashboard.ts"), "utf8").replace(/\r\n/g, "\n");

  it("imports computeMoneyTiles", () => {
    expect(route).toMatch(/import\s*\{[^}]*computeMoneyTiles[^}]*\}\s*from\s*"\.\.\/lib\/money-tiles\.js"/);
  });

  it("returns the four tiles in the response payload", () => {
    // The route calls computeMoneyTiles once into a local `moneyTiles`
    // and emits that in res.json. Both must be present.
    expect(route).toMatch(/computeMoneyTiles\(/);
    expect(route).toMatch(/moneyTiles/);
  });
});
