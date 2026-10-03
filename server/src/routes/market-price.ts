import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  compareToBenchmark,
  COMMODITIES,
  type PricePoint,
} from "../lib/market-price.js";


/**
 * Market price board (gap-analysis row 14, GAP 6).
 *
 * Cold chain readings (row 15) live in cold-chain.ts: an earlier version kept
 * both here, and a route called /market-prices that also answered questions
 * about avocado temperatures was impossible to find or reason about.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

/** How far back to look for a benchmark. Beyond a year the number is noise. */
const PRICE_LOOKBACK_DAYS = 365;

function toPoints(rows: unknown[]): PricePoint[] {
  return (rows as any[]).map((r) => ({
    commodity: r.commodity,
    unit: r.unit,
    priceKes: Number(r.priceKes),
    region: r.region,
    source: r.source,
    effectiveDate: r.effectiveDate,
  }));
}

/** GET /api/market-prices/board — the reference prices a farmer can compare to. */
router.get("/board", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { county: true } });
    const since = new Date(Date.now() - PRICE_LOOKBACK_DAYS * 86400000);

    const prices = await prisma.marketPrice.findMany({
      where: { effectiveDate: { gte: since } },
      orderBy: { effectiveDate: "desc" },
      take: 300,
    });

    return res.json({
      county: farm?.county ?? null,
      commodities: COMMODITIES,
      prices,
    });
  } catch (error) {
    console.error("Market board error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/**
 * POST /api/market-prices/compare — compare a price against the benchmark.
 * Body: { commodity, price, quantity?, unit?, region? }
 *
 * This is the whole feature in one call: the delivery/sales form calls it live
 * as the farmer types a price, and gets back either "that is low, here is what
 * it is worth on this load" or nothing at all.
 */
router.post("/compare", async (req: Request, res: Response) => {
  try {
    const commodity = typeof req.body?.commodity === "string" ? req.body.commodity.trim().toLowerCase() : "";
    if (!commodity) return res.status(400).json({ error: "Which commodity?", field: "commodity" });

    let region = typeof req.body?.region === "string" ? req.body.region.trim() : null;
    if (!region) {
      const farm = await prisma.farm.findUnique({ where: { id: req.user!.farmId! }, select: { county: true } });
      region = farm?.county ?? null;
    }

    const since = new Date(Date.now() - PRICE_LOOKBACK_DAYS * 86400000);
    const rows = await prisma.marketPrice.findMany({
      where: { commodity, effectiveDate: { gte: since } },
      orderBy: { effectiveDate: "desc" },
      take: 100,
    });

    const comparison = compareToBenchmark(req.body?.price, toPoints(rows), {
      region,
      quantity: req.body?.quantity != null && req.body.quantity !== "" ? Number(req.body.quantity) : undefined,
      unit: typeof req.body?.unit === "string" ? req.body.unit : undefined,
    });

    return res.json(comparison);
  } catch (error) {
    console.error("Market compare error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/**
 * POST /api/market-prices — record what a farmer was offered.
 *
 * Deliberately farmer-supplied rather than fetched: we have no licence to
 * publish market prices, and a farmer's own real offer is both more accurate
 * and more useful than anything we could guess. Each entry contributes to the
 * benchmark that every farmer in that region then sees.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const commodity = typeof req.body?.commodity === "string" ? req.body.commodity.trim().toLowerCase() : "";
    if (!commodity) return res.status(400).json({ error: "Which commodity?", field: "commodity" });

    const price = Number(req.body?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: "Enter the price you were offered", field: "price" });
    }

    let region = typeof req.body?.region === "string" ? req.body.region.trim() : null;
    if (!region) {
      const farm = await prisma.farm.findUnique({ where: { id: req.user!.farmId! }, select: { county: true } });
      region = farm?.county ?? null;
    }

    const unit =
      (typeof req.body?.unit === "string" && req.body.unit.trim()) ||
      COMMODITIES[commodity] ||
      "unit";

    const created = await prisma.marketPrice.create({
      data: {
        commodity,
        unit,
        region,
        priceKes: price,
        source: (typeof req.body?.source === "string" && req.body.source.trim()) || "Recorded by farmer",
        effectiveDate: req.body?.effectiveDate ? new Date(req.body.effectiveDate) : new Date(),
      },
    });

    return res.status(201).json(created);
  } catch (error) {
    console.error("Market price create error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/** GET /api/market-prices/mine — what this farm has recorded. */
router.get("/mine", async (req: Request, res: Response) => {
  try {
    const farm = await prisma.farm.findUnique({ where: { id: req.user!.farmId! }, select: { county: true } });
    const prices = await prisma.marketPrice.findMany({
      where: farm?.county ? { region: farm.county } : {},
      orderBy: { effectiveDate: "desc" },
      take: 50,
    });
    return res.json(prices);
  } catch (error) {
    console.error("Market prices mine error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;