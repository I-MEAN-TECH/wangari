/**
 * KIAMIS groundwork — the parse rules and the export shape.
 *
 * The assertions worth defending: a wrong ID is rejected rather than stored,
 * a half GPS pair is an error rather than a half-save, the mask never shows
 * more than four digits, and `missing` always tells the whole truth about
 * what the farmer still has to bring to the county office.
 */

import { describe, it, expect } from "vitest";
import {
  parseNationalId,
  maskNationalId,
  parseGps,
  parsePremisesRegNo,
  buildKiamisExport,
  type KiamisInput,
} from "./kiamis.js";

describe("national ID", () => {
  it("accepts and normalises a plain ID", () => {
    expect(parseNationalId("12345678")).toEqual({ ok: true, value: "12345678" });
  });

  it("strips the separators people actually type", () => {
    expect(parseNationalId("12-345678")).toEqual({ ok: true, value: "12345678" });
    expect(parseNationalId(" 12 345 678 ")).toEqual({ ok: true, value: "12345678" });
  });

  it("treats blank as honestly-not-recorded, distinct from invalid", () => {
    expect(parseNationalId("")).toEqual({ ok: true, value: null });
    expect(parseNationalId("   ")).toEqual({ ok: true, value: null });
    expect(parseNationalId(null)).toEqual({ ok: true, value: null });
    expect(parseNationalId(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects letters instead of guessing what was meant", () => {
    const r = parseNationalId("AE123456");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("numbers only");
  });

  it("rejects the wrong length with a countable reason", () => {
    expect(parseNationalId("123456").ok).toBe(false); // too short
    expect(parseNationalId("12345678901").ok).toBe(false); // too long
    expect(parseNationalId("1234567").ok).toBe(true); // 7 is a real ID length
  });
});

describe("the mask", () => {
  it("shows only the last four digits", () => {
    expect(maskNationalId("12345678")).toBe("••••5678");
  });
  it("is null for absent IDs", () => {
    expect(maskNationalId(null)).toBeNull();
    expect(maskNationalId("")).toBeNull();
  });
});

describe("GPS", () => {
  it("accepts a complete pair and returns numbers", () => {
    const r = parseGps("-1.0524", "36.9745");
    expect(r).toEqual({ ok: true, value: { latitude: -1.0524, longitude: 36.9745 } });
  });

  it("accepts neither coordinate as a clean null", () => {
    expect(parseGps(null, null)).toEqual({ ok: true, value: null });
    expect(parseGps("", "  ")).toEqual({ ok: true, value: null });
  });

  it("refuses a lone coordinate rather than saving half a location", () => {
    const r = parseGps("-1.05", null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Both latitude and longitude");
    expect(parseGps(null, "36.97").ok).toBe(false);
  });

  it("refuses out-of-range or non-numeric coordinates", () => {
    expect(parseGps("91", "36").ok).toBe(false);
    expect(parseGps("-1", "181").ok).toBe(false);
    expect(parseGps("north", "36").ok).toBe(false);
    // Kenya sits under both limits comfortably.
    expect(parseGps("1.2921", "36.8219").ok).toBe(true);
  });
});

describe("premises registration number", () => {
  it("trims and passes a real number through", () => {
    expect(parsePremisesRegNo("  KN-2026-00123 ")).toEqual({ ok: true, value: "KN-2026-00123" });
  });
  it("treats blank as not-registered", () => {
    expect(parsePremisesRegNo("")).toEqual({ ok: true, value: null });
    expect(parsePremisesRegNo(null)).toEqual({ ok: true, value: null });
  });
  it("refuses absurd lengths", () => {
    expect(parsePremisesRegNo("x".repeat(65)).ok).toBe(false);
  });
});

describe("the export document", () => {
  const full: KiamisInput = {
    farmerName: "Wangari Mwangi",
    nationalId: "12345678",
    phone: "+254712345678",
    farmName: "Wangari Mwangi's Farm",
    county: "Kiambu",
    location: "Limuru",
    premisesRegNo: "KN-2026-00123",
    areaValue: 4.5,
    areaUnit: "acre",
    latitude: -1.0524,
    longitude: 36.9745,
    commodities: ["cattle_dairy", "layers"],
    annualIncomeKes: 10150.6,
  };

  it("carries every field KIAMIS asks for", () => {
    const doc = buildKiamisExport(full, new Date("2026-10-06T10:00:00Z"));
    expect(doc.schema).toBe("kiamis-farmer-registration/v1");
    expect(doc.generatedAt).toBe("2026-10-06T10:00:00.000Z");
    expect(doc.registration.nationalId).toBe("12345678");
    expect(doc.registration.county).toBe("Kiambu");
    expect(doc.holding.areaValue).toBe(4.5);
    expect(doc.holding.latitude).toBe(-1.0524);
    expect(doc.commodities).toEqual(["cattle_dairy", "layers"]);
    expect(doc.annualIncomeKes).toBe(10151); // rounded to whole shillings
    expect(doc.missing).toEqual([]);
  });

  it("lists EVERY unrecorded field instead of implying completeness", () => {
    const doc = buildKiamisExport({
      farmerName: "Trevor Njama",
      nationalId: null,
      phone: null,
      farmName: null,
      county: null,
      premisesRegNo: null,
      areaValue: null,
      areaUnit: null,
      latitude: null,
      longitude: null,
      commodities: [],
      annualIncomeKes: null,
    });
    expect(doc.missing).toEqual([
      "national ID number",
      "phone number",
      "county",
      "size of farm",
      "commodities farmed",
      "annual income",
      "farm coordinates",
    ]);
    expect(doc.registration.nationalId).toBeNull();
    expect(doc.holding.latitude).toBeNull();
    expect(doc.annualIncomeKes).toBeNull();
  });

  it("treats zero area as not recorded — a zero-acre farm is not a farm", () => {
    const doc = buildKiamisExport({ ...full, areaValue: 0 });
    expect(doc.missing).toContain("size of farm");
  });

  it("never mutates the input's commodity list", () => {
    const commodities = ["layers", "coffee"];
    buildKiamisExport({ ...full, commodities });
    expect(commodities).toEqual(["layers", "coffee"]);
  });
});
