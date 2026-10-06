import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { buildKiamisExport } from "../lib/kiamis.js";

/**
 * GET /api/kiamis — this farm's registration document in KIAMIS shape.
 *
 * M2 groundwork (PHASED-PRODUCT-PLAN, item 6): "National ID and farm size on
 * the farmer profile, exported in KIAMIS shape." KIAMIS is the national
 * register that gates fertiliser e-voucher eligibility, and its survey asks
 * for name, ID number, size of farm, commodities, annual income — exactly the
 * fields this endpoint assembles from records the farmer already keeps.
 *
 * Owner-only, and the only place the full national ID leaves the database.
 * `missing` in the response names what the farmer still has to record: the
 * export is his checklist, never a claim that an incomplete farm is registered.
 *
 * Deliberately a read: nothing here writes to KIAMIS. No such integration
 * exists yet, and pretending one does would be the kind of claim this project
 * does not make.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const userId = req.user!.userId;
    const yearAgo = new Date(Date.now() - 365 * 86400000);

    const [farm, owner, flocks, crops, income] = await Promise.all([
      prisma.farm.findUnique({
        where: { id: farmId },
        select: {
          name: true, location: true, county: true,
          areaValue: true, areaUnit: true, premisesRegNo: true,
          latitude: true, longitude: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phone: true, nationalId: true },
      }),
      prisma.flock.findMany({
        where: { farmId, status: "active" },
        select: { type: true },
      }),
      prisma.crop.findMany({
        where: { farmId, status: "active" },
        select: { cropType: true },
      }),
      prisma.transaction.aggregate({
        where: { farmId, type: "income", date: { gte: yearAgo } },
        _sum: { amount: true },
      }),
    ]);

    if (!farm || !owner) return res.status(404).json({ error: "Farm not found" });

    // Commodities in the farmer's own vocabulary — his flock types and crop
    // types, deduped, nothing renamed. KIAMIS asks what he farms; he answers
    // in the words he records with.
    const commodities = [
      ...new Set(
        [...flocks.map((f) => f.type), ...crops.map((c) => c.cropType)].filter(
          (v): v is string => typeof v === "string" && v.trim() !== ""
        )
      ),
    ];

    // No income rows = the farmer has never recorded income, which is NOT the
    // same as "earned zero" — that stays null and lands in `missing`.
    const annualIncomeKes = income._sum.amount === null ? null : Number(income._sum.amount);

    const doc = buildKiamisExport({
      farmerName: owner.name ?? null,
      nationalId: owner.nationalId ?? null,
      phone: owner.phone ?? null,
      farmName: farm.name ?? null,
      county: farm.county ?? null,
      location: farm.location ?? null,
      premisesRegNo: farm.premisesRegNo ?? null,
      areaValue: farm.areaValue === null ? null : Number(farm.areaValue),
      areaUnit: farm.areaUnit ?? null,
      latitude: farm.latitude === null ? null : Number(farm.latitude),
      longitude: farm.longitude === null ? null : Number(farm.longitude),
      commodities,
      annualIncomeKes,
    });

    return res.json(doc);
  } catch (error) {
    console.error("KIAMIS export error:", error);
    return res.status(500).json({ error: "Failed to build the export" });
  }
});

export default router;
