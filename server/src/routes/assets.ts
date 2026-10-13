import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { assetRegister, type AssetFlock, type EquipmentItem } from "../lib/asset-register.js";

/**
 * Herd and equipment as capital (gap report §3 C8).
 *
 * "Present the value that is already computable" is the doc's instruction, and
 * that is all this does: the herd's recorded cost, the tools' recorded cost, and
 * a straight-line book value where the farmer gave a date AND a life. It never
 * prices an animal, because a market value would be a number we chose on the
 * farmer's behalf and would then be quoted to a lender as though it were theirs.
 *
 * The three fields a book value needs (acquired date, useful life, end value) are
 * settable here rather than on the flock form: they are register inputs, and
 * asking for them while a farmer is adding animals would be friction on the one
 * screen that must stay fast.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** GET /api/assets — the register, its totals, and what it could not value. */
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;

    const [flocks, inventory] = await Promise.all([
      prisma.flock.findMany({
        where: { farmId, status: { not: "sold" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, type: true, currentCount: true, initialCount: true,
          costPerAnimal: true, totalInvestment: true, acquiredOn: true,
          usefulLifeYears: true, salvageValue: true, status: true,
        },
      }),
      // Equipment is what the stock records carry a unit cost for. It is the
      // closest thing to an asset list the farm already keeps, and inventing a
      // second one would mean asking a farmer to type everything twice.
      prisma.inventory.findMany({
        where: { farmId },
        orderBy: { itemName: "asc" },
        select: { id: true, itemName: true, quantity: true, unit: true, unitCost: true, category: true },
      }),
    ]);

    const register = assetRegister(
      flocks.map((f): AssetFlock => ({
        id: f.id,
        name: f.name,
        type: f.type,
        currentCount: f.currentCount,
        initialCount: f.initialCount,
        costPerAnimal: numOrNull(f.costPerAnimal),
        totalInvestment: numOrNull(f.totalInvestment),
        acquiredOn: f.acquiredOn ? new Date(f.acquiredOn) : null,
        usefulLifeYears: f.usefulLifeYears,
        salvageValue: numOrNull(f.salvageValue),
        status: f.status,
      })),
      inventory.map((i): EquipmentItem => ({
        id: i.id,
        itemName: i.itemName,
        quantity: numOrNull(i.quantity) ?? 0,
        unit: i.unit,
        unitCost: numOrNull(i.unitCost),
        category: i.category,
      }))
    );

    return res.json({
      ...register,
      // What the register cannot value, named so it reads as a to-do and not as a
      // zero.
      incomplete: register.lines
        .filter((l) => l.basis === "cost_only" || l.cost == null)
        .map((l) => ({ kind: l.kind, id: l.id, name: l.name, note: l.note })),
    });
  } catch (error) {
    console.error("Asset register error:", error);
    return res.status(500).json({ error: "Failed to build the asset register" });
  }
});

/**
 * PATCH /api/assets/flock/:id — the three register inputs.
 *
 * Each accepts null, because a life expectancy typed onto the wrong group has to
 * be removable without editing the database.
 */
router.patch("/flock/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const id = Number(req.params.id);
    const existing = await prisma.flock.findFirst({ where: { id, farmId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Group not found" });

    const usefulLifeYears = numOrNull(req.body?.usefulLifeYears);
    if (usefulLifeYears != null && (usefulLifeYears <= 0 || usefulLifeYears > 60)) {
      // A 300-year life would depreciate an animal to nothing and quietly
      // flatter the books; 60 years is already beyond any farm asset.
      return res.status(400).json({ error: "Useful life should be between 1 and 60 years", field: "usefulLifeYears" });
    }

    const updated = await prisma.flock.update({
      where: { id },
      data: {
        ...(req.body?.acquiredOn !== undefined ? { acquiredOn: dateOrNull(req.body.acquiredOn) } : {}),
        ...(req.body?.usefulLifeYears !== undefined ? { usefulLifeYears } : {}),
        ...(req.body?.salvageValue !== undefined ? { salvageValue: numOrNull(req.body.salvageValue) } : {}),
      },
      select: { id: true, name: true, acquiredOn: true, usefulLifeYears: true, salvageValue: true },
    });
    return res.json(updated);
  } catch (error) {
    console.error("Asset flock update error:", error);
    return res.status(500).json({ error: "Failed to update the group" });
  }
});

export default router;
