import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { resolveTagRange, rangeRows } from "../lib/tag-range.js";
import { buildOwnerRegister, buildCountyExport } from "../lib/animal-register.js";
import {
  FARMER_MOVEMENT_REASONS,
  isFarmerMovementReason,
} from "../lib/animal-movement.js";

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
router.use(authMiddleware, requireFarm);

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

// NOTE: literal routes (/register, /register.csv, /county-export, /county-export.csv,
// /traceability/list) MUST stay registered before "/:id" — see lib/route-shadowing.test.ts.
// GET /api/animals/traceability — the list a buyer or county officer asks for
//
// Two sources are merged:
//
//  1. Individually-tracked animals (`animals` rows). Only a handful per farm —
//     the sick one, the insured one, the one being sold.
//  2. FLOCK TAG RANGES. A herd of 500 costs three columns on the flock; the 500
//     individual numbers are generated here, on demand, only when someone asks
//     for the list. We never store rows we would only ever read once.
//
// So a farmer with 500 tagged cattle enters three numbers, not five hundred.
router.get("/traceability/list", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { name: true, county: true, location: true, code: true },
    });

    const individuallyTracked = await prisma.animal.findMany({
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

    // Expand flock tag ranges on the fly — no rows stored for these.
    const taggedFlocks = await prisma.flock.findMany({
      where: { farmId, NOT: { tagFrom: null } },
      select: {
        id: true,
        name: true,
        breed: true,
        type: true,
        category: true,
        currentCount: true,
        tagFrom: true,
        tagTo: true,
        taggedCount: true,
      },
    });

    const fromRanges: any[] = [];
    const flockRanges: any[] = [];
    for (const f of taggedFlocks) {
      const range = resolveTagRange(f.tagFrom, f.tagTo, f.taggedCount ?? f.currentCount);
      if (!range.tags.length) {
        flockRanges.push({
          flock: f.name,
          tagFrom: f.tagFrom,
          tagTo: f.tagTo,
          span: 0,
          note: range.note,
        });
        continue;
      }
      fromRanges.push(...rangeRows(f, range));
      flockRanges.push({
        flock: f.name,
        tagFrom: f.tagFrom,
        tagTo: f.tagTo,
        span: range.span,
        consistent: range.consistent,
        note: range.note,
      });
    }

    const animals = [...individuallyTracked, ...fromRanges].sort((a: any, b: any) =>
      String(a.tagNumber).localeCompare(String(b.tagNumber))
    );

    res.json({
      farm,
      generatedAt: new Date().toISOString(),
      count: animals.length,
      // Breakdown so the farmer understands where the numbers came from.
      summary: {
        individuallyTracked: individuallyTracked.length,
        fromFlockRanges: fromRanges.length,
        flockRanges,
      },
      animals,
    });
  } catch (error) {
    console.error("Traceability export error:", error);
    res.status(500).json({ error: "Failed to build the traceability list" });
  }
});


// ─── M2: the owner register (ANITRAC §16) and the county export (§6) ────────
// §16: every keeper keeps a register of their animals. This is that register,
// generated from records the farmer already had — no retyping. §6: the same
// records shaped for the County Director's register. Both are farmer-initiated
// downloads; nothing is ever auto-shared (belief rule 8).
//
// They ride the traceability machinery: individually-tracked animals PLUS
// flock tag ranges expanded on demand.

// GET /api/animals/register — the printable per-keeper register
router.get("/register", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const register = await buildOwnerRegister(farmId);
    res.json(register);
  } catch (error) {
    console.error("Owner register error:", error);
    res.status(500).json({ error: "Failed to build the register" });
  }
});


// GET /api/animals/register.csv — the same register as a CSV download
router.get("/register.csv", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const register = await buildOwnerRegister(farmId);
    const csv = registerCsv(register);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="animal-register-${register.farm.code || register.farm.name.replace(/\W+/g, "-").toLowerCase()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Owner register CSV error:", error);
    res.status(500).json({ error: "Failed to build the register" });
  }
});


// GET /api/animals/county-export — the §6 county-facing export
router.get("/county-export", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const export_ = await buildCountyExport(farmId);
    res.json(export_);
  } catch (error) {
    console.error("County export error:", error);
    res.status(500).json({ error: "Failed to build the county export" });
  }
});


// GET /api/animals/county-export.csv — the §6 export as a CSV download
router.get("/county-export.csv", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const export_ = await buildCountyExport(farmId);
    const csv = countyCsv(export_);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="county-animal-export-${export_.farm.county || "county"}-${export_.farm.code || export_.farm.name.replace(/\W+/g, "-").toLowerCase()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("County export CSV error:", error);
    res.status(500).json({ error: "Failed to build the county export" });
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
// ─── M2: the movement ledger (ANITRAC §20) ─────────────────────────────────
// A movement is recorded when it happens — sold, transferred, taken to graze,
// to the vet, into quarantine. The traceability story a buyer or county
// officer reads is built from these rows, so the record exists BEFORE the
// question is asked.
//
// A move between the farm's OWN groups is also a movement row, but the farmer
// never types it: POST /api/flocks/transfer writes it, with its own reason
// (`group_move`) taken from the group names. That reason is deliberately not
// accepted here — this endpoint's from/to fields are premises, and a group is
// not a premises. See lib/animal-movement.ts.


// POST /api/animals/:id/movements — record one movement for one tagged animal
router.post("/:id/movements", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const animalId = Number(req.params.id);
    const { fromPremises, toPremises, movedAt, reason, permitRef, notes } = req.body as Record<string, unknown>;

    // The animal must belong to this farm — IDOR guard first.
    const animal = await prisma.animal.findFirst({
      where: { id: animalId, farmId },
      select: { id: true, tagNumber: true, status: true },
    });
    if (!animal) return res.status(404).json({ error: "Animal not found on this farm" });

    if (typeof fromPremises !== "string" || !fromPremises.trim() || typeof toPremises !== "string" || !toPremises.trim())
      return res.status(400).json({ error: "Both where the animal came from and where it went are required — a movement with one end is a guess." });
    if (!isFarmerMovementReason(reason))
      return res.status(400).json({ error: `Reason must be one of: ${FARMER_MOVEMENT_REASONS.join(", ")}` });
    const date = movedAt ? new Date(String(movedAt)) : new Date();
    if (Number.isNaN(date.getTime()))
      return res.status(400).json({ error: "The movement date could not be read." });
    if (permitRef !== undefined && permitRef !== null && typeof permitRef !== "string")
      return res.status(400).json({ error: "The permit reference must be text." });

    const movement = await prisma.animalMovement.create({
      data: {
        farmId,
        animalId,
        fromPremises: fromPremises.trim(),
        toPremises: toPremises.trim(),
        movedAt: date,
        reason: String(reason),
        permitRef: typeof permitRef === "string" && permitRef.trim() ? permitRef.trim() : null,
        notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
      },
    });

    // A sale or permanent transfer flips the animal's status, so the herd
    // list stays truthful. `moved` for anything temporary is wrong — a grazing
    // trip is not an exit.
    if (reason === "sale") {
      await prisma.animal.update({ where: { id: animalId }, data: { status: "sold" } });
    } else if (reason === "transfer" && animal.status === "active") {
      await prisma.animal.update({ where: { id: animalId }, data: { status: "moved" } });
    }

    res.status(201).json({ movement });
  } catch (error) {
    console.error("Record movement error:", error);
    res.status(500).json({ error: "Failed to record the movement" });
  }
});

// GET /api/animals/:id/movements — the movement history of one animal
router.get("/:id/movements", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const animalId = Number(req.params.id);
    const animal = await prisma.animal.findFirst({
      where: { id: animalId, farmId },
      select: { id: true, tagNumber: true },
    });
    if (!animal) return res.status(404).json({ error: "Animal not found on this farm" });
    const movements = await prisma.animalMovement.findMany({
      where: { animalId, farmId },
      orderBy: { movedAt: "asc" },
    });
    res.json({ animal: { id: animal.id, tagNumber: animal.tagNumber }, movements });
  } catch (error) {
    console.error("List movements error:", error);
    res.status(500).json({ error: "Failed to load the movement history" });
  }
});
/** CSV of the owner register: one row per tag, quotable, RFC-4180-safe. */
function registerCsv(register: Awaited<ReturnType<typeof buildOwnerRegister>>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Tag number", "Species", "Breed", "Sex", "Status", "Flock", "On farm since", "Vaccinations recorded", "Movements recorded", "Last movement"],
    ...register.animals.map((a) => [
      a.tagNumber, a.species, a.breed, a.sex, a.status, a.flockName, a.onFarmSince,
      a.vaccinationCount, a.movementCount, a.lastMovementAt ?? "",
    ]),
  ];
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

/** CSV of the county export: the §6 register shape the County Director keeps. */
function countyCsv(export_: Awaited<ReturnType<typeof buildCountyExport>>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Tag number", "Species", "Status", "Premises registration no", "County", "Movements (from -> to, date, reason)"],
    ...export_.animals.map((a) => [
      a.tagNumber, a.species, a.status,
      export_.farm.premisesRegNo ?? "", export_.farm.county ?? "",
      a.movementChain,
    ]),
  ];
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export default router;
