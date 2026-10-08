import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireOwner, requireFarm } from "../middleware/requireOwner.js";
import { createFlockForFarm } from "../lib/flock-create.js";
import {
  HERD_REASONS,
  isHerdReason,
  applyDelta,
  movableHead,
  transferLedger,
  mergeLedger,
  speciesCompatible,
} from "../lib/flock-herd.js";

const router = Router();
// requireFarm, not requireOwner: workers may read flocks, but a session with
// no farm attached must not fall through to an unscoped query.
router.use(authMiddleware, requireFarm);

// GET /api/flocks — list all flocks for the farm
router.get("/", async (req: Request, res: Response) => {
  try {
    // `status: merged` rows are the remains of a merge. They are archived, not
    // deleted — their history stays readable by id — but they must not appear
    // as a live herd in the list, or a farmer sees a phantom empty group.
    const data = await prisma.flock.findMany({
      where: { farmId: req.user!.farmId!, status: { not: "merged" } },
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

// ─── Herd movements: stock between groups, merges, and the count ledger ────
// `Flock.currentCount` remains the daily source of truth. Every route below
// also writes a FlockMovement row beside it, so a farmer can answer "where did
// seven go?" months later. The arithmetic lives in lib/flock-herd.ts.

/** Today as a date-only value, matching how the rest of the app stores dates. */
function today(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

/** Parse a farmer-supplied date, falling back to today rather than failing. */
function parseDay(raw: unknown): Date {
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return today();
}

/** Optional free-text note, trimmed to null when empty. */
function cleanNote(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Load two groups belonging to THIS farm, or the error to send back.
 * Tenancy is checked first: a farmer must never be able to name another
 * farm's flock id and move its stock.
 */
async function loadPair(farmId: number, aId: number, bId: number) {
  if (!Number.isInteger(aId) || !Number.isInteger(bId) || aId <= 0 || bId <= 0)
    return { error: "Two groups are required." } as const;
  if (aId === bId) return { error: "Pick two different groups." } as const;

  const found = await prisma.flock.findMany({ where: { id: { in: [aId, bId] }, farmId } });
  const a = found.find((f) => f.id === aId);
  const b = found.find((f) => f.id === bId);
  if (!a || !b) return { error: "One of those groups is not on this farm." } as const;
  // An archived group is the remains of a merge — moving stock out of it again
  // would double-count what the merge already transferred.
  if (a.status === "merged" || b.status === "merged")
    return { error: "A merged group cannot be used again. Pick another group." } as const;
  return { a, b } as const;
}

// POST /api/flocks/transfer — move stock from one group to another.
// Registered BEFORE /:id so "transfer" is never parsed as a flock id.
router.post("/transfer", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const pair = await loadPair(farmId, Number(req.body?.fromFlockId), Number(req.body?.toFlockId));
    if ("error" in pair) return res.status(400).json({ error: pair.error });
    const { a: from, b: to } = pair;

    // Two ways to say how much moved: a head count (the normal case — a flock
    // is COUNTED, not tagged) or a set of specific tagged animals.
    const animalIds: number[] = Array.isArray(req.body?.animalIds)
      ? req.body.animalIds
          .map((n: unknown) => Number(n))
          .filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    let requested: number;
    let tagged: { id: number; tagNumber: string }[] = [];
    if (animalIds.length) {
      tagged = await prisma.animal.findMany({
        where: { id: { in: animalIds }, farmId, flockId: from.id },
        select: { id: true, tagNumber: true },
      });
      if (tagged.length !== animalIds.length)
        return res
          .status(400)
          .json({ error: `Some of those animals are not in "${from.name}".` });
      requested = tagged.length;
    } else {
      requested = Number(req.body?.count);
      if (!Number.isInteger(requested) || requested <= 0)
        return res.status(400).json({ error: "How many are you moving? Enter a whole number." });
    }

    const moved = movableHead(from.currentCount, requested);
    if (moved === 0)
      return res
        .status(400)
        .json({ error: `"${from.name}" is recorded as holding nothing to move.` });

    const led = transferLedger(from.currentCount, to.currentCount, moved);
    const movedAt = parseDay(req.body?.movedAt);
    const notes = cleanNote(req.body?.notes);
    const shortfall = requested - moved;

    await prisma.$transaction([
      prisma.flock.update({ where: { id: from.id }, data: { currentCount: led.from.countAfter } }),
      prisma.flock.update({ where: { id: to.id }, data: { currentCount: led.to.countAfter } }),
      ...(tagged.length
        ? [
            prisma.animal.updateMany({
              where: { id: { in: tagged.map((t) => t.id) }, farmId },
              data: { flockId: to.id },
            }),
          ]
        : []),
      prisma.flockMovement.create({
        data: {
          farmId, flockId: from.id, delta: led.from.delta, reason: "transfer_out",
          counterpartyFlockId: to.id, counterpartyName: to.name,
          countBefore: led.from.countBefore, countAfter: led.from.countAfter, movedAt, notes,
        },
      }),
      prisma.flockMovement.create({
        data: {
          farmId, flockId: to.id, delta: led.to.delta, reason: "transfer_in",
          counterpartyFlockId: from.id, counterpartyName: from.name,
          countBefore: led.to.countBefore, countAfter: led.to.countAfter, movedAt, notes,
        },
      }),
    ]);

    res.json({
      moved,
      tagged: tagged.length,
      from: { id: from.id, name: from.name, countBefore: led.from.countBefore, countAfter: led.from.countAfter },
      to: { id: to.id, name: to.name, countBefore: led.to.countBefore, countAfter: led.to.countAfter },
      // Reported, never silent: the farmer recorded fewer head than they moved,
      // so the count is now zero and they should check the group.
      ...(shortfall > 0
        ? { warning: `"${from.name}" was recorded as holding ${from.currentCount}, so ${moved} moved and its count is now 0.` }
        : {}),
    });
  } catch (error) {
    console.error("Transfer flock stock error:", error);
    res.status(500).json({ error: "Failed to move the stock" });
  }
});

// POST /api/flocks/merge — combine two groups into one.
//
// The surviving group is the TARGET; the source is archived (status "merged"),
// never deleted: deleting it would cascade its ledger rows away — the very
// record of the merge — and lose its production history.
router.post("/merge", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const pair = await loadPair(farmId, Number(req.body?.sourceFlockId), Number(req.body?.targetFlockId));
    if ("error" in pair) return res.status(400).json({ error: pair.error });
    const { a: source, b: target } = pair;

    // Merging a poultry group into a cattle herd is almost always a mis-tap.
    // Refuse once, with the reason; the farmer can confirm and it proceeds.
    const compat = speciesCompatible(source.category, target.category);
    if (!compat.compatible && req.body?.confirmMixedSpecies !== true)
      return res.status(400).json({ error: compat.note, needsConfirmation: true });

    const led = mergeLedger(source.currentCount, target.currentCount);
    const movedAt = parseDay(req.body?.movedAt);
    const notes = cleanNote(req.body?.notes);

    // Production history is the one table with a per-flock unique key
    // ([flockId, date]), so it cannot simply be re-parented when both groups
    // logged the same day. Non-colliding days move across; a colliding day is
    // summed into the target's existing row — additive fields only, because an
    // average weight is not additive — and the source row is dropped.
    const [sourceProduction, targetProduction] = await Promise.all([
      prisma.dailyProduction.findMany({ where: { flockId: source.id, farmId } }),
      prisma.dailyProduction.findMany({ where: { flockId: target.id }, select: { id: true, date: true } }),
    ]);
    const targetByDate = new Map(
      targetProduction.map((p: { id: number; date: Date }) => [p.date.toISOString().slice(0, 10), p.id]),
    );

    let movedDays = 0;
    let mergedDays = 0;

    // Longer than Prisma's 5s default: merging a group with hundreds of
    // production days performs one write per day, and a timeout mid-merge would
    // leave half the animals moved and half the history behind.
    await prisma.$transaction(async (tx) => {
      // Identities and their records follow the animals into the surviving group.
      await tx.animal.updateMany({ where: { flockId: source.id, farmId }, data: { flockId: target.id } });
      await tx.vaccination.updateMany({ where: { flockId: source.id }, data: { flockId: target.id } });
      await tx.breeding.updateMany({ where: { flockId: source.id, farmId }, data: { flockId: target.id } });
      await tx.healthRecord.updateMany({ where: { flockId: source.id, farmId }, data: { flockId: target.id } });
      await tx.insurancePolicy.updateMany({ where: { flockId: source.id, farmId }, data: { flockId: target.id } });

      for (const p of sourceProduction) {
        const key = p.date.toISOString().slice(0, 10);
        const existingId = targetByDate.get(key);
        if (existingId) {
          await tx.dailyProduction.update({
            where: { id: existingId },
            data: {
              eggsCollected: { increment: p.eggsCollected },
              milkCollected: { increment: p.milkCollected },
              mortality: { increment: p.mortality },
              feedUsed: { increment: p.feedUsed },
              ...(p.waterUsed !== null ? { waterUsed: { increment: p.waterUsed } } : {}),
            },
          });
          await tx.dailyProduction.delete({ where: { id: p.id } });
          mergedDays++;
        } else {
          await tx.dailyProduction.update({ where: { id: p.id }, data: { flockId: target.id } });
          movedDays++;
        }
      }

      await tx.flock.update({ where: { id: target.id }, data: { currentCount: led.target.countAfter } });
      await tx.flock.update({ where: { id: source.id }, data: { currentCount: 0, status: "merged" } });

      await tx.flockMovement.create({
        data: {
          farmId, flockId: target.id, delta: led.target.delta, reason: "merged_in",
          counterpartyFlockId: source.id, counterpartyName: source.name,
          countBefore: led.target.countBefore, countAfter: led.target.countAfter, movedAt, notes,
        },
      });
      await tx.flockMovement.create({
        data: {
          farmId, flockId: source.id, delta: led.source.delta, reason: "merged_out",
          counterpartyFlockId: target.id, counterpartyName: target.name,
          countBefore: led.source.countBefore, countAfter: led.source.countAfter, movedAt, notes,
        },
      });
    }, { timeout: 20000 });

    res.json({
      mergedHead: led.target.delta,
      target: { id: target.id, name: target.name, countAfter: led.target.countAfter },
      archived: { id: source.id, name: source.name },
      productionDaysMoved: movedDays,
      productionDaysSummed: mergedDays,
      ...(compat.note ? { warning: compat.note } : {}),
    });
  } catch (error) {
    console.error("Merge flocks error:", error);
    res.status(500).json({ error: "Failed to combine the groups" });
  }
});

// POST /api/flocks/:id/count — change a group's head count WITH a reason.
router.post("/:id/count", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const flock = await prisma.flock.findFirst({ where: { id: Number(req.params.id), farmId } });
    if (!flock) return res.status(404).json({ error: "Flock not found" });

    const delta = Number(req.body?.delta);
    if (!Number.isInteger(delta) || delta === 0)
      return res.status(400).json({ error: "Enter how many were added or removed." });
    if (!isHerdReason(req.body?.reason))
      return res.status(400).json({ error: `Reason must be one of: ${HERD_REASONS.join(", ")}` });

    const countBefore = flock.currentCount;
    const countAfter = applyDelta(countBefore, delta);

    const [updated] = await prisma.$transaction([
      prisma.flock.update({ where: { id: flock.id }, data: { currentCount: countAfter } }),
      prisma.flockMovement.create({
        data: {
          farmId, flockId: flock.id,
          // The recorded delta is what ACTUALLY happened after clamping, so the
          // ledger always reconciles with the count it sits beside.
          delta: countAfter - countBefore,
          reason: req.body.reason,
          countBefore, countAfter,
          movedAt: parseDay(req.body?.movedAt),
          notes: cleanNote(req.body?.notes),
        },
      }),
    ]);

    res.json({ flock: updated, countBefore, countAfter });
  } catch (error) {
    console.error("Adjust flock count error:", error);
    res.status(500).json({ error: "Failed to update the count" });
  }
});

// GET /api/flocks/:id/movements — the group's head-count ledger.
router.get("/:id/movements", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const flock = await prisma.flock.findFirst({
      where: { id: Number(req.params.id), farmId },
      select: { id: true, name: true, currentCount: true, status: true },
    });
    if (!flock) return res.status(404).json({ error: "Flock not found" });
    const movements = await prisma.flockMovement.findMany({
      where: { flockId: flock.id, farmId },
      orderBy: [{ movedAt: "desc" }, { id: "desc" }],
    });
    res.json({ flock, movements });
  } catch (error) {
    console.error("List flock movements error:", error);
    res.status(500).json({ error: "Failed to load the count history" });
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

    const farmId = req.user!.farmId!;
    const id = Number(req.params.id);

    // Read the count BEFORE writing so a head-count change can be recorded in
    // the ledger with a real before/after. Without this every manual count
    // edit — including the daily death record, which edits the count inline —
    // was invisible, which is exactly the gap the ledger exists to close.
    const before = await prisma.flock.findFirst({
      where: { id, farmId },
      select: { currentCount: true },
    });
    if (!before) return res.status(404).json({ error: "Flock not found" });

    const result = await prisma.flock.updateMany({ where: { id, farmId }, data });

    const next = Number(data.currentCount);
    if (
      result.count &&
      data.currentCount !== undefined &&
      data.currentCount !== null &&
      Number.isFinite(next) &&
      next !== before.currentCount
    ) {
      await prisma.flockMovement.create({
        data: {
          farmId,
          flockId: id,
          delta: next - before.currentCount,
          // The caller may name the reason (the death form sends "death");
          // otherwise it is a plain correction.
          reason: isHerdReason(req.body?.ledgerReason) ? req.body.ledgerReason : "adjustment",
          countBefore: before.currentCount,
          countAfter: next,
          movedAt: today(),
          notes: cleanNote(req.body?.ledgerNote),
        },
      });
    }

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
