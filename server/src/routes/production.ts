import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  herdSummary,
  coverage,
  normaliseSession,
  type HerdAnimal,
  type MilkingRow,
} from "../lib/per-cow-yield.js";
import {
  allCows,
  herdRepro,
  type BreedingEvent,
} from "../lib/repro-timeline.js";

const router = Router();
router.use(authMiddleware, requireFarm);

// GET /api/production
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.dailyProduction.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { date: "desc" },
      take: 30,
      // `type` travels with the name because the client labels each row by the
      // species' own output — without it every non-dairy row was shown as
      // "N eggs", so a goat weight record read "0 eggs".
      include: { flock: { select: { name: true, type: true } } },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/production
router.post("/", async (req: Request, res: Response) => {
  try {
    // Defaults: date = today (the client may omit it); weight fields persisted
    // on both create and update paths.
    const date = req.body.date ? new Date(req.body.date) : new Date();
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: "Invalid date" });
    }
    const result = await prisma.dailyProduction.upsert({
      where: {
        flockId_date: {
          flockId: Number(req.body.flockId),
          date: new Date(req.body.date),
        },
      },
      update: {
        eggsCollected: Number(req.body.eggsCollected || 0),
        milkCollected: Number(req.body.milkCollected || 0),
        avgWeight: req.body.avgWeight != null ? Number(req.body.avgWeight) : undefined,
        weightGain: req.body.weightGain != null ? Number(req.body.weightGain) : undefined,
        mortality: Number(req.body.mortality || 0),
        feedUsed: Number(req.body.feedUsed || 0),
        notes: req.body.notes || null,
      },
      create: {
        flockId: Number(req.body.flockId),
        farmId: req.user!.farmId!,
        date,
        eggsCollected: Number(req.body.eggsCollected || 0),
        milkCollected: Number(req.body.milkCollected || 0),
        avgWeight: req.body.avgWeight != null ? Number(req.body.avgWeight) : null,
        weightGain: req.body.weightGain != null ? Number(req.body.weightGain) : null,
        mortality: Number(req.body.mortality || 0),
        feedUsed: Number(req.body.feedUsed || 0),
        notes: req.body.notes || null,
      },
    });

    // Inventory link: feed used pulls from stock and books the expense.
    const feedUsed = Number(req.body.feedUsed || 0);
    if (feedUsed > 0) {
      const item = req.body.inventoryItemId
        ? await prisma.inventory.findFirst({
            where: { id: Number(req.body.inventoryItemId), farmId: req.user!.farmId! },
          })
        : await prisma.inventory.findFirst({
            where: {
              farmId: req.user!.farmId!,
              OR: [
                { category: "feed" },
                { itemName: { contains: "feed", mode: "insensitive" } },
              ],
              quantity: { gt: 0 },
            },
            orderBy: { quantity: "desc" },
          });
      if (item) {
        const newQty = Math.max(0, Number(item.quantity) - feedUsed);
        await prisma.$transaction([
          prisma.inventory.update({ where: { id: item.id }, data: { quantity: newQty } }),
          prisma.inventoryLog.create({
            data: {
              inventoryId: item.id,
              changeType: "consumption",
              quantityChange: -feedUsed,
              reason: `Feed used by flock (production record #${result.id})`,
              createdBy: req.user!.userId ?? null,
            },
          }),
          // Feed consumption is a real cost — book it at the item's unit cost.
          ...(Number(item.unitCost) > 0
            ? [prisma.transaction.create({
                data: {
                  farmId: req.user!.farmId!,
                  type: "expense",
                  category: "feed",
                  description: `Feed: ${feedUsed} ${item.unit} ${item.itemName}`,
                  amount: feedUsed * Number(item.unitCost),
                  date: new Date(req.body.date),
                  paymentMethod: "inventory",
                  createdBy: req.user!.userId,
                },
              })]
            : []),
        ]);
      }
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// ── Per-cow milk yield (A2) ─────────────────────────────────────────────────
//
// A deliberately separate grain of fact from the flock total above, so it has
// its own table (`animal_production`) and its own endpoints. Nothing here
// touches `daily_production`: the flock total stays the one number the farmer
// logs in the daily ritual, and a per-cow row is detail on top of it. The
// reason this is a table and not a nullable column is argued in the schema
// comment — in short, a nullable column cannot join that table's unique key
// without silently breaking the daily upsert.

const PER_COW_WINDOW_DEFAULT = 30;
const PER_COW_WINDOW_MAX = 365;

function perCowWindow(raw: unknown): number {
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return PER_COW_WINDOW_DEFAULT;
  return Math.min(PER_COW_WINDOW_MAX, Math.floor(n));
}

/** Midnight UTC `days - 1` days ago — the same day boundary the date columns store. */
function windowStart(days: number): Date {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(today.getTime() - (days - 1) * 86400000);
}

/**
 * A date-column value pinned to UTC midnight, so the upsert key is stable.
 * Without pinning, the same calendar day sent with a time component would be a
 * different key depending on the client's clock.
 */
function dayOf(raw: unknown): Date | null {
  const d = raw ? new Date(raw as string) : new Date();
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// POST /api/production/animal — record (or correct) ONE cow's milking.
// Re-posting the same cow/date/session corrects the figure rather than adding
// a second row, which is what makes "the evening was 6, not 8" fixable.
router.post("/animal", async (req: Request, res: Response) => {
  try {
    const animalId = Number(req.body.animalId);
    if (!Number.isInteger(animalId) || animalId <= 0) {
      return res.status(400).json({ error: "animalId is required" });
    }
    const litres = Number(req.body.milkLitres ?? req.body.litres ?? 0);
    if (!isFinite(litres) || litres < 0) {
      return res.status(400).json({ error: "milkLitres must be a number of litres, 0 or more" });
    }
    const day = dayOf(req.body.date);
    if (!day) return res.status(400).json({ error: "Invalid date" });
    const session = normaliseSession(req.body.session);

    // The animal must be THIS farm's. Without this check an animalId from
    // another farm would write a yield row into a stranger's herd.
    const animal = await prisma.animal.findFirst({
      where: { id: animalId, farmId: req.user!.farmId! },
      select: { id: true, flockId: true },
    });
    if (!animal) return res.status(400).json({ error: "animalId is not an animal on this farm" });

    const notes = typeof req.body.notes === "string" && req.body.notes.trim() ? req.body.notes.trim() : null;
    const record = await prisma.animalProduction.upsert({
      where: { animalId_date_session: { animalId, date: day, session } },
      update: {
        milkLitres: litres,
        notes,
        // The flock she is in today, re-read on every write: an animal moved
        // between flocks should not keep yesterday's flock on a new row.
        flockId: animal.flockId ?? null,
        recordedBy: req.user!.userId ?? null,
      },
      create: {
        farmId: req.user!.farmId!,
        animalId,
        flockId: animal.flockId ?? null,
        date: day,
        session,
        milkLitres: litres,
        notes,
        recordedBy: req.user!.userId ?? null,
      },
    });
    res.status(201).json(record);
  } catch (error) {
    console.error("Create per-cow production error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/production/animal/:id — remove a milking logged on the wrong cow.
router.delete("/animal/:id", async (req: Request, res: Response) => {
  try {
    const removed = await prisma.animalProduction.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!removed.count) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/production/animals?days=30 — per-cow yield, plus how much of the
// flock total the per-cow rows actually explain.
router.get("/animals", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const days = perCowWindow(req.query.days);
    const since = windowStart(days);

    const [animals, rows, flockRows] = await Promise.all([
      prisma.animal.findMany({
        where: { farmId, status: "active" },
        select: {
          id: true, tagNumber: true, species: true, breed: true, flockId: true,
          flock: { select: { name: true } },
        },
        orderBy: { tagNumber: "asc" },
      }),
      prisma.animalProduction.findMany({
        where: { farmId, date: { gte: since } },
        orderBy: { date: "desc" },
        select: { id: true, animalId: true, flockId: true, date: true, session: true, milkLitres: true, notes: true },
      }),
      // The flock total for the SAME window — the denominator coverage needs,
      // and the reason the two grains of fact have to be kept apart.
      prisma.dailyProduction.findMany({
        where: { farmId, date: { gte: since } },
        select: { milkCollected: true },
      }),
    ]);

    const milking: MilkingRow[] = rows.map((r) => ({
      animalId: r.animalId,
      date: new Date(r.date),
      session: r.session,
      milkLitres: Number(r.milkLitres),
    }));
    const herd: HerdAnimal[] = animals.map((a) => ({ id: a.id, label: a.tagNumber, flockId: a.flockId }));
    const flockTotalLitres = flockRows.reduce((s, r) => s + Number(r.milkCollected), 0);
    const summary = herdSummary(herd, milking, days);
    const meta = new Map(animals.map((a) => [a.id, a]));

    res.json({
      days,
      since,
      // Per cow, best producer first. A cow with no row stays in the list with
      // a zero — she is the one to go and record, not a row to hide.
      cows: summary.cows.map((c) => {
        const a = meta.get(c.animalId);
        return { ...c, species: a?.species ?? null, breed: a?.breed ?? null, flockName: a?.flock?.name ?? null };
      }),
      herdTotalLitres: summary.herdTotalLitres,
      herdAvgPerRecordedDay: summary.herdAvgPerRecordedDay,
      topCowAnimalId: summary.topCow?.animalId ?? null,
      coverage: coverage(herd, milking, flockTotalLitres),
      // The rows themselves, so the form can show and correct what is logged.
      milking,
      // Recent rows WITH their ids — a row the farmer can point at is a row
      // they can correct or remove.
      recent: rows.slice(0, 40).map((r) => ({
        id: r.id,
        animalId: r.animalId,
        date: r.date,
        session: r.session,
        milkLitres: Number(r.milkLitres),
        notes: r.notes,
      })),
    });
  } catch (error) {
    console.error("Per-cow production error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/production/repro — the reproduction timeline (A3), computed from
// the Breeding rows the farmer already enters. No new table and no invented
// benchmark: days-in-milk, calving interval and services-per-conception are
// the farmer's own figures, and a date they never recorded stays null rather
// than becoming a zero or a guess.
router.get("/repro", async (req: Request, res: Response) => {
  try {
    const rows = await prisma.breeding.findMany({
      where: { farmId: req.user!.farmId! },
      // mate date is nullable, so the sort needs somewhere for heat-only rows to
      // go: newest first on whichever date the row actually carries.
      orderBy: [{ matingDate: "desc" }, { heatObservedAt: "desc" }],
      select: {
        damName: true, matingDate: true, expectedBirth: true, actualBirth: true,
        offspringCount: true, offspringAlive: true, method: true, status: true,
        heatObservedAt: true, heatSigns: true, dryOffDate: true,
      },
    });
    // Every date is passed through as-is (null stays null) rather than defaulted:
    // `matingDate` is nullable now that a heat row can exist before any service,
    // and `new Date(null)` is an Invalid Date that would silently poison the
    // interval arithmetic downstream.
    const events: BreedingEvent[] = rows.map((r) => ({
      damName: r.damName,
      matingDate: r.matingDate ? new Date(r.matingDate) : null,
      heatObservedAt: r.heatObservedAt ? new Date(r.heatObservedAt) : null,
      heatSigns: r.heatSigns,
      dryOffDate: r.dryOffDate ? new Date(r.dryOffDate) : null,
      expectedBirth: r.expectedBirth ? new Date(r.expectedBirth) : null,
      actualBirth: r.actualBirth ? new Date(r.actualBirth) : null,
      offspringCount: r.offspringCount,
      offspringAlive: r.offspringAlive,
      method: r.method,
      status: r.status,
    }));
    res.json({ herd: herdRepro(events), cows: allCows(events) });
  } catch (error) {
    console.error("Repro timeline error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/production/:id — the flock-level daily record, not a cow's.
// Registered last on purpose: every literal path above it comes first, which is
// the ordering rule the route-shadowing test holds (a literal registered after
// a `/:id` catch-all silently never runs).
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.dailyProduction.deleteMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
