import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

/**
 * Animal identity — ANITRAC traceability.
 *
 * Kenya rolled out ANITRAC in July 2026: every cattle, sheep and goat carries
 * a number of not more than 15 digits starting with the 141 country prefix
 * (visual tag left ear, RFID chip right ear). The Ministry owns the official
 * registration; this router stores the tag the farmer ALREADY has and links it
 * to this farm's day-to-day record, which is the part no government system
 * does.
 *
 * Design rules (docs/module-plan.md §1):
 *  - Additive only. Flock.currentCount remains the daily source of truth; an
 *    Animal row is optional detail the farmer sets up ONCE and then only views.
 *  - Every query is scoped to req.user.farmId — a farmer can never see or touch
 *    another farm's animals (IDOR guard).
 *  - Range expansion is capped so a mistyped range cannot mass-insert rows.
 */

const router = Router();
router.use(authMiddleware);

const ANITRAC_PREFIX = "141";
const ANITRAC_MAX_DIGITS = 15;
const MAX_RANGE = 500;

const VALID_STATUS = new Set(["active", "sold", "moved", "died", "missing"]);

/** Normalise + validate a tag. Returns null when unusable. */
function normaliseTag(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits || digits.length > ANITRAC_MAX_DIGITS) return null;
  return digits;
}

/** Advisory flags — never reject a tag over these, just tell the farmer. */
function tagWarnings(tag: string): string[] {
  const out: string[] = [];
  if (tag.length < ANITRAC_MAX_DIGITS)
    out.push(`Tag has ${tag.length} digits; ANITRAC is normally ${ANITRAC_MAX_DIGITS}.`);
  if (!tag.startsWith(ANITRAC_PREFIX))
    out.push(`Kenyan ANITRAC tags normally start with ${ANITRAC_PREFIX}.`);
  return out;
}

/**
 * Expand "start..end" into individual tags, same rules as the client helper so
 * the two never disagree. Uses BigInt because 15-digit tags exceed the safe
 * integer range once a farmer mistypes extra digits.
 */
function expandRange(startRaw: unknown, endRaw: unknown):
  | { ok: true; tags: string[] }
  | { ok: false; error: string } {
  const a = normaliseTag(startRaw);
  const b = normaliseTag(endRaw);
  if (!a || !b) return { ok: false, error: "Both a start and an end tag are required." };
  const cmp = a.length !== b.length ? a.length - b.length : a.localeCompare(b);
  // Equal endpoints is valid: it is a single animal in range mode.
  if (cmp > 0) return { ok: false, error: "The end tag must be after the start tag." };
  const startN = BigInt(a);
  const count = Number(BigInt(b) - startN) + 1;
  if (count > MAX_RANGE)
    return { ok: false, error: `That is ${count} tags. The limit is ${MAX_RANGE} per batch.` };
  const tags: string[] = [];
  for (let i = 0n; i < BigInt(count); i++) tags.push((startN + i).toString());
  return { ok: true, tags };
}

// GET /api/animals — list this farm's tagged animals
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const { status, flockId, q } = req.query as Record<string, string | undefined>;

    const animals = await prisma.animal.findMany({
      where: {
        farmId,
        ...(status ? { status } : {}),
        ...(flockId ? { flockId: Number(flockId) } : {}),
        ...(q ? { tagNumber: { contains: q.replace(/\D/g, "") || q } } : {}),
      },
      orderBy: [{ status: "asc" }, { tagNumber: "asc" }],
      include: {
        flock: { select: { id: true, name: true, breed: true, type: true } },
        vaccinations: { orderBy: { scheduledDate: "desc" } },
      },
    });

    // Per-flock tag counts so the flock screen can show "12 of 40 tagged"
    // without a second query.
    const byFlock = await prisma.animal.groupBy({
      by: ["flockId"],
      where: { farmId },
      _count: { _all: true },
    });

    res.json({ animals, taggedByFlock: byFlock });
  } catch (error) {
    console.error("List animals error:", error);
    res.status(500).json({ error: "Failed to fetch animals" });
  }
});

// GET /api/animals/:id — one animal with its full history
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const animal = await prisma.animal.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      include: {
        flock: {
          select: {
            id: true,
            name: true,
            breed: true,
            type: true,
            currentCount: true,
            // The animal's production is the flock's production — Wangari
            // records at flock level by design (see module-plan §1).
            production: { orderBy: { date: "desc" }, take: 30 },
          },
        },
        vaccinations: { orderBy: { scheduledDate: "desc" } },
      },
    });
    if (!animal)
      return res.status(404).json({ error: "Animal not found" });
    res.json(animal);
  } catch (error) {
    console.error("Get animal error:", error);
    res.status(500).json({ error: "Failed to fetch animal" });
  }
});

// POST /api/animals — register one tag, or a whole range of tags
router.post("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const {
      tagNumber,
      tagStart,
      tagEnd,
      flockId,
      species,
      breed,
      sex,
      birthDate,
      notes,
      photoUrl,
    } = req.body || {};

    // A flockId may only be used if it belongs to this farm.
    if (flockId != null) {
      const flock = await prisma.flock.findFirst({
        where: { id: Number(flockId), farmId },
        select: { id: true },
      });
      if (!flock)
        return res.status(400).json({ error: "That flock is not on this farm" });
    }

    const shared = {
      farmId,
      flockId: flockId != null ? Number(flockId) : null,
      species: species || null,
      breed: breed || null,
      sex: sex || null,
      birthDate: birthDate ? new Date(birthDate) : null,
      notes: notes || null,
      photoUrl: photoUrl || null,
      status: "active",
    };

    // Range mode: "I bought 40 tags, 1410001 to 1410040"
    if (tagStart || tagEnd) {
      const range = expandRange(tagStart, tagEnd);
      if (!range.ok) return res.status(400).json({ error: range.error });

      // Don't collide with tags the farmer already registered.
      const existing = await prisma.animal.findMany({
        where: { farmId, tagNumber: { in: range.tags } },
        select: { tagNumber: true },
      });
      const already = new Set(existing.map((e) => e.tagNumber));
      const fresh = range.tags.filter((t) => !already.has(t));
      if (!fresh.length)
        return res
          .status(409)
          .json({ error: "All those tags are already registered on this farm" });

      const warnings = tagWarnings(fresh[0]);
      await prisma.animal.createMany({ data: fresh.map((t) => ({ ...shared, tagNumber: t })) });

      return res.status(201).json({
        created: fresh.length,
        skipped: range.tags.length - fresh.length,
        firstTag: fresh[0],
        lastTag: fresh[fresh.length - 1],
        warnings,
      });
    }

    // Single tag
    const tag = normaliseTag(tagNumber);
    if (!tag)
      return res.status(400).json({
        error: `Enter a tag of digits only, up to ${ANITRAC_MAX_DIGITS} characters`,
      });

    const dupe = await prisma.animal.findFirst({
      where: { farmId, tagNumber: tag },
      select: { id: true },
    });
    if (dupe)
      return res
        .status(409)
        .json({ error: "That tag number is already on this farm" });

    const animal = await prisma.animal.create({ data: { ...shared, tagNumber: tag } });
    res.status(201).json({ animal, warnings: tagWarnings(tag) });
  } catch (error) {
    console.error("Create animal error:", error);
    res.status(500).json({ error: "Failed to register the animal" });
  }
});

// PATCH /api/animals/:id — update status / details (e.g. sold, moved, died)
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const { status, flockId, breed, sex, birthDate, notes, photoUrl, species } =
      req.body || {};

    if (status && !VALID_STATUS.has(status))
      return res.status(400).json({ error: "Invalid status" });

    const existing = await prisma.animal.findFirst({
      where: { id: Number(req.params.id), farmId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Animal not found" });

    if (flockId != null) {
      const flock = await prisma.flock.findFirst({
        where: { id: Number(flockId), farmId },
        select: { id: true },
      });
      if (!flock)
        return res.status(400).json({ error: "That flock is not on this farm" });
    }

    const animal = await prisma.animal.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(status ? { status } : {}),
        ...(breed !== undefined ? { breed: breed || null } : {}),
        ...(sex !== undefined ? { sex: sex || null } : {}),
        ...(species !== undefined ? { species: species || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(photoUrl !== undefined ? { photoUrl: photoUrl || null } : {}),
        ...(birthDate !== undefined
          ? { birthDate: birthDate ? new Date(birthDate) : null }
          : {}),
        ...(flockId !== undefined
          ? { flockId: flockId != null ? Number(flockId) : null }
          : {}),
      },
    });
    res.json(animal);
  } catch (error) {
    console.error("Update animal error:", error);
    res.status(500).json({ error: "Failed to update the animal" });
  }
});

// DELETE /api/animals/:id — remove a tag (wrong number, or farmer opt-out)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const result = await prisma.animal.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!result.count)
      return res.status(404).json({ error: "Animal not found" });
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete animal error:", error);
    res.status(500).json({ error: "Failed to remove the animal" });
  }
});

// GET /api/animals/traceability — the list a buyer or county officer asks for
router.get("/traceability/list", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { name: true, county: true, location: true, code: true },
    });

    const animals = await prisma.animal.findMany({
      where: { farmId },
      orderBy: { tagNumber: "asc" },
      select: {
        tagNumber: true,
        species: true,
        breed: true,
        sex: true,
        status: true,
        birthDate: true,
        createdAt: true,
        flock: { select: { name: true, type: true, currentCount: true } },
        vaccinations: {
          select: {
            vaccineName: true,
            scheduledDate: true,
            completedDate: true,
            status: true,
          },
        },
      },
    });

    res.json({
      farm,
      generatedAt: new Date().toISOString(),
      count: animals.length,
      animals,
    });
  } catch (error) {
    console.error("Traceability export error:", error);
    res.status(500).json({ error: "Failed to build the traceability list" });
  }
});

export default router;
