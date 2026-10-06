import { describe, it, expect } from "vitest";

/**
 * The ledger taxonomy.
 *
 * `Transaction.category` is free text, and the live table already proves why
 * that is a problem: 17 rows use **two conventions for the same thing**
 * (`animal_feed` and `Bird Purchase`) and the one column conflates **costs**
 * (`animal_feed`, `veterinary`, `labor`) with **revenue streams**
 * (`meat`, `milk`, `eggs`, `crops`, `livestock`).
 *
 * Nothing downstream can compute a real cost-per-egg while that is true. So
 * this module makes the one decision the data never made, in a pure function
 * that can be tested without a database — because a wrong bucket produces a
 * wrong profit figure the farmer will take to a SACCO.
 *
 * The rules pinned here:
 *   1. the classifier NEVER returns undefined and NEVER throws
 *   2. case and whitespace never change the answer
 *   3. an unrecognised category lands in a defined bucket, not a hole
 */

import {
  classifyExpense,
  classifyIncome,
  normaliseCategory,
  KG_PER_EGG,
  COST_BUCKET_LABELS,
  ENTERPRISE_LABELS,
} from "./ledger-taxonomy.js";

describe("normaliseCategory", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(normaliseCategory("  Animal Feed ")).toBe("animal_feed");
    expect(normaliseCategory("Animal Feed")).toBe("animal_feed");
    expect(normaliseCategory("ANIMAL_FEED")).toBe("animal_feed");
    expect(normaliseCategory("Bird Purchase")).toBe("bird_purchase");
  });

  it("collapses repeated and mixed separators", () => {
    expect(normaliseCategory("animal---feed")).toBe("animal_feed");
    expect(normaliseCategory("animal  feed")).toBe("animal_feed");
    expect(normaliseCategory("Animal-Feed")).toBe("animal_feed");
  });

  it("returns an empty string for null/undefined, never undefined", () => {
    expect(normaliseCategory(null)).toBe("");
    expect(normaliseCategory(undefined)).toBe("");
    expect(normaliseCategory("   ")).toBe("");
  });
});

describe("classifyExpense — the categories that are actually in the live table", () => {
  it("maps feed", () => {
    expect(classifyExpense("animal_feed")).toBe("feed");
    expect(classifyExpense("Animal Feed")).toBe("feed");
    expect(classifyExpense("feed")).toBe("feed");
  });

  it("treats a bird purchase as buying stock, not as feed", () => {
    expect(classifyExpense("Bird Purchase")).toBe("stock");
  });

  it("maps the other live cost categories", () => {
    expect(classifyExpense("veterinary")).toBe("veterinary");
    expect(classifyExpense("labor")).toBe("labour");
    expect(classifyExpense("labour")).toBe("labour");
  });

  it("maps stock and input purchases that are not in the live table yet", () => {
    expect(classifyExpense("seeds")).toBe("seed");
    expect(classifyExpense("fertilizer")).toBe("fertiliser");
    expect(classifyExpense("fertiliser")).toBe("fertiliser");
    expect(classifyExpense("transport")).toBe("transport");
    expect(classifyExpense("electricity")).toBe("utilities");
  });

  it("returns 'other' for anything unrecognised, never undefined", () => {
    expect(classifyExpense("kitu kingine")).toBe("other");
    expect(classifyExpense(null)).toBe("other");
    expect(classifyExpense("")).toBe("other");
    expect(classifyExpense("   ")).toBe("other");
  });
});

describe("classifyIncome — the live income categories are already enterprise names", () => {
  it("maps the five live income categories", () => {
    expect(classifyIncome("meat")).toBe("livestock");
    expect(classifyIncome("livestock")).toBe("livestock");
    expect(classifyIncome("milk")).toBe("dairy");
    expect(classifyIncome("eggs")).toBe("poultry");
    expect(classifyIncome("crops")).toBe("crops");
  });

  it("keeps meat and milk apart — they are different enterprises", () => {
    expect(classifyIncome("meat")).not.toBe(classifyIncome("milk"));
  });

  it("falls back to general for anything unrecognised, never undefined", () => {
    expect(classifyIncome("sijui")).toBe("general");
    expect(classifyIncome(null)).toBe("general");
    expect(classifyIncome("")).toBe("general");
  });
});

describe("the physical constant behind cost-per-egg", () => {
  it("exports KG_PER_EGG as a named, sane value instead of a bare literal", () => {
    expect(KG_PER_EGG).toBeGreaterThan(0.03);
    expect(KG_PER_EGG).toBeLessThan(0.09);
  });
});

describe("labels are Swahili-first (module-plan R5)", () => {
  it("labels every cost bucket", () => {
    for (const bucket of [
      "feed", "veterinary", "labour", "stock", "seed",
      "fertiliser", "equipment", "transport", "utilities", "other",
    ] as const) {
      expect(COST_BUCKET_LABELS[bucket]).toBeTruthy();
    }
  });

  it("labels every enterprise kind", () => {
    for (const kind of [
      "poultry", "dairy", "livestock", "crops",
      "aquaculture", "apiculture", "general",
    ] as const) {
      expect(ENTERPRISE_LABELS[kind]).toBeTruthy();
    }
  });
});
