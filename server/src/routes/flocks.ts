import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireOwner, requireFarm } from "../middleware/requireOwner.js";
import { createFlockForFarm } from "../lib/flock-create.js";

const router = Router();
// requireFarm, not requireOwner: workers may read flocks, but a session with
// no farm attached must not fall through to an unscoped query.
router.use(authMiddleware, requireFarm);

// GET /api/flocks — list all flocks for the farm
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.flock.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { createdAt: "desc" },
      include: {
        vaccinations: { orderBy: { scheduledDate: "asc" } },
        production: { orderBy: { date: "desc" }, take: 30 },
      },
    });
    res.json(data);
  } catch (error) {
    console.error("List flocks error:", error);
    res.status(500).json({ error: "Failed to fetch flocks" });
  }
});

// GET /api/flocks/compare?ids=1,2 — side-by-side metrics for the Compare
// button. MUST be registered before "/:id": otherwise Express matches the
// literal string "compare" as an id, Number("compare") is NaN, and the route
// 404s. The Compare button has therefore never worked.
router.get("/compare", async (req: Request, res: Response) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (ids.length < 2) {
      return res.status(400).json({ error: "Provide at least 2 flock ids" });
    }

    const flocks = await prisma.flock.findMany({
      where: { id: { in: ids }, farmId: req.user!.farmId! },
      include: {
        vaccinations: { orderBy: { scheduledDate: "asc" } },
        production: { orderBy: { date: "desc" } },
      },
    });

    const result = flocks.map((f) => {
      const production = f.production || [];
      // Production is recorded as eggs OR milk (never both for one species),
      // and milk is a Decimal — coerce before summing so the JSON is a number.
      const outputOf = (p: (typeof production)[number]) =>
        Number(p.eggsCollected || 0) + Number(p.milkCollected || 0);
      const totalProduction = production.reduce((s, p) => s + outputOf(p), 0);
      const last7 = production.slice(0, 7);
      const avgProduction = last7.length
        ? last7.reduce((s, p) => s + outputOf(p), 0) / last7.length
        : 0;

      const daysSinceStart = f.hatchDate
        ? Math.floor((Date.now() - new Date(f.hatchDate).getTime()) / 86400000)
        : 0;
      const feedCostPerMonth = Number(f.feedCostPerMonth) || 0;
      const totalFeedCost = feedCostPerMonth * Math.ceil(daysSinceStart / 30);

      const pendingVax = (f.vaccinations || []).filter((v) => v.status === "pending").length;
      const completedVax = (f.vaccinations || []).filter((v) => v.status === "completed").length;

      return {
        id: f.id,
        name: f.name,
        breed: f.breed,
        type: f.type,
        category: f.category,
        initialCount: f.initialCount,
        currentCount: f.currentCount,
        mortality: f.mortality,
        mortalityRate: f.initialCount > 0 ? (f.mortality / f.initialCount) * 100 : 0,
        hatchDate: f.hatchDate,
        daysSinceStart,
        avgProduction,
        totalProduction,
        totalFeedCost,
        totalInvestment: Number(f.totalInvestment) || 0,
        feedCostPerMonth,
        costPerAnimal: Number(f.costPerAnimal) || 0,
        pendingVax,
        completedVax,
        totalVax: (f.vaccinations || []).length,
        status: f.status,
        location: f.location,
        purpose: f.purpose,
        photoUrl: f.photoUrl,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Compare flocks error:", error);
    res.status(500).json({ error: "Failed to compare flocks" });
  }
});

// GET /api/flocks/:id — get single flock with full details
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const data = await prisma.flock.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      include: {
        vaccinations: { orderBy: { scheduledDate: "asc" } },
        production: { orderBy: { date: "desc" }, take: 90 },
      },
    });
    if (!data) {
      return res.status(404).json({ error: "Flock not found" });
    }
    res.json(data);
  } catch (error) {
    console.error("Get flock error:", error);
    res.status(500).json({ error: "Failed to fetch flock" });
  }
});

// POST /api/flocks — create a new flock with auto-scheduled vaccinations
router.post("/", requireOwner, async (req: Request, res: Response) => {
  try {
    // The whole job — row, tag range, vaccinations, purchase expense — lives in
    // lib/flock-create.ts so that Wangari's intake writes through the SAME code.
    // See the note at the top of that file for why a second copy would be worse
    // than a slow one.
    const {
      name, breed, type, category, initialCount, hatchDate, status, mortality,
      purpose, gender, genderRatio, location,
      source, supplierContact, costPerAnimal, targetMarket,
      feedType, feedSupplier, feedCostPerMonth,
      vetName, vetPhone, healthOnArrival, insurancePolicy,
      expectedYield, expectedRevenue, expectedWeight,
      notes, vaccinationSchedule,
      tagFrom, tagTo, taggedOn,
    } = req.body;

    const created = await createFlockForFarm(req.user!.farmId!, req.user!.userId, {
      name,
      breed,
      type,
      category,
      status,
      initialCount,
      mortality,
      hatchDate,
      purpose,
      gender,
      genderRatio,
      location,
      source,
      supplierContact,
      costPerAnimal: costPerAnimal === undefined ? null : Number(costPerAnimal),
      targetMarket,
      feedType,
      feedSupplier,
      feedCostPerMonth: feedCostPerMonth === undefined ? null : Number(feedCostPerMonth),
      vetName,
      vetPhone,
      healthOnArrival,
      insurancePolicy,
      expectedYield,
      expectedRevenue: expectedRevenue === undefined ? null : Number(expectedRevenue),
      expectedWeight,
      notes,
      vaccinationSchedule,
      tagFrom,
      tagTo,
      taggedOn,
    });

    if (!created.ok) return res.status(400).json({ error: created.error });
    // A tag range that does not match the head count is reported, not refused:
    // the tags are real even when the count is wrong, and hiding them would
    // tell a county officer an untagged herd is tagged.
    if (created.value.tagWarning) {
      return res.status(201).json({ ...created.value.flock, tagWarning: created.value.tagWarning });
    }
    res.status(201).json(created.value.flock);
  } catch (error) {
    console.error("Create flock error:", error);
    res.status(500).json({ error: "Failed to create flock" });
  }
});
// PATCH /api/flocks/:id — update a flock
router.patch("/:id", requireOwner, async (req: Request, res: Response) => {
  try {
    const allowed = [
      "name", "breed", "type", "category", "status", "currentCount", "mortality",
      "purpose", "gender", "genderRatio", "location",
      "source", "supplierContact", "costPerAnimal", "targetMarket",
      "feedType", "feedSupplier", "feedCostPerMonth",
      "vetName", "vetPhone", "healthOnArrival", "insurancePolicy",
      "expectedYield", "expectedRevenue", "expectedWeight", "notes",
      "photoUrl",
    ];

    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        data[key] = req.body[key] === "" ? null : req.body[key];
      }
    }

    const result = await prisma.flock.updateMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      data,
    });

    res.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Update flock error:", error);
    res.status(500).json({ error: "Failed to update flock" });
  }
});

// DELETE /api/flocks/:id
router.delete("/:id", requireOwner, async (req: Request, res: Response) => {
  try {
    // Delete associated vaccinations first
    await prisma.vaccination.deleteMany({
      where: { flockId: Number(req.params.id) },
    });

    await prisma.flock.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete flock error:", error);
    res.status(500).json({ error: "Failed to delete flock" });
  }
});

export default router;
