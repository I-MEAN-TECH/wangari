import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { KG_PER_EGG, classifyExpense, type CostBucket } from "../lib/ledger-taxonomy.js";
import {
  attributeTransaction,
  type KnownEnterprises,
  type EnterpriseRef,
} from "../lib/ledger-attribution.js";
import { allocateFeedPool } from "../lib/ledger-feed.js";
import {
  pickBenchmark,
  describeAge,
  benchmarkAgeDays,
  STALE_DAYS,
  type PricePoint,
} from "../lib/market-price.js";
import {
  unitEconomics,
  commodityForEnterprise,
  benchmarkToCostUnit,
  type CommodityMapping,
  type UnitEconomics,
} from "../lib/unit-economics.js";

/** One row's market reference, when a defensible benchmark exists. */
type MarketRef = {
  commodity: string;
  region: string | null;
  source: string | null;
  ageLabel: string;
  stale: boolean;
};

/**
 * Profitability Scoreboard — which flock/block/pond actually makes money?
 *
 * Ranks every active enterprise by REAL profit computed from data already
 * flowing through the system:
 *   - Revenue: transactions attributed to the enterprise
 *   - Costs: expense transactions + recorded inputs (feed used × nothing
 *     unknown; inventory consumption is booked as expense transactions
 *     automatically by the production route)
 *
 * Metric shown: profit margin % and profit per shilling of feed — the
 * "feed efficiency" lens the user asked for.
 *
 * ─── What changed in M1 ───────────────────────────────────────────────────
 *
 * This route used to decide which enterprise a transaction belonged to by
 * checking whether a flock's **name** appeared inside `category` or
 * `description` (`matchEnterprise`). A flock called "Layers" claimed every row
 * mentioning layers, and `Map` iteration order picked the winner when two
 * names matched.
 *
 * Attribution is now `attributeTransaction` (lib/ledger-attribution.ts):
 * an explicit `flockId`/`cropId` first, then income-only inference **when
 * exactly one enterprise can match**, then general. Costs are additionally
 * split into canonical buckets by `classifyExpense` (lib/ledger-taxonomy.ts),
 * so `animal_feed` and `Bird Purchase` finally land in the same pile.
 *
 * The response shape is unchanged — the dashboard reads every field below.
 * New fields are additive: `costBreakdown`, `unit`, `outputUnits`, `costPerUnit`.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

/** Cost buckets, in the order they are worth showing a farmer. */
const BUCKET_ORDER: CostBucket[] = [
  "feed",
  "veterinary",
  "labour",
  "stock",
  "seed",
  "fertiliser",
  "equipment",
  "transport",
  "utilities",
  "other",
];

type Ent = {
  ref: EnterpriseRef;
  id: string;
  kind: "flock" | "crop" | "general";
  name: string;
  sub: string;
  species?: string | null;
  category?: string | null;
  cropType?: string | null;
  revenue: number;
  costs: number;
  feedCost: number;
  outputKg: number;
  outputUnits: number;
  /** What this enterprise sells. Decides the unit a cost is quoted per. */
  unit: "egg" | "litre" | "kg" | null;
  costsByBucket: Map<CostBucket, number>;
};

// GET /api/profitability
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const periodDays = Math.min(Number(req.query.days) || 90, 365);
    const since = new Date(Date.now() - periodDays * 86400000);

    const [flocks, crops, incomeTx, expenseTx, prodRows] = await Promise.all([
      prisma.flock.findMany({
        where: { farmId },
        select: { id: true, name: true, type: true, category: true, currentCount: true, status: true },
      }),
      prisma.crop.findMany({
        where: { farmId },
        select: { id: true, name: true, cropType: true, areaAcres: true, status: true },
      }),
      prisma.transaction.findMany({
        where: { farmId, type: "income", date: { gte: since } },
        select: {
          // `type` is REQUIRED: attributeTransaction's income-inference rule
          // checks `tx.type === "income"`, and without it every income row
          // silently fell through to "general" — the milk sale never reached
          // the dairy flock. The live probe now pins this.
          type: true,
          amount: true, category: true, description: true,
          flockId: true, cropId: true, enterpriseKind: true,
        },
      }),
      prisma.transaction.findMany({
        where: { farmId, type: "expense", date: { gte: since } },
        select: {
          amount: true, category: true, description: true,
          flockId: true, cropId: true, costBucket: true,
        },
      }),
      prisma.dailyProduction.findMany({
        where: { farmId, date: { gte: since } },
        select: { flockId: true, feedUsed: true, eggsCollected: true, milkCollected: true },
      }),
    ]);

    // ── Build the enterprise table, keyed by the same refs attribution returns.
    const known: KnownEnterprises = {
      flocks: flocks.map((f) => ({ id: f.id, category: f.category, type: f.type })),
      crops: crops.map((c) => ({ id: c.id })),
    };

    const byKey = new Map<string, Ent>();
    const keyOf = (ref: EnterpriseRef): string =>
      ref.kind === "general" ? "general" : `${ref.kind}-${ref.id}`;

    const make = (
      ref: EnterpriseRef,
      name: string,
      sub: string,
      unit: Ent["unit"] = null
    ): Ent => ({
      ref, id: keyOf(ref), kind: ref.kind, name, sub, unit,
      revenue: 0, costs: 0, feedCost: 0, outputKg: 0, outputUnits: 0,
      costsByBucket: new Map(),
    });

    for (const f of flocks) {
      // A flock's unit is what it produces, not what it is — a dairy flock
      // reports litres, a layer flock reports eggs.
      const ref: EnterpriseRef = { kind: "flock", id: f.id };
      const e = make(ref, f.name, f.type || "livestock", unitForFlock(f));
      e.species = f.type;
      e.category = f.category;
      byKey.set(e.id, e);
    }
    for (const c of crops) {
      const ref: EnterpriseRef = { kind: "crop", id: c.id };
      const e = make(ref, c.name, c.cropType || "crop", "kg");
      e.cropType = c.cropType;
      byKey.set(e.id, e);
    }
    byKey.set("general", make({ kind: "general", id: null }, "General / untagged", "whole farm"));

    const resolve = (tx: { type?: string | null; category?: string | null; flockId?: number | null; cropId?: number | null }): Ent => {
      const ref = attributeTransaction(tx, known);
      return byKey.get(keyOf(ref)) ?? byKey.get("general")!;
    };

    // ── Revenue.
    for (const tx of incomeTx) {
      resolve(tx).revenue += Number(tx.amount);
    }

    // ── Costs, bucketed. `costBucket` is preferred but the taxonomy is applied
    // on the fly when it is null, so a row written before the backfill (or
    // between the migration and the backfill) is still classified correctly
    // rather than landing in "other".
    for (const tx of expenseTx) {
      const amount = Number(tx.amount);
      const bucket = (tx.costBucket as CostBucket | null) ?? classifyExpense(tx.category);
      const e = resolve(tx);
      e.costs += amount;
      e.costsByBucket.set(bucket, (e.costsByBucket.get(bucket) ?? 0) + amount);
      if (bucket === "feed") e.feedCost += amount;
    }

    // ── Feed used per flock, from production records.
    const feedByFlock = new Map<number, number>();
    for (const p of prodRows) {
      feedByFlock.set(p.flockId, (feedByFlock.get(p.flockId) || 0) + Number(p.feedUsed || 0));
    }

    // ── Physical output per flock, so every cost has a denominator.
    for (const f of flocks) {
      const e = byKey.get(`flock-${f.id}`);
      if (!e) continue;
      const rows = prodRows.filter((p) => p.flockId === f.id);
      const eggs = rows.reduce((s, p) => s + Number(p.eggsCollected || 0), 0);
      const milk = rows.reduce((s, p) => s + Number(p.milkCollected || 0), 0);
      e.outputUnits = eggs + milk;
      // Eggs are converted at a named constant rather than a bare 0.06 so the
      // assumption has one home and can be challenged (see ledger-taxonomy.ts).
      e.outputKg = eggs * KG_PER_EGG + milk;
    }

    // ── Spread the unattributed feed bill across the flocks that ate it.
    //
    // This MOVES cost; it does not create it. The previous version assigned
    // the allocation to the flock while leaving the original expense on
    // "general", so a KES 30,000 feed bill made `summary.totalCosts` read
    // 60,000 — and feed is the largest cost line on most of these farms.
    // lib/ledger-feed.ts owns the invariant, and its tests defend it.
    const allocated = allocateFeedPool(
      [...byKey.values()].map((e) => ({
        key: e.id,
        kind: e.kind,
        feedCost: e.feedCost,
        kgConsumed: e.ref.kind === "flock" ? feedByFlock.get(e.ref.id) || 0 : 0,
      }))
    );
    for (const e of byKey.values()) {
      const next = allocated.get(e.id);
      if (next === undefined || next === e.feedCost) continue;
      const delta = next - e.feedCost;
      e.feedCost = next;
      e.costs += delta;
      const bucket = (e.costsByBucket.get("feed") ?? 0) + delta;
      if (bucket > 0) e.costsByBucket.set("feed", bucket);
      else e.costsByBucket.delete("feed");
    }

    const rows = [...byKey.values()]
      .map((e) => {
        const profit = e.revenue - e.costs;
        const margin = e.revenue > 0 ? Math.round((profit / e.revenue) * 100) : null;
        // Profit per shilling of feed: revenue / feed spend (higher = feed converts better)
        const feedEfficiency = e.feedCost > 0 ? Number((e.revenue / e.feedCost).toFixed(2)) : null;
        // Cost per unit of output. Null — never Infinity or NaN — when there is
        // no output to divide by, because a farmer reading "Infinity" stops
        // trusting every other number on the screen.
        const costPerUnit =
          e.outputUnits > 0 ? Number((e.costs / e.outputUnits).toFixed(2)) : null;
        const costPerKg = e.outputKg > 0 ? Number((e.costs / e.outputKg).toFixed(2)) : null;

        const costBreakdown = BUCKET_ORDER
          .filter((b) => (e.costsByBucket.get(b) ?? 0) > 0)
          .map((b) => ({ bucket: b, amount: Math.round(e.costsByBucket.get(b)!) }));

        return {
          id: e.id, kind: e.kind, name: e.name, sub: e.sub,
          species: e.species ?? null,
          category: e.category ?? null,
          cropType: e.cropType ?? null,
          revenue: Math.round(e.revenue), costs: Math.round(e.costs),
          feedCost: Math.round(e.feedCost), profit: Math.round(profit),
          margin, feedEfficiency,
          outputKg: Math.round(e.outputKg),
          outputUnits: Math.round(e.outputUnits),
          unit: e.unit,
          costPerUnit,
          costPerKg,
          costBreakdown,
          // M4 — filled below for rows with output; null means "no unit to
          // quote", not "zero". See lib/unit-economics.ts.
          economics: null as UnitEconomics | null,
          marketRef: null as MarketRef | null,
        };
      })
      .filter((e) => e.revenue > 0 || e.costs > 0)
      .sort((a, b) => b.profit - a.profit);

    // ── M4: cost of production vs price, side by side ──────────────────────
    // Three numbers a farmer can check against each other in one glance:
    // his cost per unit (above), what his own books say he earns per unit
    // (attributed revenue ÷ output), and — when recorded offers exist — what
    // the county pays. A missing side stays null and says it is missing; the
    // lib never turns a zero into a profit claim.
    const unitRows = rows.filter((r) => r.unit && r.outputUnits > 0);
    if (unitRows.length > 0) {
      const farm = await prisma.farm.findUnique({
        where: { id: farmId },
        select: { county: true },
      });

      const mappings = new Map<string, CommodityMapping>();
      for (const r of unitRows) {
        const m = commodityForEnterprise(r);
        if (m) mappings.set(r.id, m);
      }

      const commodities = [...new Set([...mappings.values()].map((m) => m.commodity))];
      const priceRows = commodities.length
        ? await prisma.marketPrice.findMany({
            where: {
              commodity: { in: commodities },
              effectiveDate: { gte: new Date(Date.now() - 365 * 86400000) },
            },
            orderBy: { effectiveDate: "desc" },
            select: { commodity: true, unit: true, priceKes: true, region: true, source: true, effectiveDate: true },
          })
        : [];

      for (const r of unitRows) {
        const mapping = mappings.get(r.id) ?? null;
        let marketPricePerUnit: number | null = null;
        let marketRef: MarketRef | null = null;

        if (mapping) {
          const points: PricePoint[] = priceRows
            .filter((p) => p.commodity === mapping.commodity)
            .map((p): PricePoint => ({
              commodity: p.commodity,
              unit: p.unit,
              priceKes: Number(p.priceKes),
              region: p.region,
              source: p.source,
              effectiveDate: p.effectiveDate,
            }));
          const bench = pickBenchmark(points, farm?.county ?? null);
          const converted =
            bench !== null ? benchmarkToCostUnit(Number(bench.priceKes), bench.unit, mapping) : null;
          if (converted !== null && bench !== null) {
            marketPricePerUnit = converted;
            marketRef = {
              commodity: mapping.commodity,
              region: bench.region,
              source: bench.source,
              ageLabel: describeAge(bench.effectiveDate),
              stale: benchmarkAgeDays(bench.effectiveDate) > STALE_DAYS,
            };
          }
        }

        // What this farm's own records say it earns per unit. Revenue of 0 is
        // an absence of sales, which the lib reads as "not recorded".
        const own = r.revenue > 0 ? r.revenue / r.outputUnits : null;

        r.economics = unitEconomics({
          costPerUnit: r.costPerUnit,
          ownPricePerUnit: own,
          marketPricePerUnit,
          unit: r.unit!,
        });
        r.marketRef = marketRef;
      }
    }

    res.json({
      periodDays,
      rows,
      summary: {
        totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
        totalCosts: rows.reduce((s, r) => s + r.costs, 0),
        totalProfit: rows.reduce((s, r) => s + r.profit, 0),
      },
    });
  } catch (error) {
    console.error("Profitability error:", error);
    res.status(500).json({ error: "Failed to compute profitability" });
  }
});

/** What does this flock sell? Decides the unit a cost is quoted per. */
function unitForFlock(flock: { category?: string | null; type?: string | null }): Ent["unit"] {
  const hay = `${flock.category ?? ""} ${flock.type ?? ""}`.toLowerCase();
  if (/dairy|cattle|milk|maziwa/.test(hay)) return "litre";
  if (/poultry|layer|broiler|kuku|chick|egg/.test(hay)) return "egg";
  if (/fish|samaki|pond|aqua/.test(hay)) return "kg";
  return null;
}

export default router;
