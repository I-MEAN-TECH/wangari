import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { resolveTagRange } from "../lib/tag-range.js";

const router = Router();
router.use(authMiddleware);

// Species → category map so a flock's category always matches its species,
// whatever the client sends (or doesn't send). Covers all 11 species.
const SPECIES_CATEGORY: Record<string, string> = {
  layers: "poultry", broilers: "poultry", kienyeji: "poultry",
  cattle_dairy: "livestock", cattle_beef: "livestock",
  goats: "livestock", sheep: "livestock", pigs: "livestock", rabbits: "livestock",
  fish: "aquaculture", bees: "other",
};

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
    const {
      name, breed, type, category, initialCount, hatchDate,
      purpose, gender, genderRatio, location,
      source, supplierContact, costPerAnimal, targetMarket,
      feedType, feedSupplier, feedCostPerMonth,
      vetName, vetPhone, healthOnArrival, insurancePolicy,
      expectedYield, expectedRevenue, expectedWeight,
      notes, vaccinationSchedule,
      // ANITRAC: a farmer registers a RANGE of tags for the whole flock, not
      // one number per animal. Three numbers cover a herd of 500.
      tagFrom, tagTo, taggedOn,
    } = req.body;

    const count = Number(initialCount) || 0;
    const cost = costPerAnimal ? Number(costPerAnimal) : null;

    const result = await prisma.flock.create({
      data: {
        farmId: req.user!.farmId!,
        name,
        breed: breed || null,
        type: type || "layers",
        // Default category follows the species when the client sends one;
        // "livestock" is a safer generic than assuming poultry.
        category: category || (type && SPECIES_CATEGORY[type]) || "livestock",
        initialCount: count,
        currentCount: count,
        hatchDate: hatchDate ? new Date(hatchDate) : null,
        createdBy: req.user!.userId,

        // ANITRAC tag range. The farmer supplies the block they were issued;
        // we validate it here and never expand it into rows.
        ...(() => {
          const r = resolveTagRange(tagFrom, tagTo, count);
          if (!r.tags.length) return {};
          return {
            tagFrom: String(tagFrom).replace(/\D/g, ""),
            tagTo: String(tagTo).replace(/\D/g, ""),
            taggedCount: r.span,
            taggedOn: taggedOn ? new Date(taggedOn) : new Date(),
          };
        })(),

        // Extended fields
        purpose: purpose || null,
        gender: gender || null,
        genderRatio: genderRatio || null,
        location: location || null,
        source: source || null,
        supplierContact: supplierContact || null,
        costPerAnimal: cost,
        totalInvestment: cost && count ? count * cost : null,
        targetMarket: targetMarket || null,
        feedType: feedType || null,
        feedSupplier: feedSupplier || null,
        feedCostPerMonth: feedCostPerMonth ? Number(feedCostPerMonth) : null,
        vetName: vetName || null,
        vetPhone: vetPhone || null,
        healthOnArrival: healthOnArrival || null,
        insurancePolicy: insurancePolicy || null,
        expectedYield: expectedYield || null,
        expectedRevenue: expectedRevenue ? Number(expectedRevenue) : null,
        expectedWeight: expectedWeight || null,
        notes: notes || null,
      },
    });

    // Auto-schedule vaccinations if provided
    if (Array.isArray(vaccinationSchedule) && vaccinationSchedule.length > 0) {
      const flockDate = hatchDate ? new Date(hatchDate) : new Date();
      const ageMap: Record<string, number> = {
        "Day 1": 0, "Day 7": 7,
        "Week 1": 7, "Week 2": 14, "Week 3": 21, "Week 4": 28,
        "Week 6": 42, "Week 8": 56, "Week 10": 70, "Week 12": 84,
        "Week 16": 112, "Week 18": 126, "Week 20": 140,
        "Month 1": 30, "Month 2": 60, "Month 3": 90,
        "Month 6": 180, "Month 8": 240, "Month 10": 300, "Month 12": 365,
        "3 months": 90, "6 months": 180,
        "Pre-breeding": 365,
        "8 weeks": 56, "6 weeks": 42,
        "2 months": 60, "4 months": 120,
        "1 month": 30,
        "Preventive": 0, "Monthly": 30,
      };

      const vaccinations = vaccinationSchedule.map((v: any) => {
        const daysToAdd = ageMap[v.ageLabel] ?? 30;
        const scheduled = new Date(flockDate);
        scheduled.setDate(scheduled.getDate() + daysToAdd);

        return {
          flockId: result.id,
          vaccineName: v.vaccine,
          scheduledDate: scheduled,
          status: "pending",
          notes: v.description || null,
        };
      });

      await prisma.vaccination.createMany({ data: vaccinations });
    }

    // Auto-create finance transaction for animal purchase
    const totalInvestment = cost && count ? count * cost : null;
    if (totalInvestment && totalInvestment > 0) {
      try {
        await prisma.transaction.create({
          data: {
            farmId: req.user!.farmId!,
            type: "expense",
            category: "animal_feed",
            description: `Livestock purchase: ${name} (${count} ${category || "animals"})`,
            amount: totalInvestment,
            date: new Date(),
            paymentMethod: "cash",
            createdBy: req.user!.userId,
          },
        });
      } catch (e) {
        // Don't fail flock creation if transaction fails
        console.error("Auto-transaction failed:", e);
      }
    }

    // Re-fetch with vaccinations included
    const flock = await prisma.flock.findUnique({
      where: { id: result.id },
      include: { vaccinations: { orderBy: { scheduledDate: "asc" } } },
    });

    res.status(201).json(flock);
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
