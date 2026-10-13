import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { auditMoneyMutation } from "../lib/audit.js";

const router = Router();
router.use(authMiddleware, requireOwner);

// GET /api/transactions
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.transaction.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { date: "desc" },
      take: 100,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/transactions
router.post("/", async (req: Request, res: Response) => {
  try {
    let amount = Number(req.body.amount);
    const qty = req.body.quantity != null && !isNaN(Number(req.body.quantity)) ? Number(req.body.quantity) : null;
    const unitCost = req.body.unitCost != null && !isNaN(Number(req.body.unitCost)) ? Number(req.body.unitCost) : null;
    const supplierName = typeof req.body.supplierName === "string" && req.body.supplierName.trim() ? req.body.supplierName.trim() : null;

    if ((isNaN(amount) || amount <= 0) && qty != null && unitCost != null && qty > 0 && unitCost > 0) {
      amount = Math.round(qty * unitCost * 100) / 100;
    }

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!req.body.type || !req.body.date) {
      return res.status(400).json({ error: "Type and date are required" });
    }

    // PUR- code only for expense (purchase) records; income rows don't need one.
    let docCode: string | null = null;
    if (req.body.type === "expense") {
      try {
        const { nextDocCode } = await import("../lib/doc-codes.js");
        docCode = await prisma.$transaction((tx: any) => nextDocCode(tx, req.user!.farmId!, "purchase"));
      } catch { docCode = null; }
    }

    const result = await prisma.transaction.create({
      data: {
        farmId: req.user!.farmId!,
        type: req.body.type,
        category: req.body.category || null,
        docCode,
        amount,
        quantity: qty,
        unitCost,
        supplierName,
        description: req.body.description || null,
        date: new Date(req.body.date),
        paymentMethod: req.body.paymentMethod || "cash",
        createdBy: req.user!.userId,
      },
    });

    // ERPNext Purchase Invoice sync: when buying feed or consumables, auto-restock inventory
    if (req.body.type === "expense" && qty != null && qty > 0) {
      const cat = (req.body.category || "").toLowerCase();
      const isFeed = cat === "animal_feed" || cat === "feed";
      const isFertilizer = cat === "fertilizer";
      const isSeeds = cat === "seeds";

      if (isFeed || isFertilizer || isSeeds) {
        const invCat = isFeed ? "feed" : isFertilizer ? "fertilizer" : "seeds";
        const invItem = await prisma.inventory.findFirst({
          where: {
            farmId: req.user!.farmId!,
            OR: [
              { category: invCat },
              { itemName: { contains: invCat, mode: "insensitive" } },
            ],
          },
        });

        if (invItem) {
          const newQty = Number(invItem.quantity) + qty;
          const newUnitCost = unitCost != null && unitCost > 0 ? unitCost : Number(invItem.unitCost);
          await prisma.inventory.update({
            where: { id: invItem.id },
            data: { quantity: newQty, unitCost: newUnitCost, supplier: supplierName || invItem.supplier },
          });
          await prisma.inventoryLog.create({
            data: {
              inventoryId: invItem.id,
              changeType: "purchase",
              quantityChange: qty,
              reason: `Purchase expense #${result.id}${supplierName ? ` from ${supplierName}` : ""}`,
              createdBy: req.user!.userId,
            },
          });
        }
      }
    }

    auditMoneyMutation({
      userId: req.user!.userId,
      farmId: req.user!.farmId,
      action: "transaction.create",
      entityType: "Transaction",
      entityId: result.id,
      details: { type: result.type, amount: Number(result.amount), category: result.category, quantity: qty, unitCost },
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PATCH /api/transactions/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.transaction.findFirst({ where: { id, farmId: req.user!.farmId! } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const amount = Number(req.body.amount);
    if (req.body.amount !== undefined && (isNaN(amount) || amount <= 0)) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    const data: Record<string, any> = {
      type: req.body.type ?? existing.type,
      category: req.body.category ?? existing.category,
      amount: req.body.amount !== undefined ? amount : existing.amount,
      description: req.body.description ?? existing.description,
      paymentMethod: req.body.paymentMethod ?? existing.paymentMethod,
    };
    if (req.body.quantity !== undefined) {
      data.quantity = req.body.quantity != null && !isNaN(Number(req.body.quantity)) ? Number(req.body.quantity) : null;
    }
    if (req.body.unitCost !== undefined) {
      data.unitCost = req.body.unitCost != null && !isNaN(Number(req.body.unitCost)) ? Number(req.body.unitCost) : null;
    }
    if (req.body.supplierName !== undefined) {
      data.supplierName = typeof req.body.supplierName === "string" && req.body.supplierName.trim() ? req.body.supplierName.trim() : null;
    }

    const result = await prisma.transaction.update({
      where: { id: existing.id },
      data,
    });
    auditMoneyMutation({
      userId: req.user!.userId,
      farmId: req.user!.farmId,
      action: "transaction.update",
      entityType: "Transaction",
      entityId: result.id,
      details: { before: { amount: Number(existing.amount), type: existing.type }, after: { amount: Number(result.amount), type: result.type } },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/transactions/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.transaction.findFirst({ where: { id, farmId: req.user!.farmId! } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.transaction.deleteMany({ where: { id, farmId: req.user!.farmId! } });
    auditMoneyMutation({
      userId: req.user!.userId,
      farmId: req.user!.farmId,
      action: "transaction.delete",
      entityType: "Transaction",
      entityId: id,
      details: { deleted: { amount: Number(existing.amount), type: existing.type, description: existing.description } },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
