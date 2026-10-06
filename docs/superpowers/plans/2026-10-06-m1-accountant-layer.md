# M1 — The Accountant Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "no accountant needed" a true statement about live data — a farmer sees real cost-per-unit and profit-per-enterprise in KES, computed from his own rows.

**Architecture:** Two phases. (1) A **pure, DB-free taxonomy module** turns the free-text `Transaction.category` into a canonical cost bucket (expenses) or an enterprise kind (income). Because `type` is already clean (`expense`/`income`), the taxonomy is the only missing decision — and it is a pure function, so it is fully testable without a database. (2) **Explicit enterprise attribution** columns on `Transaction` replace `profitability.ts`'s fuzzy name-matching. The taxonomy backfills the 17 existing rows; new rows get an explicit reference.

**Tech Stack:** TypeScript, Express, Prisma, PostgreSQL, Vitest.

**Spec:** [docs/PHASED-PRODUCT-PLAN.md](../../PHASED-PRODUCT-PLAN.md) Part 5, **M1** — and [docs/module-plan.md](../../module-plan.md) §0 (governing rules).

## Status (6 Oct 2026)

| Task | State | Evidence |
|---|---|---|
| 1. Taxonomy module | **DONE** | `ledger-taxonomy.ts` + 14 tests green. All 9 live categories map, none fall to catch-all. |
| 2. Schema + migration | **DONE, LIVE IN PRODUCTION** | `migrate diff` matches the hand-written migration exactly; applied to a throwaway DB first (27-migration chain, 3 runs, all exit 0); then deployed — `deploy/update.sh --migrate` exit 0, migration recorded, 4 columns nullable, 4 indexes, both `SET NULL` FKs, 17 transactions intact, `/health` 200. |
| 3. Backfill script | **DONE AND RUN** | Dry run first (11 expense / 6 income / 9 categories, **none** in the catch-all), then `--apply`: 17 rows updated, 0 unclassified, and a re-run needs 0 — idempotent. |
| 4. Rewire `profitability.ts` | **DONE, FAILED THEN FIXED** | Fuzzy matcher deleted; `attributeTransaction` + 17 tests; `0.06` → `KG_PER_EGG`; the `incomeTx.length === 0` heuristic removed. The probe then found the feed split **counting the bill twice** (`totalCosts` 60,000 for a 30,000 spend) — fixed by extracting `lib/ledger-feed.ts` (+10 tests). |
| 5. End-to-end | **DONE, VERIFIED LIVE** | `tsc --noEmit` clean; **691/691** server tests. `probe-m1-profitability.mjs` returns 200 with finite numbers and a cost breakdown, and conserves totals on **all 4 farms with transactions**. |

**The lesson worth keeping:** the unit tests were green on the doubled-cost bug. Only calling the live endpoint on the real database found it. That is why `probe-m1-profitability.mjs` exists and why it checks conservation rather than just shape.

---

## Global Constraints

- **EXTEND, NEVER REBUILD** (module-plan §0.1). No new module, no new nav item.
- **THE FARMER CANNOT READ** (module-plan §0.1). Nothing in M1 may require typing a category. The taxonomy runs **server-side**; the farmer taps an icon. R1–R10 apply to any screen M1 touches.
- **Every model that belongs to a farm has `farmId`; every query filters by it** (database-design skill).
- **Use `Decimal` for money, never `Float`** (database-design skill).
- **Additive migration only.** No destructive change to an existing table.
- Existing route convention: `authMiddleware` + `requireOwner`, `try/catch`, `res.status(500).json({ error: "..." })` (nodejs-backend-patterns skill).

## Review Focus

These are the failure modes M1 introduces that no single task's tests fully cover:

1. **A category the taxonomy has never seen.** Live data already has two conventions (`animal_feed` and `Bird Purchase`). The classifier must return a defined `unknown` bucket, never `undefined`, never throw.
2. **Amounts that are zero or negative.** A cost-per-egg divides by output; output may be zero. Must produce `null`, never `Infinity`/`NaN` in the API.
3. **A transaction dated in the future or the far past.** Period filters must not silently drop or double-count it.
4. **Mixed-case and whitespace variants** of the same category (`"Animal Feed"`, `" animal_feed "`) must classify identically.
5. **Enterprise attribution pointing at a deleted flock/crop.** The reference is optional and must degrade to "general", not 500.

---

### Task 1: The taxonomy module (pure, DB-free)

**Files:**
- Create: `server/src/lib/ledger-taxonomy.ts`
- Test: `server/src/lib/ledger-taxonomy.test.ts`

**Interfaces:**
- Produces:
  - `type CostBucket = "feed" | "veterinary" | "labour" | "stock" | "seed" | "fertiliser" | "equipment" | "transport" | "utilities" | "other"`
  - `type EnterpriseKind = "poultry" | "dairy" | "livestock" | "crops" | "aquaculture" | "apiculture" | "general"`
  - `classifyExpense(category: string | null | undefined): CostBucket`
  - `classifyIncome(category: string | null | undefined): EnterpriseKind`
  - `normaliseCategory(raw: string | null | undefined): string` — lowercase, trim, collapse separators
  - `COST_BUCKET_LABELS: Record<CostBucket, string>`, `ENTERPRISE_LABELS: Record<EnterpriseKind, string>` (Swahili-first, per R5)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { classifyExpense, classifyIncome, normaliseCategory } from "./ledger-taxonomy.js";

describe("normaliseCategory", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(normaliseCategory("  Animal Feed ")).toBe("animal_feed");
    expect(normaliseCategory("Animal Feed")).toBe("animal_feed");
    expect(normaliseCategory("ANIMAL_FEED")).toBe("animal_feed");
    expect(normaliseCategory("Bird Purchase")).toBe("bird_purchase");
  });
  it("returns an empty string for null/undefined, never undefined", () => {
    expect(normaliseCategory(null)).toBe("");
    expect(normaliseCategory(undefined)).toBe("");
  });
});

describe("classifyExpense — the categories that are actually in the live table", () => {
  it("maps feed costs, including the 'Bird Purchase' convention", () => {
    expect(classifyExpense("animal_feed")).toBe("feed");
    expect(classifyExpense("Bird Purchase")).toBe("stock");
  });
  it("maps the other live cost categories", () => {
    expect(classifyExpense("veterinary")).toBe("veterinary");
    expect(classifyExpense("labor")).toBe("labour");
  });
  it("returns 'other' for anything unrecognised, never undefined", () => {
    expect(classifyExpense("kitu kingine")).toBe("other");
    expect(classifyExpense(null)).toBe("other");
    expect(classifyExpense("")).toBe("other");
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
  it("falls back to general for anything unrecognised", () => {
    expect(classifyIncome("sijui")).toBe("general");
    expect(classifyIncome(null)).toBe("general");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/ledger-taxonomy.test.ts`
Expected: FAIL — cannot resolve `./ledger-taxonomy.js`

- [ ] **Step 3: Implement `ledger-taxonomy.ts`**

Export the types and four functions above. Lookups are `Record<string, Bucket>` keyed on `normaliseCategory` output; both classifiers do `map[normaliseCategory(x)] ?? fallback`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/ledger-taxonomy.test.ts`
Expected: PASS, all cases

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ledger-taxonomy.ts server/src/lib/ledger-taxonomy.test.ts
git commit -m "feat(ledger): canonical taxonomy for the free-text transaction category"
```

---

### Task 2: Enterprise attribution + farm size on the schema

**Files:**
- Modify: `server/prisma/schema.prisma` — `Transaction` (~line 634), `Farm` (~line 200)
- Create: `server/prisma/migrations/<ts>_m1_ledger_taxonomy/migration.sql`

**Interfaces:**
- Produces: `Transaction.flockId Int?`, `Transaction.cropId Int?`, `Transaction.costBucket String?`, `Transaction.enterpriseKind String?`, `Farm.areaValue Decimal?`, `Farm.areaUnit String?`
- Consumes: Task 1's `CostBucket` / `EnterpriseKind` as the stored vocabulary.

- [ ] **Step 1: Add the columns** (additive only). Both new relations get `@@index([farmId, flockId])` and `@@index([farmId, cropId])`.
- [ ] **Step 2: Write the migration SQL** as plain `ALTER TABLE ... ADD COLUMN` + `CREATE INDEX`. No drops, no rewrites.
- [ ] **Step 3: Apply and regenerate** — `npx prisma migrate deploy && npx prisma generate` (project runbook; migrate via `deploy/update.sh --migrate` in production).
- [ ] **Step 4: Verify** — `npx prisma validate` and `npx tsc --noEmit`; both clean.
- [ ] **Step 5: Commit.**

---

### Task 3: Backfill the existing rows

**Files:**
- Create: `server/deploy/backfill-ledger-taxonomy.mjs`

**Interfaces:**
- Consumes: Task 1's classifiers, Task 2's columns.
- Produces: `costBucket`/`enterpriseKind` populated for every existing `Transaction`.

- [ ] **Step 1:** Dry-run mode (default) prints the cross-tab of `category → bucket` and the count it *would* update. No writes.
- [ ] **Step 2:** `--apply` writes. Idempotent: only rows with a null bucket.
- [ ] **Step 3:** Run dry-run against production and confirm every one of the 9 live categories gets a bucket.
- [ ] **Step 4: Commit.**

---

### Task 4: Rewire `profitability.ts`

**Files:**
- Modify: `server/src/routes/profitability.ts` (130 lines, one route)

**Interfaces:**
- Consumes: `Transaction.costBucket`, `Transaction.enterpriseKind`, `Transaction.flockId`, `Transaction.cropId`.

- [ ] **Step 1: Write the failing test** — a pure helper `attributeTransaction()` extracted to `server/src/lib/ledger-attribution.ts`, tested without a DB: explicit `flockId`/`cropId` wins; otherwise `enterpriseKind`; otherwise `general`.
- [ ] **Step 2: Run it, watch it fail.**
- [ ] **Step 3:** Replace the `flockByName`/`matchEnterprise` fuzzy matcher (lines ~40–65) with the helper.
- [ ] **Step 4: Remove the hardcoded `0.06` kg-per-egg** (line ~92). Egg output uses a named, exported constant `KG_PER_EGG` from the taxonomy module, documented as an assumption with its source, and overridable per breed later.
- [ ] **Step 5:** Replace the `incomeTx.length === 0` feed-cost heuristic (line ~81) with `DailyProduction.feedUsed` × `Inventory.unitCost` where available, falling back to the feed-bucket expense total.
- [ ] **Step 6: Run the route's tests + full suite; commit.**

---

### Task 5: Prove it end-to-end

- [ ] **Step 1:** `cd server && npx tsc --noEmit` — clean.
- [ ] **Step 2:** `cd server && npx vitest run` — **full suite**, not just the new file. Any failure, including one not caused by M1, is reported by name.
- [ ] **Step 3:** `cd wangari-next && npx tsc --noEmit` — clean.
- [ ] **Step 4:** Deploy and call `GET /api/profitability` with a real owner token; confirm the response carries per-enterprise profit and `costPerUnit` values that are finite numbers or `null`, never `NaN`.
