import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { parseGps } from "../lib/kiamis.js";
import { buildPlotTrace } from "../lib/plot-trace.js";

const router = Router();
router.use(authMiddleware, requireFarm);

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET /api/plots — list this farm's plots, each with its crops
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.plot.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { createdAt: "desc" },
      include: {
        crops: {
          select: { id: true, name: true, cropType: true, status: true, areaAcres: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    res.json(data);
  } catch (error) {
    console.error("List plots error:", error);
    res.status(500).json({ error: "Failed to fetch plots" });
  }
});

// POST /api/plots — create a plot
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, areaValue, areaUnit, soilType, notes } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "A plot name is required (e.g. Coffee block C)" });
    }
    // Geolocation is a pair or not at all — a lone coordinate is a point
    // somewhere in the Indian Ocean, exactly how the farm's own GPS is treated.
    const gps = parseGps(req.body.latitude, req.body.longitude);
    if (!gps.ok) return res.status(400).json({ error: gps.error });

    const plot = await prisma.plot.create({
      data: {
        farmId: req.user!.farmId!,
        name: String(name).trim(),
        areaValue: num(areaValue),
        areaUnit: areaUnit || null,
        latitude: gps.value?.latitude ?? null,
        longitude: gps.value?.longitude ?? null,
        soilType: soilType || null,
        notes: notes || null,
        createdBy: req.user!.userId,
      },
    });
    res.status(201).json(plot);
  } catch (error) {
    console.error("Create plot error:", error);
    res.status(500).json({ error: "Failed to create plot" });
  }
});

// PATCH /api/plots/:id — update a plot
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.plot.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!existing) return res.status(404).json({ error: "Plot not found" });

    const data: Record<string, any> = {};
    if (req.body.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body.areaValue !== undefined) data.areaValue = num(req.body.areaValue);
    if (req.body.areaUnit !== undefined) data.areaUnit = req.body.areaUnit || null;
    if (req.body.soilType !== undefined) data.soilType = req.body.soilType || null;
    if (req.body.notes !== undefined) data.notes = req.body.notes || null;

    // GPS update: validate the pair before overwriting either coordinate so a
    // lone value can never strand the plot half-located.
    if (req.body.latitude !== undefined || req.body.longitude !== undefined) {
      const lat = req.body.latitude !== undefined ? req.body.latitude : existing.latitude === null ? "" : Number(existing.latitude);
      const lng = req.body.longitude !== undefined ? req.body.longitude : existing.longitude === null ? "" : Number(existing.longitude);
      const gps = parseGps(lat, lng);
      if (!gps.ok) return res.status(400).json({ error: gps.error });
      data.latitude = gps.value?.latitude ?? null;
      data.longitude = gps.value?.longitude ?? null;
    }

    const updated = await prisma.plot.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (error) {
    console.error("Update plot error:", error);
    res.status(500).json({ error: "Failed to update plot" });
  }
});

// DELETE /api/plots/:id — remove a plot; its crops keep standing, just unlinked
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.plot.deleteMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete plot error:", error);
    res.status(500).json({ error: "Failed to delete plot" });
  }
});

// GET /api/plots/:id/trace — the EUDR/agronomy traceability chain (B2)
// Plot → crops → harvests → post-harvest batches. This is the ONE document a
// farmer hands a buyer: the piece of ground, its GPS, and every harvest and
// export batch that left it. Honesty rules live in the pure lib: a plot with
// no coordinates (or a lone one) is not traceable and the missing[] list says
// exactly what stands between the farmer and a hand-to-buyer chain.
router.get("/:id/trace", async (req: Request, res: Response) => {
  try {
    const plot = await prisma.plot.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      include: {
        crops: {
          include: {
            harvests: { orderBy: { date: "desc" } },
            postHarvestBatches: { orderBy: { harvestDate: "desc" } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!plot) return res.status(404).json({ error: "Plot not found" });

    const chain = buildPlotTrace({
      plotId: plot.id,
      name: plot.name,
      latitude: plot.latitude !== null ? Number(plot.latitude) : null,
      longitude: plot.longitude !== null ? Number(plot.longitude) : null,
      areaUnit: plot.areaUnit,
      areaValue: plot.areaValue !== null ? Number(plot.areaValue) : null,
      soilType: plot.soilType,
      crops: plot.crops.map((c: any) => ({
        cropId: c.id,
        name: c.name,
        cropType: c.cropType,
        harvests: c.harvests.map((h: any) => ({
          harvestId: h.id,
          date: h.date,
          quantityKg: Number(h.quantityKg),
          quality: h.quality,
        })),
        batches: c.postHarvestBatches.map((b: any) => ({
          batchId: b.id,
          batchCode: b.batchCode,
          harvestDate: b.harvestDate,
          destination: b.destination,
          grade: b.grade,
        })),
      })),
    });
    res.json(chain);
  } catch (error) {
    console.error("Plot trace error:", error);
    res.status(500).json({ error: "Failed to build plot trace" });
  }
});

// GET /api/plots/:id — a single plot (must come AFTER /:id/trace so "trace"
// isn't parsed as an id)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const data = await prisma.plot.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      include: { crops: { select: { id: true, name: true, cropType: true, status: true } } },
    });
    if (!data) return res.status(404).json({ error: "Plot not found" });
    res.json(data);
  } catch (error) {
    console.error("Get plot error:", error);
    res.status(500).json({ error: "Failed to fetch plot" });
  }
});

export default router;