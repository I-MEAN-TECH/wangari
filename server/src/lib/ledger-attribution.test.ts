import { describe, it, expect } from "vitest";

/**
 * Transaction attribution — which enterprise did this money belong to?
 *
 * This exists to delete a substring matcher. `profitability.ts` used to decide
 * who a transaction belonged to by checking whether the flock's *name* appeared
 * inside `category` or `description`:
 *
 *     for (const [name, id] of flockByName) if (t.includes(name)) return ...
 *
 * A flock called "Layers" therefore claimed every row whose description
 * mentioned layers, and a flock called "Farm" claimed everything. The farmer
 * saw a profit figure per enterprise that was partly fiction — and he is meant
 * to take that figure to a SACCO.
 *
 * The rules pinned here:
 *   1. an explicit reference wins, always
 *   2. a reference to something deleted degrades to "general", never crashes
 *   3. inference is allowed ONLY when it is unambiguous — one candidate, not two
 *   4. the function never throws and never returns undefined
 */

import {
  attributeTransaction,
  enterpriseKindForFlock,
  type KnownEnterprises,
} from "./ledger-attribution.js";

const farm = (over: Partial<KnownEnterprises> = {}): KnownEnterprises => ({
  flocks: [
    { id: 1, category: "poultry", type: "layers" },
    { id: 2, category: "dairy", type: "cattle" },
  ],
  crops: [{ id: 10 }, { id: 11 }],
  ...over,
});

describe("rule 1 — an explicit reference wins", () => {
  it("uses flockId when it names a real flock", () => {
    const r = attributeTransaction({ type: "expense", flockId: 1 }, farm());
    expect(r).toEqual({ kind: "flock", id: 1 });
  });

  it("uses cropId when it names a real crop", () => {
    const r = attributeTransaction({ type: "expense", cropId: 11 }, farm());
    expect(r).toEqual({ kind: "crop", id: 11 });
  });

  it("prefers the flock when a row somehow carries both", () => {
    const r = attributeTransaction({ type: "expense", flockId: 2, cropId: 11 }, farm());
    expect(r).toEqual({ kind: "flock", id: 2 });
  });
});

describe("rule 2 — a reference to something deleted degrades, never crashes", () => {
  it("falls back to general when the flock no longer exists", () => {
    const r = attributeTransaction({ type: "expense", flockId: 999 }, farm());
    expect(r).toEqual({ kind: "general", id: null });
  });

  it("does not throw on a null or undefined flockId", () => {
    expect(() => attributeTransaction({ type: "expense", flockId: null }, farm())).not.toThrow();
    expect(attributeTransaction({ type: "expense", flockId: null }, farm())).toEqual({ kind: "general", id: null });
    expect(attributeTransaction({ type: "expense" }, farm())).toEqual({ kind: "general", id: null });
  });
});

describe("rule 3 — inference only when unambiguous", () => {
  it("attributes 'milk' income to the one dairy flock", () => {
    const r = attributeTransaction({ type: "income", category: "milk" }, farm());
    expect(r).toEqual({ kind: "flock", id: 2 });
  });

  it("attributes 'eggs' income to the one poultry flock", () => {
    const r = attributeTransaction({ type: "income", category: "eggs" }, farm());
    expect(r).toEqual({ kind: "flock", id: 1 });
  });

  it("REFUSES to guess when two flocks share the enterprise kind", () => {
    const twoDairy = farm({
      flocks: [
        { id: 1, category: "dairy", type: "cattle" },
        { id: 2, category: "dairy", type: "cattle" },
      ],
    });
    const r = attributeTransaction({ type: "income", category: "milk" }, twoDairy);
    expect(r).toEqual({ kind: "general", id: null });
  });

  it("REFUSES to guess when two crops exist and the income is 'crops'", () => {
    const r = attributeTransaction({ type: "income", category: "crops" }, farm());
    expect(r).toEqual({ kind: "general", id: null });
  });

  it("attributes 'crops' income when there is exactly one crop", () => {
    const oneCrop = farm({ crops: [{ id: 10 }] });
    const r = attributeTransaction({ type: "income", category: "crops" }, oneCrop);
    expect(r).toEqual({ kind: "crop", id: 10 });
  });

  it("never infers an enterprise for an expense — only income carries a kind", () => {
    const r = attributeTransaction({ type: "expense", category: "animal_feed" }, farm());
    expect(r).toEqual({ kind: "general", id: null });
  });

  it("goes to general when no flock matches the income kind at all", () => {
    const r = attributeTransaction({ type: "income", category: "fish" }, farm());
    expect(r).toEqual({ kind: "general", id: null });
  });
});

describe("rule 4 — total function", () => {
  it("returns a defined result for an empty farm and an empty transaction", () => {
    const r = attributeTransaction({}, { flocks: [], crops: [] });
    expect(r).toEqual({ kind: "general", id: null });
  });
});

describe("enterpriseKindForFlock — one vocabulary shared with income categories", () => {
  it("reads a poultry flock as poultry", () => {
    expect(enterpriseKindForFlock({ id: 1, category: "poultry", type: "layers" })).toBe("poultry");
  });
  it("reads a dairy flock as dairy", () => {
    expect(enterpriseKindForFlock({ id: 2, category: "dairy", type: "cattle" })).toBe("dairy");
  });
  it("falls back to the type when category is absent", () => {
    expect(enterpriseKindForFlock({ id: 3, category: null, type: "broilers" })).toBe("poultry");
  });

  // The production shape: the flock form only ever writes poultry/livestock/
  // aquaculture/other as `category`. Reading that bucket first made a dairy
  // herd "livestock", and milk income (kind "dairy") could never find it —
  // farm 7's milk sale sat in "general" on the live scoreboard until the
  // probe caught it.
  it("prefers the species in type over the generic category bucket", () => {
    expect(enterpriseKindForFlock({ id: 5, category: "livestock", type: "cattle_dairy" })).toBe("dairy");
    expect(enterpriseKindForFlock({ id: 6, category: "livestock", type: "goats" })).toBe("livestock");
  });

  it("still refuses to split 'cattle' into beef or dairy", () => {
    expect(enterpriseKindForFlock({ id: 7, category: "livestock", type: "cattle" })).toBe("livestock");
    expect(enterpriseKindForFlock({ id: 8, category: null, type: "cattle" })).toBe("general");
  });
  it("is general for a flock it cannot classify — never undefined", () => {
    expect(enterpriseKindForFlock({ id: 4, category: null, type: null })).toBe("general");
  });
});
