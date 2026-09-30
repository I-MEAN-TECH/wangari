import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

/**
 * Profitability Scoreboard — which flock/block/pond actually makes money?
 *
 * Ranks every active enterprise by REAL profit computed from data already
 * flowing through the system:
 *   - Revenue: transactions tagged to the enterprise (sales categories)
 *   - Costs: expense transactions + recorded inputs (feed used × nothing
 *     unknown; inventory consumption is booked as expense transactions
 *     automatically by the production route)
 *
 * Metric shown: profit margin % and profit per shilling of feed — the
 * "feed efficiency" lens the user asked for.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

// GET /api/profitability
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const periodDays = Math.min(Number(req.query.days) || 90, 365);
    const since = new Date(Date.now() - periodDays * 86400000);

    const [flocks, crops, incomeTx, expenseTx, prodRows] = await Promise.all([
      prisma.flock.findMany({ where: { farmId }, select: { id: true, name: true, type: true, category: true, currentCount: true, status: true } }),
      prisma.crop.findMany({ where: { farmId }, select: { id: true, name: true, cropType: true, areaAcres: true, status: true } }),
      prisma.transaction.findMany({ where: { farmId, type: "income", date: { gte: since } }, select: { amount: true, category: true, description: true } }),
      prisma.transaction.findMany({ where: { farmId, type: "expense", date: { gte: since } }, select: { amount: true, category: true, description: true } }),
      prisma.dailyProduction.findMany({ where: { farmId, date: { gte: since } }, select: { flockId: true, feedUsed: true, eggsCollected: true, milkCollected: true } }),
    ]);

    // Attribute transactions to enterprises by category/description match
    const flockByName = new Map(flocks.map(f => [f.name.toLowerCase(), f.id]));
    const cropByName = new Map(crops.map(c => [c.name.toLowerCase(), c.id]));
    const typeById = new Map(flocks.map(f => [f.id, f.type || ""]));

    type Ent = {
      id: string; kind: "flock" | "crop" | "general"; name: string; sub: string;
      species?: string | null; category?: string | null; cropType?: string | null;
      revenue: number; costs: number; feedCost: number; outputKg: number;
    };
    const ent = new Map<string, Ent>();
    const get = (id: string, kind: Ent["kind"], name: string, sub: string): Ent => {
      let e = ent.get(id);
      if (!e) { e = { id, kind, name, sub, revenue: 0, costs: 0, feedCost: 0, outputKg: 0 }; ent.set(id, e); }
      return e;
    };
    for (const f of flocks) get(`flock-${f.id}`, "flock", f.name, f.type || "livestock");
    for (const c of crops) get(`crop-${c.id}`, "crop", c.name, c.cropType || "crop");
    const general = get("general", "general", "General / untagged", "whole farm");

    const matchEnterprise = (text: string): Ent | null => {
      const t = (text || "").toLowerCase();
      for (const [name, id] of flockByName) if (t.includes(name)) return get(`flock-${id}`, "flock", name, "");
      for (const [name, id] of cropByName) if (t.includes(name)) return get(`crop-${id}`, "crop", name, "");
      return null;
    };

    for (const tx of incomeTx) {
      const e = matchEnterprise(tx.category || "") || matchEnterprise(tx.description || "") || general;
      e.revenue += Number(tx.amount);
    }
    for (const tx of expenseTx) {
      const e = matchEnterprise(tx.category || "") || matchEnterprise(tx.description || "") || general;
      e.costs += Number(tx.amount);
      if (/feed/i.test(tx.category || "") || /feed/i.test(tx.description || "")) e.feedCost += Number(tx.amount);
    }

    // Feed used per flock from production records (kg) — allocate total feed expense by usage share
    const feedByFlock = new Map<number, number>();
    for (const p of prodRows) feedByFlock.set(p.flockId, (feedByFlock.get(p.flockId) || 0) + Number(p.feedUsed || 0));
    const totalFeedKg = [...feedByFlock.values()].reduce((a, b) => a + b, 0);
    const totalFeedExpense = [...ent.values()].filter(e => e.kind === "general").reduce((s, e) => s + e.feedCost, 0) ||
      incomeTx.length === 0 ? [...ent.values()].reduce((s, e) => s + e.feedCost, 0) : 0;

    for (const f of flocks) {
      const e = get(`flock-${f.id}`, "flock", f.name, f.type || "");
      const kg = feedByFlock.get(f.id) || 0;
      if (totalFeedKg > 0 && kg > 0) {
        e.feedCost = (kg / totalFeedKg) * Math.max(totalFeedExpense, e.feedCost);
        e.costs = Math.max(e.costs, e.feedCost);
      }
      // Output: eggs (≈60g) + milk litres ≈ kg
      e.outputKg = prodRows.filter(p => p.flockId === f.id).reduce((s, p) => s + Number(p.eggsCollected || 0) * 0.06 + Number(p.milkCollected || 0), 0);
    }

    const rows = [...ent.values()]
      .map(e => {
        const profit = e.revenue - e.costs;
        const margin = e.revenue > 0 ? Math.round((profit / e.revenue) * 100) : null;
        // Profit per shilling of feed: revenue / feed spend (higher = feed converts better)
        const feedEfficiency = e.feedCost > 0 ? Number((e.revenue / e.feedCost).toFixed(2)) : null;
        return {
          id: e.id, kind: e.kind, name: e.name, sub: e.sub,
          species: flocks.find(f => `flock-${f.id}` === e.id)?.type ?? null,
          category: flocks.find(f => `flock-${f.id}` === e.id)?.category ?? null,
          cropType: crops.find(c => `crop-${c.id}` === e.id)?.cropType ?? null,
          revenue: Math.round(e.revenue), costs: Math.round(e.costs),
          feedCost: Math.round(e.feedCost), profit: Math.round(profit),
          margin, feedEfficiency, outputKg: Math.round(e.outputKg),
        };
      })
      .filter(e => e.revenue > 0 || e.costs > 0)
      .sort((a, b) => b.profit - a.profit);

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

export default router;
