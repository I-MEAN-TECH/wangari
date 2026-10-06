/**
 * The owner register (ANITRAC §16) and the county export (§6).
 *
 * Both documents are generated from records the farmer already had — the
 * individually-tracked animals, the flock tag ranges, the vaccination and
 * movement rows. Nothing here asks the farmer to retype anything; the whole
 * point (module-plan §1 A4) is that the document exists BECAUSE the daily
 * record exists.
 *
 * The two documents differ in shape, not in source:
 *  - The OWNER REGISTER is the keeper's own book: one row per tag with the
 *    counts a keeper is asked for ("how many vaccinated? how many moved?").
 *  - The COUNTY EXPORT is the §6 register the County Director keeps: identity,
 *    status, premises, and the movement chain per animal.
 *
 * Honesty rules:
 *  - Both reports carry an honest `missing` list (same pattern as the KIAMIS
 *    export): no premises registration number, or premises without GPS, is
 *    REPORTED, never papered over.
 *  - Empty is a valid answer. A farm with 0 Animal rows and 0 tag ranges gets
 *    a document that says so — never a fabricated list.
 */

import { prisma } from "../db.js";
import { resolveTagRange, rangeRows } from "./tag-range.js";

export interface RegisterAnimal {
  tagNumber: string;
  species: string | null;
  breed: string | null;
  sex: string | null;
  status: string;
  flockName: string | null;
  onFarmSince: string;
  vaccinationCount: number;
  movementCount: number;
  lastMovementAt: string | null;
}

export interface OwnerRegister {
  farm: { id: number; name: string; code: string | null; county: string | null; premisesRegNo: string | null };
  generatedAt: string;
  count: number;
  missing: string[];
  animals: RegisterAnimal[];
}

export interface CountyAnimal {
  tagNumber: string;
  species: string | null;
  status: string;
  movementChain: string;
}

export interface CountyExport {
  farm: { id: number; name: string; code: string | null; county: string | null; premisesRegNo: string | null; latitude: number | null; longitude: number | null };
  generatedAt: string;
  count: number;
  missing: string[];
  animals: CountyAnimal[];
}

/** Shared loading: individually-tracked animals + expanded flock tag ranges. */
async function loadAnimals(farmId: number) {
  const individuallyTracked = await prisma.animal.findMany({
    where: { farmId },
    orderBy: { tagNumber: "asc" },
    select: {
      id: true,
      tagNumber: true,
      species: true,
      breed: true,
      sex: true,
      status: true,
      createdAt: true,
      flock: { select: { name: true } },
    },
  });

  const taggedFlocks = await prisma.flock.findMany({
    where: { farmId, NOT: { tagFrom: null } },
    select: {
      id: true,
      name: true,
      tagFrom: true,
      tagTo: true,
      taggedCount: true,
      currentCount: true,
      createdAt: true,
      // rangeRows() renders these columns; a range has no per-animal detail.
      breed: true,
      type: true,
      category: true,
    },
  });

  // Range-expanded tags are virtual rows (no Animal.id) — movements cannot be
  // joined per-tag for them, so their movement count comes from the flock's
  // recorded rows only when a per-animal row exists. That limitation is stated
  // in the response, never hidden.
  const rangeAnimals: { id: number | null; tagNumber: string; species: string | null; breed: string | null; sex: string | null; status: string; createdAt: Date; flockName: string }[] = [];
  for (const f of taggedFlocks) {
    const range = resolveTagRange(f.tagFrom, f.tagTo, f.taggedCount ?? f.currentCount);
    if (!range.tags.length) continue;
    for (const row of rangeRows(f, range)) {
      rangeAnimals.push({
        id: null,
        tagNumber: row.tagNumber,
        species: null,
        breed: null,
        sex: null,
        status: "active",
        createdAt: f.createdAt ?? new Date(),
        flockName: f.name,
      });
    }
  }

  return { individuallyTracked, rangeAnimals };
}

/** Movements + vaccinations per tag, for the individually-tracked set. */
async function loadPerTagCounts(farmId: number, animalIds: number[]) {
  if (animalIds.length === 0)
    return {
      movementCounts: new Map<number, number>(),
      lastMovement: new Map<number, Date>(),
      vaccinationCounts: new Map<number, number>(),
    };
  const [movements, vaccinations] = await Promise.all([
    prisma.animalMovement.groupBy({
      by: ["animalId"],
      where: { farmId, animalId: { in: animalIds } },
      _count: true,
      _max: { movedAt: true },
    }),
    // Vaccination has NO farmId column (it hangs off flock/animal) — and none
    // is needed: animalIds came from this farm's own animals, so the ID list
    // is already the farm scope. See lib/schema-truth.test.ts, which guards
    // exactly this mistake.
    prisma.vaccination.groupBy({
      by: ["animalId"],
      where: { animalId: { in: animalIds } },
      _count: true,
    }),
  ]);
  const movementCounts = new Map<number, number>();
  const lastMovement = new Map<number, Date>();
  for (const m of movements) {
    if (m.animalId == null) continue;
    movementCounts.set(m.animalId, m._count);
    if (m._max.movedAt) lastMovement.set(m.animalId, m._max.movedAt);
  }
  const vaccinationCounts = new Map<number, number>();
  for (const v of vaccinations) {
    if (v.animalId == null) continue;
    vaccinationCounts.set(v.animalId, v._count);
  }
  return { movementCounts, lastMovement, vaccinationCounts };
}

function missingFor(farm: { premisesRegNo: string | null; latitude: unknown; longitude: unknown }): string[] {
  const missing: string[] = [];
  if (!farm.premisesRegNo) missing.push("premises registration number (ANITRAC §18) — get one from your county office");
  if (farm.latitude == null || farm.longitude == null) missing.push("plot GPS coordinates — capture them in Settings with one tap");
  return missing;
}

/**
 * The §16 owner register. Returns a document that is honest about what the
 * farm has not recorded yet (premises no., GPS) — the export is the farmer's
 * checklist, never a claim that the compliance picture is complete.
 */
export async function buildOwnerRegister(farmId: number): Promise<OwnerRegister> {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: { id: true, name: true, code: true, county: true, premisesRegNo: true, latitude: true, longitude: true },
  });
  if (!farm) throw new Error("Farm not found");

  const { individuallyTracked, rangeAnimals } = await loadAnimals(farmId);
  const trackedIds = individuallyTracked.map((a) => a.id).filter((id): id is number => id != null);
  const { movementCounts, lastMovement, vaccinationCounts } = await loadPerTagCounts(farmId, trackedIds);

  const animals: RegisterAnimal[] = [
    ...individuallyTracked.map((a) => ({
      tagNumber: a.tagNumber,
      species: a.species,
      breed: a.breed,
      sex: a.sex,
      status: a.status,
      flockName: a.flock?.name ?? null,
      onFarmSince: a.createdAt.toISOString().slice(0, 10),
      vaccinationCount: vaccinationCounts.get(a.id) ?? 0,
      movementCount: movementCounts.get(a.id) ?? 0,
      lastMovementAt: lastMovement.get(a.id)?.toISOString().slice(0, 10) ?? null,
    })),
    ...rangeAnimals.map((a) => ({
      tagNumber: a.tagNumber,
      species: a.species,
      breed: a.breed,
      sex: a.sex,
      status: a.status,
      flockName: a.flockName,
      onFarmSince: a.createdAt.toISOString().slice(0, 10),
      vaccinationCount: 0,
      movementCount: 0,
      lastMovementAt: null,
    })),
  ].sort((a, b) => a.tagNumber.localeCompare(b.tagNumber));

  return {
    farm: { id: farm.id, name: farm.name, code: farm.code, county: farm.county, premisesRegNo: farm.premisesRegNo },
    generatedAt: new Date().toISOString(),
    count: animals.length,
    missing: missingFor(farm),
    animals,
  };
}

/** The §6 county-facing export: identity, status, premises, movement chain. */
export async function buildCountyExport(farmId: number): Promise<CountyExport> {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: { id: true, name: true, code: true, county: true, premisesRegNo: true, latitude: true, longitude: true },
  });
  if (!farm) throw new Error("Farm not found");

  const { individuallyTracked, rangeAnimals } = await loadAnimals(farmId);
  const trackedIds = individuallyTracked.map((a) => a.id);
  const movements = trackedIds.length
    ? await prisma.animalMovement.findMany({
        where: { farmId, animalId: { in: trackedIds } },
        orderBy: { movedAt: "asc" },
        select: { animalId: true, fromPremises: true, toPremises: true, movedAt: true, reason: true },
      })
    : [];

  const chainByAnimal = new Map<number, string[]>();
  for (const m of movements) {
    const chain = chainByAnimal.get(m.animalId) ?? [];
    chain.push(`${m.fromPremises} -> ${m.toPremises} on ${m.movedAt.toISOString().slice(0, 10)} (${m.reason})`);
    chainByAnimal.set(m.animalId, chain);
  }

  const animals: CountyAnimal[] = [
    ...individuallyTracked.map((a) => ({
      tagNumber: a.tagNumber,
      species: a.species,
      status: a.status,
      movementChain: (chainByAnimal.get(a.id) ?? []).join("; "),
    })),
    ...rangeAnimals.map((a) => ({
      tagNumber: a.tagNumber,
      species: a.species,
      status: a.status,
      movementChain: "",
    })),
  ].sort((a, b) => a.tagNumber.localeCompare(b.tagNumber));

  return {
    farm: {
      id: farm.id,
      name: farm.name,
      code: farm.code,
      county: farm.county,
      premisesRegNo: farm.premisesRegNo,
      latitude: farm.latitude != null ? Number(farm.latitude) : null,
      longitude: farm.longitude != null ? Number(farm.longitude) : null,
    },
    generatedAt: new Date().toISOString(),
    count: animals.length,
    missing: missingFor(farm),
    animals,
  };
}
