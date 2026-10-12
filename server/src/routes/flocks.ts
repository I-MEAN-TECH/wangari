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
  movedHead,
  transferLedger,
  mergeLedger,
  speciesCompatible,
} from "../lib/flock-herd.js";
import { GROUP_MOVE_REASON } from "../lib/animal-movement.js";

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

    // Tagged animals are believed at face value — the farmer is pointing at
    // real animals, so a stale head count must not refuse the move. A bare
    // number is clamped to what the group is recorded as holding. See movedHead().
    const moved = movedHead({
      available: from.currentCount,
      requested,
      identified: animalIds.length ? tagged.length : null,
    });
    if (moved === 0)
      return res
        .status(400)
        .json({ error: `"${from.name}" is recorded as holding nothing to move.` });

    const led = transferLedger(from.currentCount, to.currentCount, moved);
    const movedAt = parseDay(req.body?.movedAt);
    const notes = cleanNote(req.body?.notes);
    // Reported, never silent, in both directions: the farmer asked to move more
    // than the group was recorded as holding, or they named specific animals and
    // there were more of those than the count claimed. Either way the count is
    // now out of step with reality and they should check the group.
    const shortfall = Math.max(0, requested - moved);
    const overRecorded = Math.max(0, moved - Math.max(0, from.currentCount));

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
      // §20: the two rows above say the GROUPS changed size. These say which
      // ANIMALS moved and where they went — the chain a buyer or county officer
      // reads. Written in the same transaction, because the farmer described
      // the move once by pointing at the animal and must not be asked to type
      // the same event into the movement form afterwards.
      //
      // The animal's status is deliberately NOT touched: it has not left the
      // farm. Marking it "moved" would tell the herd list it had, and the
      // farmer's own count would then be wrong in a way nothing else corrects.
      // (The manual movement endpoint flips status for `transfer` alone — a
      // reason that means between PREMISES. See lib/animal-movement.ts.)
      ...(tagged.length
        ? [
            prisma.animalMovement.createMany({
              data: tagged.map((t) => ({
                farmId,
                animalId: t.id,
                // The group names are what the farmer would have written in the
                // form's two fields, and they are already known here.
                fromPremises: from.name,
                toPremises: to.name,
                movedAt,
                reason: GROUP_MOVE_REASON,
                notes,
              })),
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
      ...(shortfall > 0 || overRecorded > 0
        ? {
            warning: `"${from.name}" was recorded as holding ${from.currentCount}, so ${moved} moved and its count is now ${led.from.countAfter}. Check the group.`,
          }
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

    // Three groups in different branches, now one location: let the merge set
    // it directly instead of making the farmer remember a manual edit after.
    const newLocation = typeof req.body?.location === "string" && req.body.location.trim()
      ? req.body.location.trim()
      : null;

    // "Keep as a batch" — the farmer wants ONE flock, but still wants to tell
    // the absorbed group's animals apart internally (different acquisition
    // date, different starting health, etc). Instead of only flattening the
    // count, record the absorbed group's identity as a FlockBatch on the
    // target, and park its animals in that batch rather than leaving them
    // batch-less. The count still flattens into one total either way —
    // Flock.currentCount is always the single source of truth.
    const asBatch = req.body?.asBatch === true;

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
    const txResult = await prisma.$transaction(async (tx) => {
      // When keeping the absorbed group's identity as a batch, create it FIRST
      // and re-parent the source's animals straight into it in the same write
      // that moves their flockId — never a separate pass over "target's
      // batch-less animals", which would also catch animals the target already
      // had before this merge.
      let newBatchId: number | null = null;
      if (asBatch && led.target.delta > 0) {
        const batch = await tx.flockBatch.create({
          data: {
            farmId,
            flockId: target.id,
            name: source.name,
            currentCount: led.target.delta,
            acquiredOn: movedAt,
            sourceFlockName: source.name,
            notes: notes || `Merged from "${source.name}" on ${movedAt.toISOString().slice(0, 10)}`,
          },
        });
        newBatchId = batch.id;
      }

      // Identities and their records follow the animals into the surviving group.
      await tx.animal.updateMany({
        where: { flockId: source.id, farmId },
        data: { flockId: target.id, ...(newBatchId ? { batchId: newBatchId } : {}) },
      });
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

      await tx.flock.update({
        where: { id: target.id },
        data: { currentCount: led.target.countAfter, ...(newLocation ? { location: newLocation } : {}) },
      });
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

      return { newBatchId };
    }, { timeout: 20000 });

    res.json({
      mergedHead: led.target.delta,
      target: { id: target.id, name: target.name, countAfter: led.target.countAfter },
      archived: { id: source.id, name: source.name },
      productionDaysMoved: movedDays,
      productionDaysSummed: mergedDays,
      ...(txResult?.newBatchId ? { batch: { id: txResult.newBatchId, name: source.name } } : {}),
      ...(compat.note ? { warning: compat.note } : {}),
    });
  } catch (error) {
    console.error("Merge flocks error:", error);
    res.status(500).json({ error: "Failed to combine the groups" });
  }
});

// POST /api/flocks/merge-many — combine THREE OR MORE groups into one.
//
// Three branches, one location, now one group. The pairwise /merge above can
// only absorb one group per call, so consolidating three meant the farmer
// fired it twice, read two confirmations, and — worst case — stopped after the
// second and left the third branch still sitting as its own group. iLivestock
// documents exactly this as "select 2 or more groups, then Merge", and it is
// the operation a farmer relocating a herd actually performs.
//
// Each absorbed group becomes a NAMED BATCH on the survivor by default, so
// "these came from the Nyeri branch" stays readable afterwards. Setting
// `asBatch: false` flattens them instead, for the farmer who genuinely wants
// one undifferentiated herd at the new location.
//
// Registered BEFORE the "/:id" catch-all, same rule as /transfer and /merge.
router.post("/merge-many", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;

    const targetId = Number(req.body?.targetFlockId);
    const rawSources: unknown[] = Array.isArray(req.body?.sourceFlockIds) ? req.body.sourceFlockIds : [];
    // De-duplicated: the same group tapped twice would otherwise be absorbed
    // twice, and the second pass would try to archive an archived group.
    const sourceIds = [...new Set(rawSources.map((n) => Number(n)))]
      .filter((n) => Number.isInteger(n) && n > 0);

    if (!Number.isInteger(targetId) || targetId <= 0)
      return res.status(400).json({ error: "Pick the group the others will join." });
    if (sourceIds.length < 2)
      return res.status(400).json({ error: "Pick at least two other groups to combine." });
    if (sourceIds.includes(targetId))
      return res.status(400).json({ error: "The group you keep cannot also be one of the groups being combined." });

    const wanted = [...sourceIds, targetId];
    const found = await prisma.flock.findMany({ where: { id: { in: wanted }, farmId } });
    const target = found.find((f) => f.id === targetId);
    if (!target) return res.status(400).json({ error: "That group is not on this farm." });
    if (target.status === "merged")
      return res.status(400).json({ error: "A merged group cannot be used again. Pick another group." });

    const sources = sourceIds
      .map((id) => found.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f);
    if (sources.length !== sourceIds.length)
      return res.status(400).json({ error: "One of those groups is not on this farm." });
    if (sources.some((s) => s.status === "merged"))
      return res.status(400).json({ error: "A merged group cannot be used again. Pick another group." });

    // Same mixed-species guard as the pairwise merge, checked against the
    // survivor once rather than per source — the farmer confirms once.
    //
    // The note has to come from a group that actually CONFLICTS. Reading it
    // off sources[0] alone returned `error: null` whenever the first group
    // matched the survivor but a later one did not — a 400 with no message,
    // which on a phone reads as "the button is broken".
    const mismatch = sources.find((s) => !speciesCompatible(target.category, s.category).compatible);
    const compat = mismatch ? speciesCompatible(target.category, mismatch.category) : null;
    if (compat && req.body?.confirmMixedSpecies !== true)
      return res.status(400).json({ error: compat.note, needsConfirmation: true });

    const asBatch = req.body?.asBatch !== false;
    const newLocation = typeof req.body?.location === "string" && req.body.location.trim()
      ? req.body.location.trim()
      : null;
    const movedAt = parseDay(req.body?.movedAt);

    // The survivor's running count, threaded through the loop so each source
    // sees the count the previous one left behind — otherwise two sources
    // would each be told the same countBefore and the ledger would not
    // reconcile with the final total.
    let runningCount = target.currentCount;
    let totalAbsorbed = 0;
    const archived: { id: number; name: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const source of sources) {
        const countBefore = runningCount;
        const countAfter = applyDelta(countBefore, source.currentCount);
        const absorbed = countAfter - countBefore;
        totalAbsorbed += absorbed;
        runningCount = countAfter;

        let newBatchId: number | null = null;
        if (asBatch && absorbed > 0) {
          const batch = await tx.flockBatch.create({
            data: {
              farmId,
              flockId: target.id,
              name: source.name,
              currentCount: absorbed,
              acquiredOn: movedAt,
              sourceFlockName: source.name,
              notes: `Merged from "${source.name}" on ${movedAt.toISOString().slice(0, 10)}`,
            },
          });
          newBatchId = batch.id;
        }

        // Identities and their records follow the animals into the survivor.
        await tx.animal.updateMany({
          where: { flockId: source.id, farmId },
          data: { flockId: target.id, ...(newBatchId ? { batchId: newBatchId } : {}) },
        });
        await tx.vaccination.updateMany({ where: { flockId: source.id }, data: { flockId: target.id } });
        await tx.breeding.updateMany({ where: { flockId: source.id, farmId }, data: { flockId: target.id } });
        await tx.healthRecord.updateMany({ where: { flockId: source.id, farmId }, data: { flockId: target.id } });
        await tx.insurancePolicy.updateMany({ where: { flockId: source.id, farmId }, data: { flockId: target.id } });

        // Production has a per-flock unique key on [flockId, date], so it can
        // NOT be swept across with a plain updateMany — two groups that both
        // logged 12 May would collide and abort the whole merge. Non-colliding
        // days move; a colliding day is summed into the survivor's row
        // (additive fields only — an average weight is not additive).
        const sourceProduction = await tx.dailyProduction.findMany({ where: { flockId: source.id, farmId } });
        const targetDays = await tx.dailyProduction.findMany({
          where: { flockId: target.id },
          select: { id: true, date: true },
        });
        const targetByDate = new Map(
          targetDays.map((p: { id: number; date: Date }) => [p.date.toISOString().slice(0, 10), p.id]),
        );
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
            // The survivor now has this date; a later source colliding on the
            // same date must sum into it too rather than re-move it.
            targetByDate.set(key, existingId);
          } else {
            await tx.dailyProduction.update({ where: { id: p.id }, data: { flockId: target.id } });
            targetByDate.set(key, p.id);
          }
        }

        await tx.flockMovement.create({
          data: {
            farmId, flockId: target.id, delta: absorbed, reason: "merged_in",
            counterpartyFlockId: source.id, counterpartyName: source.name,
            countBefore, countAfter, movedAt, notes: null,
          },
        });
        await tx.flockMovement.create({
          data: {
            farmId, flockId: source.id, delta: -source.currentCount || 0, reason: "merged_out",
            counterpartyFlockId: target.id, counterpartyName: target.name,
            countBefore: source.currentCount, countAfter: 0, movedAt, notes: null,
          },
        });

        // Archive, never delete — its ledger rows are the record of this merge.
        await tx.flock.update({ where: { id: source.id }, data: { currentCount: 0, status: "merged" } });
        archived.push({ id: source.id, name: source.name });
      }

      await tx.flock.update({
        where: { id: target.id },
        data: { currentCount: runningCount, ...(newLocation ? { location: newLocation } : {}) },
      });
    }, { timeout: 30000 });

    res.json({
      mergedHead: totalAbsorbed,
      target: { id: target.id, name: target.name, countAfter: runningCount },
      archived,
      combinedCount: archived.length + 1,
      ...(newLocation ? { location: newLocation } : {}),
      ...(compat ? { warning: compat.note } : {}),
    });
  } catch (error) {
    console.error("Merge many flocks error:", error);
    res.status(500).json({ error: "Failed to combine the groups" });
  }
});

// POST /api/flocks/:id/count — change a group's head count WITH a reason.
//
// `batchId` is optional and is what keeps the sub-groups honest. A death or a
// sale recorded against the flock ALONE drops the flock total while every
// batch keeps its old count, so the parts stop adding up to the whole — and
// the panel could only report that disagreement, never fix it, because moving
// head between two batches leaves their sum exactly where it was. Naming the
// group the loss happened in moves both numbers in one transaction, so the
// two can never drift apart at the moment the farmer records the event.
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

    // Which group inside the flock this happened to, when the farmer says.
    const batchId = req.body?.batchId != null ? Number(req.body.batchId) : null;
    let batch = null as null | { id: number; name: string; currentCount: number };
    if (batchId != null) {
      const found = await loadBatch(farmId, batchId);
      if ("error" in found) return res.status(400).json({ error: found.error });
      if (found.batch.flockId !== flock.id)
        return res.status(400).json({ error: "That group belongs to a different flock." });
      batch = found.batch;
    }

    const countBefore = flock.currentCount;
    const countAfter = applyDelta(countBefore, delta);
    // The batch's own share, clamped the same way so the two never disagree.
    const batchBefore = batch ? batch.currentCount : null;
    const batchAfter = batch ? applyDelta(batch.currentCount, delta) : null;

    const [updated] = await prisma.$transaction([
      prisma.flock.update({ where: { id: flock.id }, data: { currentCount: countAfter } }),
      // The batch moves by the SAME clamped delta as the flock, not by the
      // requested one — otherwise a flock clamped at zero leaves the batch
      // still holding head that no longer exist.
      ...(batch != null && batchAfter != null && batchBefore != null
        ? [prisma.flockBatch.update({ where: { id: batch.id }, data: { currentCount: batchAfter } })]
        : []),
      prisma.flockMovement.create({
        data: {
          farmId, flockId: flock.id,
          // The recorded delta is what ACTUALLY happened after clamping, so the
          // ledger always reconciles with the count it sits beside.
          delta: countAfter - countBefore,
          reason: req.body.reason,
          countBefore, countAfter,
          movedAt: parseDay(req.body?.movedAt),
          // Naming the group in the note is what makes the row readable later:
          // "3 died" and "3 died in Bought-in-October" are different records.
          notes: batch
            ? [`${batch.name}.`, cleanNote(req.body?.notes)].filter(Boolean).join(" ")
            : cleanNote(req.body?.notes),
        },
      }),
    ]);

    res.json({
      flock: updated,
      countBefore,
      countAfter,
      ...(batch != null && batchAfter != null && batchBefore != null
        ? { batch: { id: batch.id, name: batch.name, countBefore: batchBefore, countAfter: batchAfter } }
        : {}),
    });
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

// ─── Batches: sub-groups inside ONE flock, for a farmer's own organisation ──
// "One flock, but I still want to tell the original 300 apart from the 200 I
// bought in October." Flock.currentCount stays the single total; a batch's
// count is a partition of it, not a second ledger. All of these must be
// registered before the "/:id" catch-all, same reasoning as /transfer and
// /merge above — see flock-herd-routes.test.ts.

/** Load a batch that belongs to this farm, or the error to send back. */
async function loadBatch(farmId: number, batchId: number) {
  if (!Number.isInteger(batchId) || batchId <= 0) return { error: "A batch is required." } as const;
  const batch = await prisma.flockBatch.findFirst({ where: { id: batchId, farmId } });
  if (!batch) return { error: "That batch is not on this farm." } as const;
  if (batch.status === "merged") return { error: "A merged batch cannot be used again. Pick another batch." } as const;
  return { batch } as const;
}

// GET /api/flocks/:id/batches — list the sub-groups inside one flock.
router.get("/:id/batches", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const flock = await prisma.flock.findFirst({ where: { id: Number(req.params.id), farmId } });
    if (!flock) return res.status(404).json({ error: "Flock not found" });
    const batches = await prisma.flockBatch.findMany({
      where: { flockId: flock.id, farmId, status: { not: "merged" } },
      orderBy: [{ createdAt: "desc" }],
    });
    res.json({ flock: { id: flock.id, name: flock.name, currentCount: flock.currentCount }, batches });
  } catch (error) {
    console.error("List flock batches error:", error);
    res.status(500).json({ error: "Failed to load the batches" });
  }
});

// POST /api/flocks/:id/batches — create a batch inside one flock.
//
// A batch is a sub-group the farmer keeps inside ONE flock: "the original
// 300" vs "the 200 I bought in October". It is never a way to invent animals,
// so it has two modes and the caller must say which one it means:
//
//  - RELABELLING stock the flock already holds (`addToFlock` false/omitted).
//    The batch partitions an existing total. Nothing else changes.
//  - RECORDING new stock arriving (`addToFlock: true`). The old contract made
//    the client fire a second POST /:id/count to keep the flock total honest.
//    Two client calls are not atomic — and an offline device replays them
//    separately, so a dropped signal could leave a 200-bird batch inside a
//    flock still totalling 300, which is exactly the disagreement the ledger
//    exists to prevent. Both writes now happen in one transaction here.
router.post("/:id/batches", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const flock = await prisma.flock.findFirst({ where: { id: Number(req.params.id), farmId } });
    if (!flock) return res.status(404).json({ error: "Flock not found" });

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Name the batch, e.g. \"Bought October 2026\"." });
    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 0)
      return res.status(400).json({ error: "Enter how many head are in this batch." });

    // Only real arrivals may move the flock total. Relabelling is free.
    const addToFlock = req.body?.addToFlock === true;
    // "purchase" is the default, not the only answer: a farmer whose layers
    // hatched a clutch is recording a BIRTH, and calling it a purchase would
    // put a cost against an animal that cost nothing — which then shows up
    // wrong in the profit figures.
    const reason = addToFlock ? (req.body?.reason ?? "purchase") : null;
    if (addToFlock && !isHerdReason(reason))
      return res.status(400).json({ error: `Reason must be one of: ${HERD_REASONS.join(", ")}` });
    // A count that only moves because head died or were sold is not "new
    // stock arriving", whatever the caller claims. Those belong on the count
    // route, against a group.
    if (addToFlock && (reason === "sale" || reason === "death"))
      return res.status(400).json({ error: "Record a sale or a death against the group, not as a new group." });

    // `count === 0` with addToFlock would write a zero-delta ledger row — a
    // row that says something happened when nothing did. Relabelling is the
    // mode that wants a zero, so point the farmer at it.
    if (addToFlock && count === 0)
      return res.status(400).json({ error: "Enter how many head arrived. To only name a group, leave new stock off." });

    const countBefore = flock.currentCount;
    const countAfter = addToFlock ? applyDelta(countBefore, count) : countBefore;

    const [batch] = await prisma.$transaction([
      prisma.flockBatch.create({
        data: {
          farmId,
          flockId: flock.id,
          name,
          currentCount: count,
          acquiredOn: parseDay(req.body?.acquiredOn),
          notes: cleanNote(req.body?.notes),
        },
      }),
      // Written only when head actually arrived, so the ledger never carries a
      // row for a pure rename.
      ...(addToFlock
        ? [
            prisma.flock.update({ where: { id: flock.id }, data: { currentCount: countAfter } }),
            prisma.flockMovement.create({
              data: {
                farmId,
                flockId: flock.id,
                // The delta that actually landed, after clamping, so the ledger
                // reconciles with the count it sits beside.
                delta: countAfter - countBefore,
                reason,
                countBefore,
                countAfter,
                movedAt: parseDay(req.body?.acquiredOn),
                notes: `New group "${name}". ${cleanNote(req.body?.notes) || ""}`.trim(),
              },
            }),
          ]
        : []),
    ]);

    // `flock` here is the created batch (first element of the transaction).
    const created = batch as { id: number };
    if (addToFlock) {
      res.status(201).json({
        batch: created,
        countBefore,
        countAfter,
        flock: { id: flock.id, name: flock.name, currentCount: countAfter },
      });
      return;
    }
    res.status(201).json({ batch });
  } catch (error) {
    console.error("Create flock batch error:", error);
    res.status(500).json({ error: "Failed to create the batch" });
  }
});

// PATCH /api/flocks/batches/:batchId — rename a batch or edit its notes.
// Does not touch the count: use the transfer/merge routes below for that, so
// the flock's total and the sum of its batches can never silently disagree.
router.patch("/batches/:batchId", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const found = await loadBatch(farmId, Number(req.params.batchId));
    if ("error" in found) return res.status(400).json({ error: found.error });

    const data: Record<string, unknown> = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) data.name = req.body.name.trim();
    if (req.body?.acquiredOn !== undefined) data.acquiredOn = parseDay(req.body.acquiredOn);
    if (req.body?.notes !== undefined) data.notes = cleanNote(req.body.notes);

    const batch = await prisma.flockBatch.update({ where: { id: found.batch.id }, data });
    res.json({ batch });
  } catch (error) {
    console.error("Update flock batch error:", error);
    res.status(500).json({ error: "Failed to update the batch" });
  }
});

// POST /api/flocks/batches/transfer — move head between two batches of the
// SAME flock. Moving between batches of DIFFERENT flocks is not this route —
// that is a group-to-group move and belongs on /api/flocks/transfer instead,
// so the flock-level ledger always has the full picture.
router.post("/batches/transfer", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const fromId = Number(req.body?.fromBatchId);
    const toId = Number(req.body?.toBatchId);
    if (fromId === toId) return res.status(400).json({ error: "Pick two different batches." });

    const [fromFound, toFound] = await Promise.all([loadBatch(farmId, fromId), loadBatch(farmId, toId)]);
    if ("error" in fromFound) return res.status(400).json({ error: fromFound.error });
    if ("error" in toFound) return res.status(400).json({ error: toFound.error });
    const { batch: from } = fromFound;
    const { batch: to } = toFound;
    if (from.flockId !== to.flockId)
      return res.status(400).json({ error: "Those batches belong to different flocks — use the group transfer instead." });

    const requested = Number(req.body?.count);
    const moved = movableHead(from.currentCount, requested);
    if (moved <= 0) return res.status(400).json({ error: "Enter how many are moving." });

    const led = transferLedger(from.currentCount, to.currentCount, moved);
    await prisma.$transaction([
      prisma.flockBatch.update({ where: { id: from.id }, data: { currentCount: led.from.countAfter } }),
      prisma.flockBatch.update({ where: { id: to.id }, data: { currentCount: led.to.countAfter } }),
      prisma.animal.updateMany({
        where: { batchId: from.id, farmId },
        data: { batchId: to.id },
      }),
    ]);

    res.json({ moved, from: { id: from.id, countAfter: led.from.countAfter }, to: { id: to.id, countAfter: led.to.countAfter } });
  } catch (error) {
    console.error("Transfer batch stock error:", error);
    res.status(500).json({ error: "Failed to move the stock between batches" });
  }
});

// POST /api/flocks/batches/merge — combine two batches of the SAME flock into
// one. Mirrors /api/flocks/merge's archive-not-delete rule: the absorbed
// batch's history is not thrown away, it is just no longer a live batch.
router.post("/batches/merge", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const sourceId = Number(req.body?.sourceBatchId);
    const targetId = Number(req.body?.targetBatchId);
    if (sourceId === targetId) return res.status(400).json({ error: "Pick two different batches." });

    const [sourceFound, targetFound] = await Promise.all([loadBatch(farmId, sourceId), loadBatch(farmId, targetId)]);
    if ("error" in sourceFound) return res.status(400).json({ error: sourceFound.error });
    if ("error" in targetFound) return res.status(400).json({ error: targetFound.error });
    const { batch: source } = sourceFound;
    const { batch: target } = targetFound;
    if (source.flockId !== target.flockId)
      return res.status(400).json({ error: "Those batches belong to different flocks — use the group merge instead." });

    const led = mergeLedger(source.currentCount, target.currentCount);
    await prisma.$transaction([
      prisma.animal.updateMany({ where: { batchId: source.id, farmId }, data: { batchId: target.id } }),
      prisma.flockBatch.update({ where: { id: target.id }, data: { currentCount: led.target.countAfter } }),
      prisma.flockBatch.update({ where: { id: source.id }, data: { currentCount: 0, status: "merged" } }),
    ]);

    res.json({
      mergedHead: led.target.delta,
      target: { id: target.id, name: target.name, countAfter: led.target.countAfter },
      archived: { id: source.id, name: source.name },
    });
  } catch (error) {
    console.error("Merge flock batches error:", error);
    res.status(500).json({ error: "Failed to combine the batches" });
  }
});

// DELETE /api/flocks/batches/:batchId — dissolve a batch WITHOUT losing the
// animals. Its head count and any tagged animals fold back into the flock's
// general (batch-less) pool — the flock total never changes, only the
// internal bookkeeping does. Use this when the sub-grouping is no longer
// useful, e.g. the two batches have become the same age and the distinction
// stopped mattering.
router.delete("/batches/:batchId", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const found = await loadBatch(farmId, Number(req.params.batchId));
    if ("error" in found) return res.status(400).json({ error: found.error });
    const { batch } = found;

    await prisma.$transaction([
      prisma.animal.updateMany({ where: { batchId: batch.id, farmId }, data: { batchId: null } }),
      prisma.flockBatch.update({ where: { id: batch.id }, data: { currentCount: 0, status: "merged" } }),
    ]);
    res.json({ dissolved: { id: batch.id, name: batch.name } });
  } catch (error) {
    console.error("Dissolve flock batch error:", error);
    res.status(500).json({ error: "Failed to remove the batch" });
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
        batches: { where: { status: { not: "merged" } }, orderBy: { createdAt: "desc" } },
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
