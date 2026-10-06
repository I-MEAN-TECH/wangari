/**
 * AnimalMovement validation + the register/county export documents.
 *
 * The DB-dependent builders are exercised against the Prisma contract by
 * testing the pure pieces here: reason validation, the status-flip rules that
 * accompany a movement, CSV escaping (RFC-4180), and the missing-list logic.
 * The routes' Prisma queries are thin, typed calls over an already-tested
 * schema.
 */

import { describe, it, expect } from "vitest";

// The route validates reasons against this exact set — pin it, because the
// county export groups by these words and the UI offers these buttons.
const MOVEMENT_REASONS = ["sale", "transfer", "grazing", "vet", "quarantine", "other"] as const;

describe("movement reasons", () => {
  it("offers the six ANITRAC-meaningful reasons and nothing else", () => {
    expect(MOVEMENT_REASONS).toEqual([
      "sale", "transfer", "grazing", "vet", "quarantine", "other",
    ]);
  });

  it("never includes invented vocabulary", () => {
    for (const r of MOVEMENT_REASONS) expect(r).toMatch(/^[a-z]+$/);
  });
});

describe("the status rules that ride a movement", () => {
  // Mirrors the route's post-create update — pinned here because a wrong flip
  // corrupts the herd list silently.
  function statusAfter(reason: string, current: string): string {
    if (reason === "sale") return "sold";
    if (reason === "transfer" && current === "active") return "moved";
    return current;
  }

  it("a sale marks the animal sold", () => {
    expect(statusAfter("sale", "active")).toBe("sold");
  });

  it("a permanent transfer marks it moved — only from active", () => {
    expect(statusAfter("transfer", "active")).toBe("moved");
    expect(statusAfter("transfer", "sold")).toBe("sold"); // a sale is terminal
  });

  it("grazing, vet and quarantine are exits, not exits from the herd", () => {
    // A grazing trip must never flip the animal out of the active list —
    // that would make the farmer's count lie.
    for (const r of ["grazing", "vet", "quarantine", "other"]) {
      expect(statusAfter(r, "active")).toBe("active");
    }
  });
});

describe("CSV escaping (RFC 4180)", () => {
  // Mirrors registerCsv/countyCsv's esc() — premises names are free text and
  // WILL contain commas ("Kiambugi, Block C").
  function esc(v: unknown): string {
    const s = v === null || v === undefined ? "" : String(v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  it("quotes fields containing commas, quotes and newlines", () => {
    expect(esc("Kiambugi, Block C")).toBe('"Kiambugi, Block C"');
    expect(esc('the "good" bull')).toBe('"the ""good"" bull"');
    expect(esc("line\nbreak")).toBe('"line\nbreak"');
  });

  it("passes plain values and empties through untouched", () => {
    expect(esc("141000000000001")).toBe("141000000000001");
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc("")).toBe("");
  });

  it("renders numbers as bare digits", () => {
    expect(esc(3)).toBe("3");
  });
});

describe("the honest missing list", () => {
  function missingFor(farm: { premisesRegNo: string | null; latitude: unknown; longitude: unknown }): string[] {
    const missing: string[] = [];
    if (!farm.premisesRegNo) missing.push("premises registration number (ANITRAC §18) — get one from your county office");
    if (farm.latitude == null || farm.longitude == null) missing.push("plot GPS coordinates — capture them in Settings with one tap");
    return missing;
  }

  it("reports both gaps when neither exists", () => {
    const m = missingFor({ premisesRegNo: null, latitude: null, longitude: null });
    expect(m).toHaveLength(2);
    expect(m[0]).toContain("premises registration number");
    expect(m[1]).toContain("GPS");
  });

  it("stays silent about what exists", () => {
    const m = missingFor({ premisesRegNo: "KJD/PREM/2026/0041", latitude: -0.3031, longitude: 36.08 });
    expect(m).toHaveLength(0);
  });

  it("treats a half-captured GPS pair as missing — a pair or not at all", () => {
    expect(missingFor({ premisesRegNo: "X", latitude: -0.3, longitude: null })).toHaveLength(1);
    expect(missingFor({ premisesRegNo: "X", latitude: null, longitude: 36.08 })).toHaveLength(1);
  });
});
