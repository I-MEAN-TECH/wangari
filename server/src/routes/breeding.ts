import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireOwner);

/**
 * A heat row has no mating date, and PostgreSQL sorts NULLs FIRST on a DESC
 * order — so ordering by matingDate alone would put every fresh heat observation
 * at the top of the list and push the actual services off the first screen.
 * Ordering by when the row was entered is stable and means "newest record first",
 * which is what a farmer opening this list is looking for.
 */
const NEWEST_RECORD_FIRST = [{ createdAt: "desc" }] as const;

// GET /api/breeding — list all breeding records for the farm
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.breeding.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: [...NEWEST_RECORD_FIRST],
      include: { flock: { select: { name: true, type: true, breed: true } } },
    });
    res.json(data);
  } catch (error) {
    console.error("List breeding error:", error);
    res.status(500).json({ error: "Failed to fetch breeding records" });
  }
});

// GET /api/breeding/flock/:flockId — breeding records for a specific flock
router.get("/flock/:flockId", async (req: Request, res: Response) => {
  try {
    const data = await prisma.breeding.findMany({
      where: {
        flockId: Number(req.params.flockId),
        farmId: req.user!.farmId!,
      },
      orderBy: [...NEWEST_RECORD_FIRST],
    });
    res.json(data);
  } catch (error) {
    console.error("List flock breeding error:", error);
    res.status(500).json({ error: "Failed to fetch breeding records" });
  }
});

/** A date from the client, or null. An unparseable string is null, never
 * `new Date("banana")` — the Invalid Date it produces would be stored and then
 * break every interval computed from it. */
function dayOrNull(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// POST /api/breeding — create a breeding record, a heat observation, or both.
//
// This is the A4 entry point: a heat with no service yet is a real record, so
// neither date is required — but a row with NO date at all is nothing, and is
// rejected rather than stored as an empty entry the farmer will never find
// again.
router.post("/", async (req: Request, res: Response) => {
  try {
    const matingDate = dayOrNull(req.body.matingDate);
    const heatObservedAt = dayOrNull(req.body.heatObservedAt);
    if (!matingDate && !heatObservedAt) {
      return res.status(400).json({
        error: "Record the date you saw her in heat, or the date she was served",
        field: "heatObservedAt",
      });
    }

    const result = await prisma.breeding.create({
      data: {
        flockId: Number(req.body.flockId),
        farmId: req.user!.farmId!,
        sireName: req.body.sireName || null,
        sireBreed: req.body.sireBreed || null,
        damName: req.body.damName || null,
        damBreed: req.body.damBreed || null,
        matingDate,
        heatObservedAt,
        heatSigns: req.body.heatSigns || null,
        dryOffDate: dayOrNull(req.body.dryOffDate),
        expectedBirth: dayOrNull(req.body.expectedBirth),
        method: req.body.method || null,
        // A row with a heat and no service is a "heat"; with a service date it is
        // the pending service it always was. The caller can override.
        status: req.body.status || (matingDate ? "pending" : "heat"),
        notes: req.body.notes || null,
      },
    });
    res.status(201).json(result);
  } catch (error) {
    console.error("Create breeding error:", error);
    res.status(500).json({ error: "Failed to create breeding record" });
  }
});

// PATCH /api/breeding/:id — update (mark as born, add offspring count, etc.)
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const data: Record<string, any> = {};
    if (req.body.status !== undefined) data.status = req.body.status;
    if (req.body.actualBirth !== undefined) data.actualBirth = dayOrNull(req.body.actualBirth);
    if (req.body.offspringCount !== undefined) data.offspringCount = Number(req.body.offspringCount);
    if (req.body.offspringAlive !== undefined) data.offspringAlive = Number(req.body.offspringAlive);
    if (req.body.notes !== undefined) data.notes = req.body.notes;
    if (req.body.sireName !== undefined) data.sireName = req.body.sireName;
    if (req.body.damName !== undefined) data.damName = req.body.damName;
    // A heat recorded, and the two dates the reproduction view needs to draw a
    // cycle and a dry period. Each accepts null to clear it, because a date typed
    // into the wrong row must be removable.
    if (req.body.heatObservedAt !== undefined) data.heatObservedAt = dayOrNull(req.body.heatObservedAt);
    if (req.body.heatSigns !== undefined) data.heatSigns = req.body.heatSigns || null;
    if (req.body.dryOffDate !== undefined) data.dryOffDate = dayOrNull(req.body.dryOffDate);
    // Only when explicitly sent: an edit that adds offspring to a served row must
    // not silently reclassify it.
    if (req.body.matingDate !== undefined) data.matingDate = dayOrNull(req.body.matingDate);

    const result = await prisma.breeding.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(result);
  } catch (error) {
    console.error("Update breeding error:", error);
    res.status(500).json({ error: "Failed to update breeding record" });
  }
});

// DELETE /api/breeding/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.breeding.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete breeding error:", error);
    res.status(500).json({ error: "Failed to delete breeding record" });
  }
});

export default router;
