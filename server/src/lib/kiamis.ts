/**
 * KIAMIS groundwork — parsing and shaping the national register's export.
 *
 * KIAMIS (Kenya Integrated Agriculture Management Information System) is the
 * national farmer register and the gate to the fertiliser e-voucher: eligibility
 * requires the farmer to BE in it, and the voucher quantity is derived from the
 * **declared acreage** at registration. The survey shape, from the ASTGS
 * flagship 2 registration flow, is: *name, ID number, SIZE OF FARM, commodities
 * farmed, annual income* — plus geo-mapping for coffee's EUDR traceability.
 *
 * Everything here is pure because the shape is the contract: a farmer will
 * paste this into a county officer's form, and a field that is present-but-wrong
 * is worse for him than a field that is honestly missing.
 *
 * ## The honesty rules
 *
 * - **Missing stays missing.** `null` for anything not recorded, and the
 *   `missing` list names exactly which KIAMIS-required fields are absent, so
 *   the export doubles as a to-do list rather than a false-complete document.
 * - **The national ID is parsed, not guessed.** Kenyan national IDs are 7–9
 *   digits. Anything else (a passport, a driving licence, a typo) is rejected
 *   with a reason instead of stored as-is — a wrong ID number in KIAMIS means
 *   the farmer is registered to somebody else's identity.
 * - **GPS is captured as a pair.** One coordinate without the other is a point
 *   somewhere in the Indian Ocean, so partial input is an error, not a save.
 */

export interface KiamisInput {
  farmerName: string | null;
  nationalId: string | null;
  phone: string | null;
  farmName: string | null;
  county: string | null;
  location: string | null;
  premisesRegNo: string | null;
  areaValue: number | null;
  areaUnit: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Distinct things this farm grows or keeps, in the farmer's own words. */
  commodities: readonly string[];
  /** Income over the trailing year, from real income rows. */
  annualIncomeKes: number | null;
}

export interface KiamisExport {
  schema: "kiamis-farmer-registration/v1";
  generatedAt: string;
  registration: {
    farmerName: string | null;
    nationalId: string | null;
    phone: string | null;
    county: string | null;
    location: string | null;
  };
  holding: {
    farmName: string | null;
    premisesRegNo: string | null;
    areaValue: number | null;
    areaUnit: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  commodities: string[];
  annualIncomeKes: number | null;
  /** KIAMIS-required fields this farm has NOT recorded yet. Never hidden. */
  missing: string[];
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Normalise a national ID to digits.
 *
 * Accepts separators people actually type (`12-345678`, `12 345 678`);
 * rejects anything that is not 7–9 digits with a reason. Blank → `null`
 * (legitimately not-yet-recorded), which is different from *invalid*.
 */
export function parseNationalId(raw: unknown): ParseResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const text = String(raw).trim();
  if (text === "") return { ok: true, value: null };

  const digits = text.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: "A national ID is numbers only" };
  }
  if (digits.length < 7 || digits.length > 9) {
    return { ok: false, error: "A Kenyan national ID has 7–9 digits" };
  }
  return { ok: true, value: digits };
}

/** Mask for ordinary profile reads: `••••6789`. The full ID never leaks here. */
export function maskNationalId(id: string | null): string | null {
  if (!id) return null;
  return `••••${id.slice(-4)}`;
}

/**
 * Validate a GPS pair. Both-or-neither: a lone coordinate is an error the
 * farmer can understand, not a silent half-save.
 */
export function parseGps(latRaw: unknown, lngRaw: unknown): ParseResult<{ latitude: number; longitude: number } | null> {
  const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  if (blank(latRaw) && blank(lngRaw)) return { ok: true, value: null };
  if (blank(latRaw) || blank(lngRaw)) {
    return { ok: false, error: "Both latitude and longitude are needed — or neither" };
  }
  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: "Coordinates must be numbers" };
  }
  if (Math.abs(latitude) > 90) return { ok: false, error: "Latitude must be between −90 and 90" };
  if (Math.abs(longitude) > 180) return { ok: false, error: "Longitude must be between −180 and 180" };
  return { ok: true, value: { latitude, longitude } };
}

/** Premises/holding registration number: free-form, county-issued, optional. */
export function parsePremisesRegNo(raw: unknown): ParseResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const text = String(raw).trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > 64) return { ok: false, error: "That registration number is too long" };
  return { ok: true, value: text };
}

/**
 * Shape one farm into the KIAMIS registration document.
 *
 * `missing` lists every required field the farm has not recorded. It is never
 * abbreviated or softened — the export must be usable as the farmer's own
 * checklist before he walks into the county office.
 */
export function buildKiamisExport(input: KiamisInput, now: Date = new Date()): KiamisExport {
  const missing: string[] = [];
  if (!input.farmerName) missing.push("farmer name");
  if (!input.nationalId) missing.push("national ID number");
  if (!input.phone) missing.push("phone number");
  if (!input.county) missing.push("county");
  if (input.areaValue === null || input.areaValue === undefined || !(input.areaValue > 0)) {
    missing.push("size of farm");
  }
  if (input.commodities.length === 0) missing.push("commodities farmed");
  if (input.annualIncomeKes === null || input.annualIncomeKes === undefined) missing.push("annual income");
  if (input.latitude === null || input.longitude === null) missing.push("farm coordinates");

  return {
    schema: "kiamis-farmer-registration/v1",
    generatedAt: now.toISOString(),
    registration: {
      farmerName: input.farmerName ?? null,
      nationalId: input.nationalId ?? null,
      phone: input.phone ?? null,
      county: input.county ?? null,
      location: input.location ?? null,
    },
    holding: {
      farmName: input.farmName ?? null,
      premisesRegNo: input.premisesRegNo ?? null,
      areaValue: input.areaValue ?? null,
      areaUnit: input.areaUnit ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
    commodities: [...input.commodities],
    annualIncomeKes:
      input.annualIncomeKes === null || input.annualIncomeKes === undefined
        ? null
        : Math.round(input.annualIncomeKes),
    missing,
  };
}
