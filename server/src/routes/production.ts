import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireFarm);

// GET /api/production
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.dailyProduction.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { date: "desc" },
      take: 30,
      // `type` travels with the name because the client labels each row by the
      // species' own output — without it every non-dairy row was shown as
      // "N eggs", so a goat weight record read "0 eggs".
      include: { flock: { select: { name: true, type: true } } },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/production
router.post("/", async (req: Request, res: Response) => {
  try {
    // Defaults: date = today (the client may omit it); weight fields persisted
    // on both create and update paths.
    const date = req.body.date ? new Date(req.body.date) : new Date();
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: "Invalid date" });
    }
    const result = await prisma.dailyProduction.upsert({
      where: {
        flockId_date: {
          flockId: Number(req.body.flockId),
          date: new Date(req.body.date),
        },
      },
      update: {
        eggsCollected: Number(req.body.eggsCollected || 0),
        milkCollected: Number(req.body.milkCollected || 0),
        avgWeight: req.body.avgWeight != null ? Number(req.body.avgWeight) : undefined,
        weightGain: req.body.weightGain != null ? Number(req.body.weightGain) : undefined,
        mortality: Number(req.body.mortality || 0),
        feedUsed: Number(req.body.feedUsed || 0),
        notes: req.body.notes || null,
      },
      create: {
        flockId: Number(req.body.flockId),
        farmId: req.user!.farmId!,
        date,
        eggsCollected: Number(req.body.eggsCollected || 0),
        milkCollected: Number(req.body.milkCollected || 0),
        avgWeight: req.body.avgWeight != null ? Number(req.body.avgWeight) : null,
        weightGain: req.body.weightGain != null ? Number(req.body.weightGain) : null,
        mortality: Number(req.body.mortality || 0),
        feedUsed: Number(req.body.feedUsed || 0),
        notes: req.body.notes || null,
      },
    });

    // Inventory link: feed used pulls from stock and books the expense.
    const feedUsed = Number(req.body.feedUsed || 0);
    if (feedUsed > 0 && req.body.inventoryItemId) {
      const item = await prisma.inventory.findFirst({
        where: { id: Number(req.body.inventoryItemId), farmId: req.user!.farmId! },
      });
      if (item) {
        const newQty = Math.max(0, Number(item.quantity) - feedUsed);
        await prisma.$transaction([
          prisma.inventory.update({ where: { id: item.id }, data: { quantity: newQty } }),
          prisma.inventoryLog.create({
            data: {
              inventoryId: item.id,
              changeType: "consumption",
              quantityChange: -feedUsed,
              reason: `Feed used by flock (production record #${result.id})`,
              createdBy: req.user!.userId ?? null,
            },
          }),
          // Feed consumption is a real cost — book it at the item's unit cost.
          ...(Number(item.unitCost) > 0
            ? [prisma.transaction.create({
                data: {
                  farmId: req.user!.farmId!,
                  type: "expense",
                  category: "feed",
                  description: `Feed: ${feedUsed} ${item.unit} ${item.itemName}`,
                  amount: feedUsed * Number(item.unitCost),
                  date: new Date(req.body.date),
                  paymentMethod: "inventory",
                  createdBy: req.user!.userId,
                },
              })]
            : []),
        ]);
      }
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/production/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.dailyProduction.deleteMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
