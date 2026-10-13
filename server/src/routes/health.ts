import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { activeWithdrawals, unrecordedWithdrawals, withdrawalAdvice, type WithdrawalRecord } from "../lib/withdrawal.js";

/**
 * Per-animal health and disease log (gap-analysis row 5).
 *
 * Flock-level fields on `Flock` (vetName, healthOnArrival) describe the batch.
 * This route describes the animal. The `animalId` is optional on purpose: most
 * Kenyan keepers manage in small groups and will never tag, so forcing a tag
 * would mean most farmers never use this at all.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

const TYPES = ["observation", "treatment", "diagnosis", "death", "check"];

/** A withdrawal date, pinned to a calendar day. Null for absent or unparseable. */
function withdrawalDay(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * GET /api/health-records/withdrawals — which animals' milk or eggs are still
 * protected today, and which treatments have no date to count from.
 *
 * This is the query the delivery form calls before it lets a farmer sell milk
 * that is inside a window. It reads the last 60 days and lets the pure lib decide
 * what is live — a record from two seasons ago is not a live window.
 */
router.get("/withdrawals", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const since = new Date(Date.now() - 60 * 86400000);

    const rows = await prisma.healthRecord.findMany({
      where: { farmId, observedAt: { gte: since } },
      orderBy: { observedAt: "desc" },
      select: {
        id: true, animalId: true, flockId: true, condition: true, action: true,
        observedAt: true, withdrawalUntil: true, withdrawalNote: true,
        animal: { select: { id: true, tagNumber: true, species: true } },
        flock: { select: { id: true, name: true } },
      },
    });

    const records: WithdrawalRecord[] = rows.map((r) => ({
      id: r.id,
      animalId: r.animalId,
      flockId: r.flockId,
      condition: r.condition,
      action: r.action,
      observedAt: new Date(r.observedAt),
      withdrawalUntil: r.withdrawalUntil ? new Date(r.withdrawalUntil) : null,
      withdrawalNote: r.withdrawalNote,
    }));

    const labels = new Map(
      rows.map((r) => [
        r.id,
        r.animal?.tagNumber ?? r.flock?.name ?? null,
      ])
    );
    const decorate = (s: ReturnType<typeof activeWithdrawals>[number]) => ({
      ...s,
      label: labels.get(s.record.id) ?? null,
    });

    const now = new Date();
    const kind = typeof req.query.product === "string" ? req.query.product : "milk";

    return res.json({
      active: activeWithdrawals(records, now).map(decorate),
      unrecorded: unrecordedWithdrawals(records, now).map(decorate),
      // The one line the delivery form shows, already written by the lib so the
      // screen and the API can never disagree about what it says.
      advice: withdrawalAdvice(records, kind, now),
      windowDays: 60,
    });
  } catch (error) {
    console.error("Withdrawals error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/** GET /api/health-records — recent records, newest first. */
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const take = Math.min(Number(req.query.take) || 100, 200);

    const data = await prisma.healthRecord.findMany({
      where: { farmId },
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
      take,
      include: {
        flock: { select: { id: true, name: true } },
        animal: { select: { id: true, tagNumber: true, species: true, status: true } },
      },
    });

    return res.json(data);
  } catch (error) {
    console.error("Health records list error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/** GET /api/health-records/animals/:animalId — one animal's health history. */
router.get("/animals/:animalId", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const animalId = Number(req.params.animalId);
    if (!Number.isInteger(animalId)) return res.status(400).json({ error: "Bad animal id" });

    // Scope by farmId as well as id: without it, any farmer could read another
    // farm's animal health history by guessing an incrementing id.
    const animal = await prisma.animal.findFirst({
      where: { id: animalId, farmId },
      select: { id: true, tagNumber: true, species: true, status: true },
    });
    if (!animal) return res.status(404).json({ error: "Animal not found" });

    const records = await prisma.healthRecord.findMany({
      where: { farmId, animalId },
      orderBy: { observedAt: "desc" },
    });

    return res.json({ animal, records });
  } catch (error) {
    console.error("Animal health error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/** POST /api/health-records */
router.post("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const condition = typeof req.body?.condition === "string" ? req.body.condition.trim() : "";
    if (!condition) return res.status(400).json({ error: "Say what is wrong", field: "condition" });

    const type = TYPES.includes(req.body?.type) ? req.body.type : "observation";
    const flockId = req.body?.flockId ? Number(req.body.flockId) : null;
    const animalId = req.body?.animalId ? Number(req.body.animalId) : null;

    // Validate ownership of the referenced flock and animal. A farmer could
    // otherwise attach a record to another farm's flock and read its name back.
    if (flockId) {
      const flock = await prisma.flock.findFirst({ where: { id: flockId, farmId }, select: { id: true } });
      if (!flock) return res.status(400).json({ error: "That flock is not on this farm", field: "flockId" });
    }
    // An animal belongs to a flock (usually). Derive flockId from the animal
    // rather than trusting the client's flockId, so a record can never claim an
    // animal belongs to a flock it does not. Reuses the ownership check above
    // rather than re-querying.
    let resolvedFlockId = flockId;
    if (animalId) {
      const animal = await prisma.animal.findFirst({ where: { id: animalId, farmId }, select: { id: true, flockId: true } });
      if (!animal) return res.status(400).json({ error: "That animal is not on this farm", field: "animalId" });
      resolvedFlockId = animal.flockId ?? flockId;
    }

    const record = await prisma.healthRecord.create({
      data: {
        farmId,
        flockId: resolvedFlockId,
        animalId,
        type,
        condition,
        action: req.body?.action?.trim() || null,
        vetName: req.body?.vetName?.trim() || null,
        observedAt: req.body?.observedAt ? new Date(req.body.observedAt) : new Date(),
        cost: req.body?.cost != null && req.body.cost !== "" ? Number(req.body.cost) : null,
        // A6: the last day this animal's milk or eggs may not be sold. Optional on
        // purpose — the farmer may not know it yet, and blocking the health record
        // on a number they will get from the vet later would mean the record never
        // gets written. An unknown window is surfaced as a question, not a pass.
        withdrawalUntil: withdrawalDay(req.body?.withdrawalUntil),
        withdrawalNote: req.body?.withdrawalNote?.trim() || null,
        notes: req.body?.notes?.trim() || null,
      },
    });

    // A death recorded against a tagged animal has to update the animal too, or
    // the animal stays "active" forever and appears in stock counts that are
    // quietly wrong.
    if (type === "death" && animalId) {
      await prisma.animal.updateMany({ where: { id: animalId, farmId }, data: { status: "died" } });
    }

    return res.status(201).json(record);
  } catch (error) {
    console.error("Health record create error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/** PATCH /api/health-records/:id — mainly to resolve a case. */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const id = Number(req.params.id);
    const record = await prisma.healthRecord.findFirst({ where: { id, farmId }, select: { id: true } });
    if (!record) return res.status(404).json({ error: "Record not found" });

    const updated = await prisma.healthRecord.update({
      where: { id },
      data: {
        ...(req.body?.condition ? { condition: String(req.body.condition).trim() } : {}),
        ...(req.body?.action !== undefined ? { action: req.body.action?.trim() || null } : {}),
        ...(req.body?.notes !== undefined ? { notes: req.body.notes?.trim() || null } : {}),
        ...(req.body?.cost !== undefined ? { cost: req.body.cost === "" ? null : Number(req.body.cost) } : {}),
        ...(req.body?.resolvedAt ? { resolvedAt: new Date(req.body.resolvedAt) } : {}),
        ...(req.body?.resolvedAt === null ? { resolvedAt: null } : {}),
        // Editable, and settable to null: the date on the drug label is read after
        // the fact as often as before it, and a wrong date has to be removable.
        ...(req.body?.withdrawalUntil !== undefined ? { withdrawalUntil: withdrawalDay(req.body.withdrawalUntil) } : {}),
        ...(req.body?.withdrawalNote !== undefined ? { withdrawalNote: req.body.withdrawalNote?.trim() || null } : {}),
      },
    });
    return res.json(updated);
  } catch (error) {
    console.error("Health record update error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/** DELETE /api/health-records/:id */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const id = Number(req.params.id);
    const record = await prisma.healthRecord.findFirst({ where: { id, farmId }, select: { id: true } });
    if (!record) return res.status(404).json({ error: "Record not found" });
    await prisma.healthRecord.delete({ where: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error("Health record delete error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/**
 * GET /api/health-records/outbreaks — conditions appearing across animals.
 *
 * A disease log is only useful if it answers "is this spreading?". Two animals
 * with the same condition within a short window is a possible outbreak and is
 * the single most valuable thing this feature produces.
 */
router.get("/outbreaks", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000);

    const records = await prisma.healthRecord.findMany({
      where: { farmId, observedAt: { gte: since } },
      select: { condition: true, animalId: true, observedAt: true },
    });

    const byCondition = new Map<string, Set<number>>();
    for (const r of records) {
      // Compared case-insensitively so "Foot rot" and "footrot" group together,
      // because they are the same disease to the keeper who wrote them.
      const key = r.condition.trim().toLowerCase();
      if (!byCondition.has(key)) byCondition.set(key, new Set());
      if (r.animalId) byCondition.get(key)!.add(r.animalId);
    }

    const candidates = [...byCondition.entries()]
      .filter(([, animals]) => animals.size >= 2)
      .map(([key, animals]) => {
        const original = records.find((r) => r.condition.trim().toLowerCase() === key)?.condition ?? key;
        return { condition: original, animalCount: animals.size };
      })
      .sort((a, b) => b.animalCount - a.animalCount);

    return res.json({ windowDays: days, candidates });
  } catch (error) {
    console.error("Outbreak detection error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;