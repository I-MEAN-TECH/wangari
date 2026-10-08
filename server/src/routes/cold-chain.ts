import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { assessColdChain } from "../lib/cold-chain.js";

/**
 * Cold chain readings (gap-analysis row 15).
 *
 * `PostHarvestBatch.storageTempC` holds one number written once. An avocado
 * export is rejected for an excursion nobody measured, and the buyer asks for
 * the curve. This route is the append-only log that makes the curve exist, and
 * `assessColdChain` turns it into the three questions that decide sellability.
 *
 * Readings are never edited or deleted: an export inspector's question is
 * whether the record is complete, and a deletable temperature is not evidence.
 */

const router = Router();
router.use(authMiddleware, requireFarm);

/** Physically plausible range. Outside this, the value is a typo, not weather. */
const MIN_TEMP_C = -40;
const MAX_TEMP_C = 80;

const STAGES = ["field", "truck", "coldroom", "store"];

/** GET /api/cold-chain/:batchId — readings plus the assessment. */
router.get("/:batchId", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const batchId = Number(req.params.batchId);
    if (!Number.isInteger(batchId)) return res.status(400).json({ error: "Bad batch id" });

    // Scoped by farmId so no farmer can read another farm's temperature curve
    // by guessing an incrementing batch id.
    const batch = await prisma.postHarvestBatch.findFirst({
      where: { id: batchId, farmId },
      select: {
        id: true,
        batchCode: true,
        harvestDate: true,
        quantityKg: true,
        destination: true,
        status: true,
        crop: { select: { name: true } },
      },
    });
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const readings = await prisma.coldChainEvent.findMany({
      where: { batchId },
      orderBy: { recordedAt: "asc" },
      select: { id: true, tempC: true, recordedAt: true, stage: true, notes: true },
    });

    const assessment = assessColdChain(
      readings.map((r) => ({ tempC: Number(r.tempC), recordedAt: r.recordedAt, stage: r.stage ?? undefined })),
      { harvestDate: batch.harvestDate }
    );

    return res.json({ batch, readings, assessment });
  } catch (error) {
    console.error("Cold chain get error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/** POST /api/cold-chain/:batchId — add a reading. */
router.post("/:batchId", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const batchId = Number(req.params.batchId);
    if (!Number.isInteger(batchId)) return res.status(400).json({ error: "Bad batch id" });

    const batch = await prisma.postHarvestBatch.findFirst({
      where: { id: batchId, farmId },
      select: { id: true },
    });
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const tempC = Number(req.body?.tempC);
    if (!Number.isFinite(tempC)) return res.status(400).json({ error: "Enter the temperature", field: "tempC" });
    if (tempC < MIN_TEMP_C || tempC > MAX_TEMP_C) {
      return res.status(400).json({ error: "That is not a real storage temperature", field: "tempC" });
    }

    const reading = await prisma.coldChainEvent.create({
      data: {
        farmId,
        batchId,
        tempC,
        stage: STAGES.includes(req.body?.stage) ? req.body.stage : "coldroom",
        recordedAt: req.body?.recordedAt ? new Date(req.body.recordedAt) : new Date(),
        notes: req.body?.notes?.trim() || null,
      },
    });

    // Re-assess on write so the response always carries the current state. A
    // caller that ignores the response and refetches gets the same answer.
    const readings = await prisma.coldChainEvent.findMany({
      where: { batchId },
      orderBy: { recordedAt: "asc" },
      select: { tempC: true, recordedAt: true, stage: true },
    });
    const harvest = await prisma.postHarvestBatch.findUnique({
      where: { id: batchId },
      select: { harvestDate: true },
    });

    return res.status(201).json({
      reading,
      assessment: assessColdChain(
        readings.map((r) => ({ tempC: Number(r.tempC), recordedAt: r.recordedAt, stage: r.stage ?? undefined })),
        { harvestDate: harvest?.harvestDate }
      ),
    });
  } catch (error) {
    console.error("Cold chain create error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;