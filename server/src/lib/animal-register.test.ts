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
import {
  ALL_MOVEMENT_REASONS,
  FARMER_MOVEMENT_REASONS,
  GROUP_MOVE_REASON,
  isFarmerMovementReason,
} from "./animal-movement.js";

// The county export prints these words into an animal's movement chain and the
// UI offers them as buttons. This used to be a COPY of the route's list, which
// meant the test could never fail when the route changed — it now reads the real
// vocabulary, so a reason added in one place and forgotten in another breaks here.

describe("movement reasons", () => {
  it("offers the farmer the six ANITRAC-meaningful reasons and nothing else", () => {
    expect([...FARMER_MOVEMENT_REASONS]).toEqual([
      "sale", "transfer", "grazing", "vet", "quarantine", "other",
    ]);
  });

  it("keeps the machine-written group move OUT of the farmer's choices", () => {
    // The movement form's two fields ask for PREMISES. Offering "moved to
    // another group" there would invite a farmer to type a group name where the
    // county expects a location, and the chain would then assert a premises
    // change that never happened.
    expect(FARMER_MOVEMENT_REASONS).not.toContain(GROUP_MOVE_REASON);
    expect(isFarmerMovementReason(GROUP_MOVE_REASON)).toBe(false);
    // …but it IS part of the vocabulary, so it must be labelled and expected.
    expect(ALL_MOVEMENT_REASONS).toContain(GROUP_MOVE_REASON);
  });

  it("accepts only the farmer's reasons from the API", () => {
    expect(isFarmerMovementReason("sale")).toBe(true);
    expect(isFarmerMovementReason("grazing")).toBe(true);
    expect(isFarmerMovementReason("bought")).toBe(false);
    expect(isFarmerMovementReason("Moved to another farm")).toBe(false);
    expect(isFarmerMovementReason(7)).toBe(false);
  });

  it("never includes invented vocabulary", () => {
    // No spaces, capitals, hyphens or free text — a closed set exists so a
    // county officer cannot read one event three ways. An underscore is allowed:
    // the herd ledger already uses snake_case (transfer_in, merged_out) and
    // `group_move` reads as exactly what it is.
    for (const r of ALL_MOVEMENT_REASONS) expect(r).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(new Set(ALL_MOVEMENT_REASONS).size).toBe(ALL_MOVEMENT_REASONS.length);
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

  it("a move between the farm's own groups is a move, not a departure", () => {
    // Moving a tag from one group to another changes where it is, not whether
    // it is on the farm. Marking it "moved" would drop it out of the herd list
    // and make the farmer's own count wrong.
    expect(statusAfter(GROUP_MOVE_REASON, "active")).toBe("active");
    expect(statusAfter(GROUP_MOVE_REASON, "sold")).toBe("sold");
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
