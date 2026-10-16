import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireOwner);

// GET /api/inventory
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.inventory.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { itemName: "asc" },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/inventory/expiring?days=30 — items whose expiryDate falls in the
// next N days (default 30, capped at 365). Most-urgent first. Returns the
// KES value at risk per item so the dashboard tile can show "KES X is about
// to expire" without a follow-up query.
router.get("/expiring", async (req: Request, res: Response) => {
  try {
    const on = new Date();
    const requested = Number(req.query.days);
    const days = Math.min(Math.max(Number.isFinite(requested) && requested > 0 ? requested : 30, 1), 365);
    const horizon = new Date(on.getTime() + days * 86400000);

    const items = await prisma.inventory.findMany({
      where: {
        farmId: req.user!.farmId!,
        expiryDate: { gte: on, lte: horizon },
      },
      orderBy: { expiryDate: "asc" },
    });

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const enriched = items.map((i) => {
      const quantity = Number(i.quantity);
      const unitCost = Number(i.unitCost);
      return {
        id: i.id,
        itemName: i.itemName,
        category: i.category,
        batchNo: i.batchNo ?? null,
        quantity,
        unit: i.unit,
        unitCost,
        expiryDate: i.expiryDate,
        daysToExpiry: i.expiryDate
          ? Math.max(0, Math.ceil((new Date(i.expiryDate).getTime() - on.getTime()) / 86400000))
          : null,
        // Money at risk if this batch spoils. quantity * unitCost, rounded
        // to 2 dp so the JSON has no float noise.
        valueAtRisk: r2(quantity * unitCost),
      };
    });

    const totalValueAtRisk = r2(enriched.reduce((s, i) => s + i.valueAtRisk, 0));
    return res.json({
      days,
      on: on.toISOString(),
      horizon: horizon.toISOString(),
      count: enriched.length,
      totalValueAtRisk,
      items: enriched,
      basis: "Items with an expiry date in the next N days. Days left is rounded up to the next whole day. Value at risk uses the recorded unit cost and current quantity.",
    });
  } catch (error) {
    console.error("Inventory expiring error:", error);
    return res.status(500).json({ error: "Failed to load expiring inventory" });
  }
});

// POST /api/inventory
router.post("/", async (req: Request, res: Response) => {
  try {
    const result = await prisma.inventory.create({
      data: {
        farmId: req.user!.farmId!,
        itemName: req.body.itemName,
        category: req.body.category || null,
        quantity: Number(req.body.quantity),
        unit: req.body.unit || "bags",
        unitCost: Number(req.body.unitCost),
        reorderLevel: Number(req.body.reorderLevel || 0),
        supplier: req.body.supplier || null,
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
        batchNo: typeof req.body.batchNo === "string" && req.body.batchNo.trim() ? req.body.batchNo.trim() : null,
        notes: req.body.notes || null,
      },
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PATCH /api/inventory/:id — adjust stock OR full edit
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const item = await prisma.inventory.findFirst({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    if (!item) return res.status(404).json({ error: "Not found" });

    // If quantity delta is provided, adjust stock
    if (req.body.quantity !== undefined && !req.body.itemName) {
      const delta = Number(req.body.quantity || 0);
      const newQty = Math.max(0, Number(item.quantity) + delta);
      const updated = await prisma.inventory.update({ where: { id: item.id }, data: { quantity: newQty } });
      return res.json(updated);
    }

    // Full edit — update all provided fields
    const data: Record<string, any> = {};
    if (req.body.itemName !== undefined) data.itemName = req.body.itemName;
    if (req.body.category !== undefined) data.category = req.body.category || null;
    if (req.body.quantity !== undefined) data.quantity = Number(req.body.quantity);
    if (req.body.unit !== undefined) data.unit = req.body.unit;
    if (req.body.unitCost !== undefined) data.unitCost = Number(req.body.unitCost);
    if (req.body.reorderLevel !== undefined) data.reorderLevel = Number(req.body.reorderLevel);
    if (req.body.supplier !== undefined) data.supplier = req.body.supplier || null;
    if (req.body.expiryDate !== undefined) data.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    if (req.body.batchNo !== undefined) data.batchNo = typeof req.body.batchNo === "string" && req.body.batchNo.trim() ? req.body.batchNo.trim() : null;
    if (req.body.notes !== undefined) data.notes = req.body.notes || null;

    const updated = await prisma.inventory.update({ where: { id: item.id }, data });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/inventory/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.inventory.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
