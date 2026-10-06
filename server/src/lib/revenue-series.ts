/**
 * buildRevenueSeries — the data behind the dashboard's Revenue Overview.
 *
 * One bucket per calendar month, keyed `YYYY-MM`, sorted ascending. The key
 * matters as much as the sums: the frontend builds its own month labels on
 * the device (Nairobi), looks the buckets up by key, and can never render a
 * bar under the wrong month because a server timezone disagreed.
 *
 * `date` columns hold the farm's calendar day at UTC midnight, so buckets
 * are cut with UTC getters — a local-timezone read would move the 1st of
 * the month for any client west of UTC.
 *
 * Pure function on purpose: the route only passes rows through it, and the
 * unit test pins the boundary behaviour (month edges, year rollover,
 * rounding) that a live probe with this week's data cannot prove.
 */

export type RevenuePoint = { key: string; income: number; expenses: number };

export function buildRevenueSeries(
  txs: ReadonlyArray<{ date: Date | string; type: string; amount: unknown }>
): RevenuePoint[] {
  const buckets = new Map<string, { income: number; expenses: number }>();
  for (const tx of txs) {
    const d = new Date(tx.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? { income: 0, expenses: 0 };
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    if (tx.type === "income") bucket.income += amount;
    else if (tx.type === "expense") bucket.expenses += amount;
    else continue;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({ key, income: Math.round(v.income), expenses: Math.round(v.expenses) }));
}
