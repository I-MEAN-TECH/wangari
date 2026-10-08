import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireFarm);

// GET /api/crops — list all crops
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.crop.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { createdAt: "desc" },
      include: {
        harvests: { orderBy: { date: "desc" }, take: 10 },
        postHarvestBatches: { orderBy: { harvestDate: "desc" } },
        soilTests: { orderBy: { date: "desc" } },
      },
    });
    res.json(data);
  } catch (error) {
    console.error("List crops error:", error);
    res.status(500).json({ error: "Failed to fetch crops" });
  }
});

// POST /api/crops — create a crop
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, cropType, variety, areaAcres, plantingDate, expectedHarvest, location, soilType, irrigation, notes, isPerennial, maturityYears, harvestSeason } = req.body;
    const crop = await prisma.crop.create({
      data: {
        farmId: req.user!.farmId!,
        name,
        cropType,
        variety: variety || null,
        areaAcres: areaAcres ? Number(areaAcres) : null,
        plantingDate: plantingDate ? new Date(plantingDate) : null,
        expectedHarvest: expectedHarvest ? new Date(expectedHarvest) : null,
        location: location || null,
        soilType: soilType || null,
        irrigation: irrigation || null,
        notes: notes || null,
        isPerennial: Boolean(isPerennial),
        maturityYears: maturityYears ? Number(maturityYears) : null,
        harvestSeason: harvestSeason || null,
        createdBy: req.user!.userId,
      },
    });
    res.status(201).json(crop);
  } catch (error) {
    console.error("Create crop error:", error);
    res.status(500).json({ error: "Failed to create crop" });
  }
});

// PATCH /api/crops/:id — update a crop
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const allowed = ["name", "cropType", "variety", "areaAcres", "plantingDate", "expectedHarvest", "status", "location", "soilType", "irrigation", "notes", "harvestSeason"];
    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key] === "" ? null : req.body[key];
    }
    if (req.body.isPerennial !== undefined) data.isPerennial = Boolean(req.body.isPerennial);
    if (req.body.maturityYears !== undefined) data.maturityYears = req.body.maturityYears === "" || req.body.maturityYears === null ? null : Number(req.body.maturityYears);
    if (req.body.yearsInProduction !== undefined) data.yearsInProduction = req.body.yearsInProduction === "" || req.body.yearsInProduction === null ? null : Number(req.body.yearsInProduction);
    if (data.areaAcres) data.areaAcres = Number(data.areaAcres);
    if (data.plantingDate) data.plantingDate = new Date(data.plantingDate);
    if (data.expectedHarvest) data.expectedHarvest = new Date(data.expectedHarvest);

    const result = await prisma.crop.updateMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      data,
    });
    res.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Update crop error:", error);
    res.status(500).json({ error: "Failed to update crop" });
  }
});

// DELETE /api/crops/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.postHarvestBatch.deleteMany({ where: { cropId: Number(req.params.id) } });
    await prisma.soilTest.deleteMany({ where: { cropId: Number(req.params.id) } });
    await prisma.cropHarvest.deleteMany({ where: { cropId: Number(req.params.id) } });
    await prisma.crop.deleteMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete crop error:", error);
    res.status(500).json({ error: "Failed to delete crop" });
  }
});

// POST /api/crops/:id/harvest — record a harvest
router.post("/:id/harvest", async (req: Request, res: Response) => {
  try {
    const cropId = Number(req.params.id);
    const crop = await prisma.crop.findFirst({ where: { id: cropId, farmId: req.user!.farmId! } });
    if (!crop) return res.status(404).json({ error: "Crop not found" });

    const { date, quantityKg, quality, soldQuantity, salePrice, notes } = req.body;
    const harvest = await prisma.cropHarvest.create({
      data: {
        cropId,
        farmId: req.user!.farmId!,
        date: date ? new Date(date) : new Date(),
        quantityKg: Number(quantityKg),
        quality: quality || null,
        soldQuantity: soldQuantity ? Number(soldQuantity) : null,
        salePrice: salePrice ? Number(salePrice) : null,
        notes: notes || null,
      },
    });

    // Auto-create finance transaction for harvest sale
    if (salePrice && Number(salePrice) > 0) {
      try {
        await prisma.transaction.create({
          data: {
            farmId: req.user!.farmId!,
            type: "income",
            category: "crops",
            description: `Harvest sale: ${crop.cropType} — ${quantityKg}kg${quality ? ` (Grade ${quality})` : ""}`,
            amount: Number(salePrice),
            date: date ? new Date(date) : new Date(),
            paymentMethod: "cash",
            createdBy: req.user!.userId,
          },
        });
      } catch (e) {
        console.error("Auto-transaction failed:", e);
      }
    }

    res.status(201).json(harvest);
  } catch (error) {
    console.error("Record harvest error:", error);
    res.status(500).json({ error: "Failed to record harvest" });
  }
});

// GET /api/crops/:id/harvests — list harvests for a crop
router.get("/:id/harvests", async (req: Request, res: Response) => {
  try {
    const harvests = await prisma.cropHarvest.findMany({
      where: { cropId: Number(req.params.id), farmId: req.user!.farmId! },
      orderBy: { date: "desc" },
    });
    res.json(harvests);
  } catch (error) {
    console.error("List harvests error:", error);
    res.status(500).json({ error: "Failed to fetch harvests" });
  }
});

// PATCH /api/crops/:id/harvest/:harvestId — update a harvest (e.g. bump yearsInProduction on perennials after a season)
router.patch("/:id/harvest/:harvestId", async (req: Request, res: Response) => {
  try {
    const { quality, soldQuantity, salePrice, notes } = req.body;
    const data: Record<string, any> = {};
    if (quality !== undefined) data.quality = quality || null;
    if (soldQuantity !== undefined) data.soldQuantity = soldQuantity === "" ? null : Number(soldQuantity);
    if (salePrice !== undefined) data.salePrice = salePrice === "" ? null : Number(salePrice);
    if (notes !== undefined) data.notes = notes || null;
    const harvest = await prisma.cropHarvest.updateMany({
      where: { id: Number(req.params.harvestId), cropId: Number(req.params.id), farmId: req.user!.farmId! },
      data,
    });
    res.json({ success: true, updated: harvest.count });
  } catch (error) {
    console.error("Update harvest error:", error);
    res.status(500).json({ error: "Failed to update harvest" });
  }
});

// POST /api/crops/:id/health — record a health issue
router.post("/:id/health", async (req: Request, res: Response) => {
  try {
    const cropId = Number(req.params.id);
    const crop = await prisma.crop.findFirst({ where: { id: cropId, farmId: req.user!.farmId! } });
    if (!crop) return res.status(404).json({ error: "Crop not found" });

    const { date, issueType, description, severity, treatment, notes } = req.body;
    const health = await prisma.cropHealth.create({
      data: {
        cropId,
        farmId: req.user!.farmId!,
        date: date ? new Date(date) : new Date(),
        issueType,
        description,
        severity: severity || "low",
        treatment: treatment || null,
        notes: notes || null,
      },
    });
    res.status(201).json(health);
  } catch (error) {
    console.error("Record health error:", error);
    res.status(500).json({ error: "Failed to record health issue" });
  }
});

// GET /api/crops/:id/health — list health issues for a crop
router.get("/:id/health", async (req: Request, res: Response) => {
  try {
    const health = await prisma.cropHealth.findMany({
      where: { cropId: Number(req.params.id), farmId: req.user!.farmId! },
      orderBy: { date: "desc" },
    });
    res.json(health);
  } catch (error) {
    console.error("List health error:", error);
    res.status(500).json({ error: "Failed to fetch health records" });
  }
});

// PATCH /api/crops/health/:id — update health issue (e.g. mark resolved)
router.patch("/health/:id", async (req: Request, res: Response) => {
  try {
    const { outcome, treatment, treatedDate } = req.body;
    const data: Record<string, any> = {};
    if (outcome) data.outcome = outcome;
    if (treatment) data.treatment = treatment;
    if (treatedDate) data.treatedDate = new Date(treatedDate);
    await prisma.cropHealth.updateMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! }, data });
    res.json({ success: true });
  } catch (error) {
    console.error("Update health error:", error);
    res.status(500).json({ error: "Failed to update" });
  }
});

// POST /api/crops/:id/apply — record fertilizer/pesticide/irrigation application
router.post("/:id/apply", async (req: Request, res: Response) => {
  try {
    const cropId = Number(req.params.id);
    const crop = await prisma.crop.findFirst({ where: { id: cropId, farmId: req.user!.farmId! } });
    if (!crop) return res.status(404).json({ error: "Crop not found" });

    const { date, type, productName, quantity, unit, cost, notes, inventoryItemId, phiDays } = req.body;
    const application = await prisma.cropApplication.create({
      data: {
        cropId,
        farmId: req.user!.farmId!,
        date: date ? new Date(date) : new Date(),
        type,
        productName,
        quantity: Number(quantity),
        unit: unit || "kg",
        cost: cost ? Number(cost) : null,
        notes: notes || null,
        phiDays: phiDays ? Number(phiDays) : null,
      },
    });

    // Inventory link: drawing fertilizer/pesticide from stock decrements it
    // and books the expense at the item's unit cost (unless a cost was given).
    let bookedCost = cost ? Number(cost) : null;
    if (inventoryItemId) {
      const item = await prisma.inventory.findFirst({
        where: { id: Number(inventoryItemId), farmId: req.user!.farmId! },
      });
      if (item) {
        const used = Number(quantity);
        const newQty = Math.max(0, Number(item.quantity) - used);
        if (bookedCost == null && Number(item.unitCost) > 0) bookedCost = used * Number(item.unitCost);
        try {
          await prisma.$transaction([
            prisma.inventory.update({ where: { id: item.id }, data: { quantity: newQty } }),
            prisma.inventoryLog.create({
              data: {
                inventoryId: item.id,
                changeType: "consumption",
                quantityChange: -used,
                reason: `Applied to crop: ${type} — ${productName} (${crop.name})`,
                createdBy: req.user!.userId ?? null,
              },
            }),
          ]);
        } catch (e) {
          console.error("Inventory drawdown failed:", e);
        }
      }
    }

    // Auto-create finance transaction for input cost
    if (bookedCost && Number(bookedCost) > 0) {
      try {
        const catMap: Record<string, string> = {
          Fertilizer: "fertilizer",
          Pesticide: "pesticide",
          Herbicide: "pesticide",
          Irrigation: "other",
          "Organic Manure": "fertilizer",
        };
        await prisma.transaction.create({
          data: {
            farmId: req.user!.farmId!,
            type: "expense",
            category: catMap[type] || "other",
            description: `${type}: ${productName} (${quantity} ${unit}) — ${crop.name}`,
            amount: Number(bookedCost),
            date: date ? new Date(date) : new Date(),
            paymentMethod: "cash",
            createdBy: req.user!.userId,
          },
        });
      } catch (e) {
        console.error("Auto-transaction failed:", e);
      }
    }

    res.status(201).json(application);
  } catch (error) {
    console.error("Record application error:", error);
    res.status(500).json({ error: "Failed to record application" });
  }
});

// GET /api/crops/:id/applications — list applications for a crop
router.get("/:id/applications", async (req: Request, res: Response) => {
  try {
    const apps = await prisma.cropApplication.findMany({
      where: { cropId: Number(req.params.id), farmId: req.user!.farmId! },
      orderBy: { date: "desc" },
    });
    res.json(apps);
  } catch (error) {
    console.error("List applications error:", error);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

// ============ Post-harvest batches (export chain) ============

// POST /api/crops/:id/post-harvest — create a batch (auto-codes it AV-2026-001 style)
router.post("/:id/post-harvest", async (req: Request, res: Response) => {
  try {
    const cropId = Number(req.params.id);
    const crop = await prisma.crop.findFirst({ where: { id: cropId, farmId: req.user!.farmId! } });
    if (!crop) return res.status(404).json({ error: "Crop not found" });

    const { harvestDate, quantityKg, grade, dryMatterPct, treatment, notes } = req.body;

    // Export-grade guard on creation too (see PATCH note below).
    const dmCreate = dryMatterPct !== undefined && dryMatterPct !== "" && dryMatterPct !== null ? Number(dryMatterPct) : null;
    if (crop.cropType?.toLowerCase().includes("avocado") && dmCreate != null && dmCreate < 21 && grade?.toLowerCase().includes("export")) {
      return res.status(400).json({ error: "Dry matter below 21% cannot be graded Export — immature fruit will not ripen. Grade as Domestic or leave on tree." });
    }

    const count = await prisma.postHarvestBatch.count({ where: { farmId: req.user!.farmId! } });
    const prefix = crop.cropType.slice(0, 2).toUpperCase();
    const year = new Date().getFullYear();

    const batch = await prisma.postHarvestBatch.create({
      data: {
        cropId,
        farmId: req.user!.farmId!,
        batchCode: `${prefix}-${year}-${String(count + 1).padStart(3, "0")}`,
        harvestDate: harvestDate ? new Date(harvestDate) : new Date(),
        quantityKg: Number(quantityKg),
        grade: grade || null,
        dryMatterPct: dryMatterPct !== undefined && dryMatterPct !== "" && dryMatterPct !== null ? Number(dryMatterPct) : null,
        treatment: treatment || null,
        notes: notes || null,
      },
    });
    res.status(201).json(batch);
  } catch (error) {
    console.error("Create post-harvest batch error:", error);
    res.status(500).json({ error: "Failed to create post-harvest batch" });
  }
});

// GET /api/crops/:id/post-harvest — list batches for a crop
router.get("/:id/post-harvest", async (req: Request, res: Response) => {
  try {
    const batches = await prisma.postHarvestBatch.findMany({
      where: { cropId: Number(req.params.id), farmId: req.user!.farmId! },
      orderBy: { harvestDate: "desc" },
    });
    res.json(batches);
  } catch (error) {
    console.error("List post-harvest batches error:", error);
    res.status(500).json({ error: "Failed to fetch post-harvest batches" });
  }
});

// PATCH /api/post-harvest/:id — advance a batch through the chain
// (grade → treat → cool → pack → dispatch). Validates the avocado dry-matter rule.
router.patch("/post-harvest/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.postHarvestBatch.findFirst({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    if (!existing) return res.status(404).json({ error: "Batch not found" });

    const { grade, dryMatterPct, treatment, treatmentDate, cooledAt, storageTempC, storageExitedAt, packedQtyKg, cartons, status, destination, phytoCertNo, notes } = req.body;
    const data: Record<string, any> = {};

    if (grade !== undefined) data.grade = grade || null;
    if (dryMatterPct !== undefined) data.dryMatterPct = dryMatterPct === "" || dryMatterPct === null ? null : Number(dryMatterPct);
    if (treatment !== undefined) data.treatment = treatment || null;
    if (treatmentDate !== undefined) data.treatmentDate = treatmentDate ? new Date(treatmentDate) : null;
    if (cooledAt !== undefined) data.cooledAt = cooledAt ? new Date(cooledAt) : null;
    if (storageTempC !== undefined) data.storageTempC = storageTempC === "" || storageTempC === null ? null : Number(storageTempC);
    if (storageExitedAt !== undefined) data.storageExitedAt = storageExitedAt ? new Date(storageExitedAt) : null;
    if (packedQtyKg !== undefined) data.packedQtyKg = packedQtyKg === "" || packedQtyKg === null ? null : Number(packedQtyKg);
    if (cartons !== undefined) data.cartons = cartons === "" || cartons === null ? null : Number(cartons);
    if (status !== undefined) data.status = status;
    if (destination !== undefined) data.destination = destination || null;
    if (phytoCertNo !== undefined) data.phytoCertNo = phytoCertNo || null;
    if (notes !== undefined) data.notes = notes || null;

    // Export-grade guard: Hass below 21% dry matter will never ripen — reject it
    // rather than let it reach an EU buyer (RASFF alert risk).
    const dm = data.dryMatterPct ?? (existing.dryMatterPct ? Number(existing.dryMatterPct) : null);
    const crop = await prisma.crop.findUnique({ where: { id: existing.cropId } });
    const isAvocado = crop?.cropType?.toLowerCase().includes("avocado");
    if (isAvocado && dm != null && dm < 21 && (data.grade ? data.grade.toLowerCase().includes("export") : existing.grade?.toLowerCase().includes("export"))) {
      return res.status(400).json({ error: "Dry matter below 21% cannot be graded Export — immature fruit will not ripen. Grade as Domestic or leave on tree." });
    }

    const batch = await prisma.postHarvestBatch.update({ where: { id: existing.id }, data });
    res.json(batch);
  } catch (error) {
    console.error("Update post-harvest batch error:", error);
    res.status(500).json({ error: "Failed to update post-harvest batch" });
  }
});

// DELETE /api/post-harvest/:id
router.delete("/post-harvest/:id", async (req: Request, res: Response) => {
  try {
    await prisma.postHarvestBatch.deleteMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete post-harvest batch error:", error);
    res.status(500).json({ error: "Failed to delete post-harvest batch" });
  }
});

// GET /api/crops/insights — PHI alerts, harvest season reminders & per-crop profitability
router.get("/insights", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const crops = await prisma.crop.findMany({
      where: { farmId },
      include: {
        applications: { orderBy: { date: "desc" } },
        harvests: { orderBy: { date: "desc" } },
      },
    });

    const now = new Date();

    // ── PHI alerts: active pre-harvest-interval windows after pesticide sprays ──
    const phiAlerts = crops.flatMap((crop) =>
      crop.applications
        .filter((a) => a.type === "Pesticide" && a.phiDays && Number(a.phiDays) > 0)
        .map((a) => {
          const safeDate = new Date(a.date);
          safeDate.setDate(safeDate.getDate() + Number(a.phiDays));
          const daysLeft = Math.ceil((safeDate.getTime() - now.getTime()) / 86400000);
          return {
            cropId: crop.id,
            cropName: crop.name,
            cropType: crop.cropType,
            productName: a.productName,
            sprayedOn: a.date,
            phiDays: Number(a.phiDays),
            safeDate,
            daysLeft,
            safe: daysLeft <= 0,
          };
        })
        .filter((a) => a.daysLeft >= 0 && a.daysLeft <= 60) // only current windows
    ).sort((a, b) => a.daysLeft - b.daysLeft);

    // ── Harvest reminders: expected-harvest dates within 14 days + harvest season windows ──
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const parseSeason = (season: string): { startMonth: number; endMonth: number } | null => {
      const m = season.match(/([A-Za-z]{3,})\s*[-–to]+\s*([A-Za-z]{3,})/);
      if (!m) return null;
      const start = MONTHS.findIndex((mo) => mo.toLowerCase() === m[1].slice(0, 3).toLowerCase());
      const end = MONTHS.findIndex((mo) => mo.toLowerCase() === m[2].slice(0, 3).toLowerCase());
      if (start < 0 || end < 0) return null;
      return { startMonth: start, endMonth: end };
    };

    const reminders = crops.flatMap((crop) => {
      const out: any[] = [];
      if (crop.expectedHarvest && crop.status === "active") {
        const daysLeft = Math.ceil((new Date(crop.expectedHarvest).getTime() - now.getTime()) / 86400000);
        if (daysLeft >= 0 && daysLeft <= 14) {
          out.push({ cropId: crop.id, cropName: crop.name, cropType: crop.cropType, kind: "expected-date", message: daysLeft === 0 ? "Expected harvest is today" : `Expected harvest in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, date: crop.expectedHarvest });
        }
      }
      if (crop.harvestSeason) {
        const s = parseSeason(crop.harvestSeason);
        if (s) {
          const month = now.getMonth();
          const inSeason = s.startMonth <= s.endMonth ? month >= s.startMonth && month <= s.endMonth : month >= s.startMonth || month <= s.endMonth;
          const monthsToStart = (s.startMonth - month + 12) % 12;
          if (inSeason) {
            out.push({ cropId: crop.id, cropName: crop.name, cropType: crop.cropType, kind: "season-open", message: `Harvest season is open (${crop.harvestSeason}) — schedule picking labour`, date: null });
          } else if (monthsToStart > 0 && monthsToStart <= 1) {
            out.push({ cropId: crop.id, cropName: crop.name, cropType: crop.cropType, kind: "season-upcoming", message: `Harvest season (${crop.harvestSeason}) starts next month — prepare crates, cold room & buyers`, date: null });
          }
        }
      }
      return out;
    });

    // ── Profitability per crop block: input costs vs harvest revenue ──
    const profitability = crops.map((crop) => {
      const inputCost = crop.applications.reduce((sum, a) => sum + Number(a.cost || 0), 0);
      // salePrice is booked as total income per harvest record (see harvest auto-transaction)
      const revenue = crop.harvests.reduce((sum, h) => sum + Number(h.salePrice || 0), 0);
      const totalKg = crop.harvests.reduce((sum, h) => sum + Number(h.quantityKg || 0), 0);
      const profit = revenue - inputCost;
      return {
        cropId: crop.id,
        cropName: crop.name,
        cropType: crop.cropType,
        areaAcres: crop.areaAcres ? Number(crop.areaAcres) : null,
        inputCost,
        revenue,
        profit,
        marginPct: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : null,
        totalKg,
        costPerKg: totalKg > 0 ? Number((inputCost / totalKg).toFixed(2)) : null,
        applicationCount: crop.applications.length,
        harvestCount: crop.harvests.length,
      };
    });

    res.json({ phiAlerts, reminders, profitability });
  } catch (error) {
    console.error("Crop insights error:", error);
    res.status(500).json({ error: "Failed to compute crop insights" });
  }
});

// ============ Soil tests ============

// POST /api/soil-tests — record a soil test (optionally tied to a crop)
router.post("/soil-tests", async (req: Request, res: Response) => {
  try {
    const { cropId, date, labName, ph, nitrogen, phosphorus, potassium, organicMatterPct, recommendation, notes } = req.body;
    const test = await prisma.soilTest.create({
      data: {
        farmId: req.user!.farmId!,
        cropId: cropId ? Number(cropId) : null,
        date: date ? new Date(date) : new Date(),
        labName: labName || null,
        ph: ph !== undefined && ph !== "" && ph !== null ? Number(ph) : null,
        nitrogen: nitrogen || null,
        phosphorus: phosphorus || null,
        potassium: potassium || null,
        organicMatterPct: organicMatterPct !== undefined && organicMatterPct !== "" && organicMatterPct !== null ? Number(organicMatterPct) : null,
        recommendation: recommendation || null,
        notes: notes || null,
      },
    });
    res.status(201).json(test);
  } catch (error) {
    console.error("Create soil test error:", error);
    res.status(500).json({ error: "Failed to create soil test" });
  }
});

// GET /api/soil-tests — list soil tests (optionally filtered by crop)
router.get("/soil-tests", async (req: Request, res: Response) => {
  try {
    const where: Record<string, any> = { farmId: req.user!.farmId! };
    if (req.query.cropId) where.cropId = Number(req.query.cropId);
    const tests = await prisma.soilTest.findMany({ where, orderBy: { date: "desc" } });
    res.json(tests);
  } catch (error) {
    console.error("List soil tests error:", error);
    res.status(500).json({ error: "Failed to fetch soil tests" });
  }
});

export default router;
