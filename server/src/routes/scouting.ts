import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { cropPressure, followUpsDue, type ScoutingRecord } from "../lib/scouting.js";

/**
 * Structured pest scouting (gap report §2 B3).
 *
 * Mounted on its own path (`/api/scouting`) rather than bolted onto
 * `/api/crops`, which already carries a PATCH /health/:id and several sub-paths —
 * the same shadowing reason `/api/plots` and `/api/animals` got their own mount.
 *
 * It reads and writes `CropHealth`, the table the farmer's scouting already lands
 * in. Nothing is duplicated: this router simply lets the two COUNTS through,
 * which is all that was missing for an incidence percentage.
 *
 * Scoping: `requireFarm`, not `requireOwner`. Scouting is the one crop record
 * most likely to be entered by a worker walking the field, and locking it to the
 * owner would mean the person who actually saw the pest cannot record it.
 */

const router = Router();
router.use(authMiddleware, requireFarm);

const ISSUE_TYPES = ["pest", "disease", "weed", "nutrient"];
const SEVERITIES = ["low", "medium", "high"];
const OUTCOMES = ["resolved", "ongoing", "failed"];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toRecord(r: {
  id: number;
  cropId: number;
  date: Date;
  issueType: string;
  description: string;
  severity: string;
  sampleSize: number | null;
  affectedCount: number | null;
  pestStage: string | null;
  treatment: string | null;
  treatedDate: Date | null;
  followUpOn: Date | null;
  outcome: string | null;
}): ScoutingRecord {
  return {
    id: r.id,
    cropId: r.cropId,
    date: new Date(r.date),
    issueType: r.issueType,
    description: r.description,
    severity: r.severity,
    sampleSize: r.sampleSize,
    affectedCount: r.affectedCount,
    pestStage: r.pestStage,
    treatment: r.treatment,
    treatedDate: r.treatedDate ? new Date(r.treatedDate) : null,
    followUpOn: r.followUpOn ? new Date(r.followUpOn) : null,
    outcome: r.outcome,
  };
}

/**
 * GET /api/scouting — per-crop pressure, what to walk next, and what is overdue.
 *
 * Also returns the raw records, because the form has to be able to correct what
 * is already there and a row the farmer can point at is a row they can fix.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const days = Math.min(Number(req.query.days) || 90, 400);
    const since = new Date(Date.now() - days * 86400000);

    const [rows, crops] = await Promise.all([
      prisma.cropHealth.findMany({
        where: { farmId, date: { gte: since } },
        orderBy: { date: "desc" },
        take: 300,
      }),
      prisma.crop.findMany({
        where: { farmId, status: "active" },
        select: { id: true, name: true, cropType: true },
      }),
    ]);

    const records = rows.map(toRecord);
    const names = new Map(crops.map((c) => [c.id, c]));

    res.json({
      days,
      // Pressure first — the order to walk the farm in.
      crops: cropPressure(records, new Date()).map((c) => ({
        ...c,
        cropName: names.get(c.cropId)?.name ?? `Crop #${c.cropId}`,
        cropType: names.get(c.cropId)?.cropType ?? null,
      })),
      // What the farmer said they would look at again, oldest first.
      followUpsDue: followUpsDue(records, new Date()).map((r) => ({
        ...r,
        cropName: names.get(r.cropId)?.name ?? `Crop #${r.cropId}`,
      })),
      records: records.map((r) => ({ ...r, cropName: names.get(r.cropId)?.name ?? `Crop #${r.cropId}` })),
    });
  } catch (error) {
    console.error("Scouting list error:", error);
    res.status(500).json({ error: "Failed to load scouting" });
  }
});

// POST /api/scouting — one walk through the field.
router.post("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const cropId = Number(req.body?.cropId);
    if (!Number.isInteger(cropId)) return res.status(400).json({ error: "Which crop did you look at?", field: "cropId" });

    // The crop must be this farm's, or a scouting record could be filed against a
    // stranger's crop and read back through this endpoint's name lookup.
    const crop = await prisma.crop.findFirst({ where: { id: cropId, farmId }, select: { id: true } });
    if (!crop) return res.status(400).json({ error: "That crop is not on this farm", field: "cropId" });

    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    if (!description) {
      return res.status(400).json({ error: "Describe what you saw", field: "description" });
    }

    const sampleSize = num(req.body?.sampleSize);
    const affectedCount = num(req.body?.affectedCount);
    // Deliberately NOT rejected when the counts do not add up: the farmer has
    // walked the field and the record must be saved. `lib/scouting.ts` flags the
    // impossible pair on read so the typo is visible instead of blocking the work.

    const record = await prisma.cropHealth.create({
      data: {
        cropId,
        farmId,
        date: dateOrNull(req.body?.date) ?? new Date(),
        issueType: ISSUE_TYPES.includes(req.body?.issueType) ? req.body.issueType : "pest",
        description,
        severity: SEVERITIES.includes(req.body?.severity) ? req.body.severity : "low",
        sampleSize,
        affectedCount,
        pestStage: typeof req.body?.pestStage === "string" && req.body.pestStage.trim() ? req.body.pestStage.trim() : null,
        treatment: req.body?.treatment?.trim() || null,
        treatedDate: dateOrNull(req.body?.treatedDate),
        followUpOn: dateOrNull(req.body?.followUpOn),
        outcome: OUTCOMES.includes(req.body?.outcome) ? req.body.outcome : null,
      },
    });
    return res.status(201).json(record);
  } catch (error) {
    console.error("Scouting create error:", error);
    return res.status(500).json({ error: "Failed to save the scouting record" });
  }
});

// PATCH /api/scouting/:id — record the outcome, or fix a count.
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const id = Number(req.params.id);
    const existing = await prisma.cropHealth.findFirst({ where: { id, farmId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Record not found" });

    const updated = await prisma.cropHealth.update({
      where: { id },
      data: {
        ...(req.body?.description !== undefined ? { description: String(req.body.description).trim() } : {}),
        ...(req.body?.severity !== undefined && SEVERITIES.includes(req.body.severity) ? { severity: req.body.severity } : {}),
        ...(req.body?.sampleSize !== undefined ? { sampleSize: num(req.body.sampleSize) } : {}),
        ...(req.body?.affectedCount !== undefined ? { affectedCount: num(req.body.affectedCount) } : {}),
        ...(req.body?.pestStage !== undefined ? { pestStage: req.body.pestStage || null } : {}),
        ...(req.body?.treatment !== undefined ? { treatment: req.body.treatment?.trim() || null } : {}),
        ...(req.body?.treatedDate !== undefined ? { treatedDate: dateOrNull(req.body.treatedDate) } : {}),
        ...(req.body?.followUpOn !== undefined ? { followUpOn: dateOrNull(req.body.followUpOn) } : {}),
        ...(req.body?.outcome !== undefined ? { outcome: OUTCOMES.includes(req.body.outcome) ? req.body.outcome : null } : {}),
      },
    });
    return res.json(updated);
  } catch (error) {
    console.error("Scouting update error:", error);
    return res.status(500).json({ error: "Failed to update the scouting record" });
  }
});

// DELETE /api/scouting/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const removed = await prisma.cropHealth.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!removed.count) return res.status(404).json({ error: "Record not found" });
    return res.json({ success: true });
  } catch (error) {
    console.error("Scouting delete error:", error);
    return res.status(500).json({ error: "Failed to delete the scouting record" });
  }
});

export default router;
