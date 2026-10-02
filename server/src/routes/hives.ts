import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

/**
 * Hives — beekeeping, where the unit is the COLONY, never the bee.
 *
 * A hive holds tens of thousands of insects and no beekeeper tags, counts or
 * identifies individual bees. Every real apiary logbook records per hive:
 * colony strength, queen status, stores, varroa counts, honey harvested.
 *
 * This mirrors how a flock already works for poultry: you record the unit you
 * actually manage. So a beekeeper with 40 hives enters 40 hives once, then one
 * short row per inspection — never anything about an individual bee.
 */

const router = Router();
router.use(authMiddleware);

const HIVE_STATUS = new Set(["active", "weak", "swarm", "dead", "requeened"]);
const HIVE_TYPES = new Set(["langstroth", "topbar", "traditional", "flow"]);

// GET /api/hives — list this farm's hives with their latest inspection
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const hives = await prisma.hive.findMany({
      where: { farmId },
      orderBy: { name: "asc" },
      include: {
        inspections: { orderBy: { inspectedAt: "desc" }, take: 1 },
      },
    });

    // Honey totals are what a beekeeper actually wants to know.
    const totals = await prisma.hiveInspection.aggregate({
      where: { hive: { farmId } },
      _sum: { honeyKg: true },
      _count: { _all: true },
    });

    res.json({
      hives,
      totalHives: hives.length,
      activeHives: hives.filter((h) => h.status === "active").length,
      totalHoneyKg: Number(totals._sum.honeyKg || 0),
      inspectionCount: totals._count._all,
    });
  } catch (error) {
    console.error("List hives error:", error);
    res.status(500).json({ error: "Failed to fetch hives" });
  }
});

// POST /api/hives — add a hive
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, hiveType, status, queenYear, queenStatus, frames, location, establishedOn, notes } =
      req.body || {};
    if (!name || !String(name).trim())
      return res.status(400).json({ error: "Weka jina la kizima" });
    if (hiveType && !HIVE_TYPES.has(hiveType))
      return res.status(400).json({ error: "Aina ya kizima haijulikani" });
    if (status && !HIVE_STATUS.has(status))
      return res.status(400).json({ error: "Hali ya kizima haijulikani" });

    const dupe = await prisma.hive.findFirst({
      where: { farmId: req.user!.farmId!, name: String(name).trim() },
      select: { id: true },
    });
    if (dupe)
      return res.status(409).json({ error: "Kizima kile majina kipo tayari" });

    const hive = await prisma.hive.create({
      data: {
        farmId: req.user!.farmId!,
        name: String(name).trim(),
        hiveType: hiveType || null,
        status: status || "active",
        queenYear: queenYear ? Number(queenYear) : null,
        queenStatus: queenStatus || null,
        frames: frames ? Number(frames) : null,
        location: location || null,
        establishedOn: establishedOn ? new Date(establishedOn) : null,
        notes: notes || null,
      },
    });
    res.status(201).json(hive);
  } catch (error) {
    console.error("Create hive error:", error);
    res.status(500).json({ error: "Failed to add the hive" });
  }
});

// PATCH /api/hives/:id — update a hive (status, queen, frames, location)
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const { status, queenYear, queenStatus, frames, location, notes } = req.body || {};
    if (status && !HIVE_STATUS.has(status))
      return res.status(400).json({ error: "Hali ya kizima haijulikani" });

    const existing = await prisma.hive.findFirst({
      where: { id: Number(req.params.id), farmId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Kizima hakikufikuliwa" });

    const hive = await prisma.hive.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(status ? { status } : {}),
        ...(queenYear !== undefined ? { queenYear: queenYear ? Number(queenYear) : null } : {}),
        ...(queenStatus !== undefined ? { queenStatus: queenStatus || null } : {}),
        ...(frames !== undefined ? { frames: frames ? Number(frames) : null } : {}),
        ...(location !== undefined ? { location: location || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
      },
    });
    res.json(hive);
  } catch (error) {
    console.error("Update hive error:", error);
    res.status(500).json({ error: "Failed to update the hive" });
  }
});

// DELETE /api/hives/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const result = await prisma.hive.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!result.count) return res.status(404).json({ error: "Kizima hakikufikuliwa" });
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete hive error:", error);
    res.status(500).json({ error: "Failed to remove the hive" });
  }
});

// POST /api/hives/:id/inspections — log one hive inspection
router.post("/:id/inspections", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const {
      inspectedAt,
      broodFrames,
      storesFrames,
      queenSeen,
      queenCells,
      varroaCount,
      honeyKg,
      actionTaken,
      notes,
    } = req.body || {};

    const hive = await prisma.hive.findFirst({
      where: { id: Number(req.params.id), farmId },
      select: { id: true },
    });
    if (!hive) return res.status(404).json({ error: "Kizima hakikufikuliwa" });

    const inspection = await prisma.hiveInspection.create({
      data: {
        hiveId: hive.id,
        inspectedAt: inspectedAt ? new Date(inspectedAt) : new Date(),
        broodFrames: broodFrames ? Number(broodFrames) : null,
        storesFrames: storesFrames ? Number(storesFrames) : null,
        queenSeen: queenSeen === undefined || queenSeen === null ? null : Boolean(queenSeen),
        queenCells: queenCells ? Number(queenCells) : null,
        varroaCount: varroaCount ? Number(varroaCount) : null,
        honeyKg: honeyKg ? Number(honeyKg) : null,
        actionTaken: actionTaken || null,
        notes: notes || null,
        createdBy: req.user!.userId,
      },
    });

    // A colony that has stopped laying should not keep showing as "active".
    if (broodFrames != null && Number(broodFrames) <= 1 && actionTaken !== "dead") {
      await prisma.hive.update({ where: { id: hive.id }, data: { status: "weak" } });
    }

    res.status(201).json(inspection);
  } catch (error) {
    console.error("Create hive inspection error:", error);
    res.status(500).json({ error: "Failed to save the inspection" });
  }
});

// GET /api/hives/:id/inspections — inspection history for one hive
router.get("/:id/inspections", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const hive = await prisma.hive.findFirst({
      where: { id: Number(req.params.id), farmId },
      select: { id: true, name: true },
    });
    if (!hive) return res.status(404).json({ error: "Kizima hakikufikuliwa" });

    const inspections = await prisma.hiveInspection.findMany({
      where: { hiveId: hive.id },
      orderBy: { inspectedAt: "desc" },
    });
    res.json({ hive, inspections });
  } catch (error) {
    console.error("List hive inspections error:", error);
    res.status(500).json({ error: "Failed to fetch inspections" });
  }
});

export default router;