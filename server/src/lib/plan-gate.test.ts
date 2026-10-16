import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// plan-gate.ts talks to the database at import time through these two modules.
// The rule under test is pure, so the plumbing is stubbed out rather than
// stood up against a real Postgres.
vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("../middleware/auth.js", () => ({ JWT_SECRET: "test-secret" }));

import { moduleAllowed } from "../middleware/plan-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "..");
const read = (rel: string) => readFileSync(join(serverRoot, rel), "utf8");

const starter = { ok: true, allowed: false, reason: "subscription" as const, planId: "starter_monthly" };
const growth = { ok: true, allowed: false, reason: "subscription" as const, planId: "growth_monthly" };
// Free Core is the new perpetual tier: no subscription, no trial window.
// The previous `reason: "trial"` test fixture is gone — the legacy 14-day
// trial is no longer granted to new signups.
const freeCore = { ok: true, allowed: false, reason: "free_core" as const };
const unauthorized = { ok: false, allowed: false, reason: "unauthorized" as const };

describe("plan gate: an unfinished hub choice is not a lockout", () => {
  // The bug this file exists for: a Starter account whose `selectedHubs` was
  // still empty got 403 on every real farming module. The AI had no gate at
  // all, so it wrote flocks and the farmer was told it had — into a screen
  // that answered "not included in your current plan". Data written, invisible.
  it("unlocks farming modules when selectedHubs is empty", () => {
    for (const module of ["flocks", "production", "vaccinations", "crops", "transactions", "sales", "customers", "invoices", "deliveries", "documents"]) {
      expect(moduleAllowed(starter, [], module), `${module} must open`).toBe(true);
    }
  });

  it("still keeps the Growth+ only team module closed", () => {
    expect(moduleAllowed(starter, [], "workers")).toBe(false);
    expect(moduleAllowed(starter, [], "attendance")).toBe(false);
  });

  it("keeps _always modules open regardless of hubs", () => {
    expect(moduleAllowed(starter, ["livestock"], "dashboard")).toBe(true);
    expect(moduleAllowed(starter, ["livestock"], "finances")).toBe(true);
    expect(moduleAllowed(starter, ["livestock"], "inventory")).toBe(true);
  });

  it("honours a real hub choice when one was made", () => {
    // selectedHubs is now an informational hint surfaced in the response
    // payload (so the dashboard can show a per-hub setup card). It is NOT
    // an access-control signal: a Starter farmer with `["sales"]` in
    // selectedHubs can still open flocks, because the plan already covers
    // mixed farming. The padlock is the plan tier, not the hub.
    expect(moduleAllowed(starter, ["livestock"], "flocks")).toBe(true);
    expect(moduleAllowed(starter, ["livestock"], "invoices")).toBe(true);
    expect(moduleAllowed(starter, ["sales"], "invoices")).toBe(true);
    expect(moduleAllowed(starter, ["sales"], "flocks")).toBe(true);
  });

  it("leaves the other tiers exactly as they were", () => {
    expect(moduleAllowed(growth, [], "flocks")).toBe(true);
    expect(moduleAllowed(growth, ["livestock"], "workers")).toBe(true);
    // Free Core: only _always modules stay open, everything else locked.
    // This is the new perpetual floor — verified against the 8 seeded plans.
    expect(moduleAllowed(freeCore, [], "dashboard")).toBe(true);
    expect(moduleAllowed(freeCore, [], "finances")).toBe(true);
    expect(moduleAllowed(freeCore, [], "inventory")).toBe(true);
    expect(moduleAllowed(freeCore, [], "deliveries")).toBe(true);
    expect(moduleAllowed(freeCore, [], "transactions")).toBe(true);
    expect(moduleAllowed(freeCore, [], "flocks")).toBe(false);
    expect(moduleAllowed(freeCore, [], "production")).toBe(false);
    expect(moduleAllowed(freeCore, [], "sales")).toBe(false);
    expect(moduleAllowed(freeCore, [], "workers")).toBe(false);
    expect(moduleAllowed(freeCore, [], "reports")).toBe(false);
    // Unauthorized identity: nothing is open.
    expect(moduleAllowed(unauthorized, [], "dashboard")).toBe(false);
    expect(moduleAllowed(unauthorized, [], "flocks")).toBe(false);
  });

  it("recognises every Starter and Growth variant from the plans table", () => {
    // The gate's regexes were the source of two past bugs (a Vercel webhook
    // hard-coding 4 plan ids and a tier drift in the Vercel status mirror).
    // Re-assert the full plan catalogue here so a future plan rename is
    // caught by the test, not by a 403 in production.
    const starterIds = [
      "starter_monthly",
      "starter_annual",
      "starter_season",
    ];
    const growthIds = [
      "growth_monthly",
      "growth_annual",
      "growth_season",
      "growth_60day",
      "growth_120day",
    ];
    for (const id of starterIds) {
      const ctx = { ok: true, allowed: false, reason: "subscription" as const, planId: id };
      expect(moduleAllowed(ctx, ["livestock"], "flocks"), `${id} should open flocks`).toBe(true);
      expect(moduleAllowed(ctx, ["livestock"], "workers"), `${id} should keep team locked`).toBe(false);
    }
    for (const id of growthIds) {
      const ctx = { ok: true, allowed: false, reason: "subscription" as const, planId: id };
      expect(moduleAllowed(ctx, ["livestock"], "flocks"), `${id} should open flocks`).toBe(true);
      expect(moduleAllowed(ctx, ["livestock"], "workers"), `${id} should open team`).toBe(true);
    }
  });
});

describe("the sidebar padlocks must agree with the 403s", () => {
  // trial.ts computes its own moduleAccess map for the sidebar. Two copies of
  // the plan rules drift apart and the farmer finds out: padlocks shown for
  // screens that open fine, or screens 403ing with no padlock to explain it.
  it("uses the same single-source hub table as the 403s", () => {
    // Contract: trial.ts imports MODULE_HUB_MAP from plan-gate (one map,
    // never hand-rolled). selectedHubs is no longer a padlock signal — the
    // padlock is purely plan tier (Starter vs Growth vs Free Core).
    const trialSrc = read("routes/trial.ts");
    expect(trialSrc).toContain(
      'import { MODULE_HUB_MAP as GATED_HUB_MAP } from "../middleware/plan-gate.js"',
    );
    expect(trialSrc).toMatch(/\.\.\.GATED_HUB_MAP/);
  });

  it("uses the same hub→team/Starter/Growth rule for the padlocks", () => {
    // The padlock table inside trial.ts must use the Starter / Growth-or-Enterprise
    // distinction the 403s use, not invent a third copy. Specifically: workers,
    // attendance, coop, loans, reports stay locked for Starter.
    const trialSrc = read("routes/trial.ts");
    expect(trialSrc).toMatch(/workers.*attendance.*coop.*loans.*reports/s);
    expect(trialSrc).toMatch(/isGrowthOrEnterprise/);
  });
});

describe("every AI tool is gated, and writes are gated hardest", () => {
  const src = read("routes/ai.ts");

  const declared = [...src.matchAll(/function:\s*\{\s*name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const toolModuleBlock = src.slice(src.indexOf("const TOOL_MODULE"), src.indexOf("const WRITE_TOOLS"));
  const mapped = new Set(
    [...toolModuleBlock.matchAll(/([a-z_]+):\s*"[a-z_]+"/g)].map((m) => m[1]),
  );
  const gated = new Set(
    (src.match(/const WRITE_TOOLS[\s\S]*?new Set\(\[([\s\S]*?)\]\)/)?.[1] || "")
      .split(",")
      .map((s) => s.trim().replace(/["']/g, ""))
      .filter(Boolean),
  );

  it("sees the tool list it is meant to check", () => {
    // 24, down from 33: ten thin create_* tools became ONE start_intake.
    expect(declared.length).toBeGreaterThanOrEqual(24);
  });

  it("has a module for every declared tool", () => {
    // A tool with no entry is an UNGATED tool: the agent would write a record
    // the farmer's plan will never let them open.
    //
    // start_intake is the one exception, and it earns it: its module depends
    // on the ENTITY the farmer asked for, so one static entry would be wrong
    // for ten of the eleven. It resolves its own gate instead — asserted below.
    for (const tool of declared) {
      if (tool === "start_intake") continue;
      expect(mapped.has(tool), `${tool} is missing from TOOL_MODULE`).toBe(true);
    }
  });

  it("gates the intake on the module of the record, not the tool", () => {
    // A single tool covering eleven entities is the one place this could go
    // wrong: gate it on "flocks" and a Starter farmer is refused for a crop
    // field they can open, or worse, allowed to write one they cannot.
    expect(gated.has("start_intake")).toBe(true);
    expect(src).toContain('toolName === "start_intake" && isIntakeEntity(args.entity)');
    expect(src).toContain("intakeModule(args.entity)");
    // And it comes from the registry, which is where the screens' own modules
    // are declared.
    expect(read("lib/intake-registry.ts")).toContain("module: \"crops\"");
  });

  it("gates every mutating tool", () => {
    // Writes are start_intake and the deletes. There is nothing else left to
    // gate, because there is nothing else left that writes.
    expect(gated.has("start_intake")).toBe(true);
    for (const t of [
      "delete_flock", "delete_transaction", "delete_sale",
      "delete_customer", "delete_inventory_item", "delete_worker",
    ]) {
      expect(gated.has(t), `${t} is a write`).toBe(true);
    }
  });

  it("cannot write a record without the farmer filling a form", () => {
    // The thin writes are gone on purpose: `create_flock` took a name and a
    // number and left twenty-six columns blank without asking. If any of them
    // comes back, the assistant can again claim a record is saved when the
    // farmer was never asked for it.
    for (const tool of [
      "create_flock", "create_crop", "create_worker", "create_customer",
      "create_inventory_item", "create_transaction", "create_sale",
      "create_invoice", "record_production", "create_vaccination",
      "record_attendance", "start_flock_intake",
    ]) {
      expect(declared, `${tool} must not be offered`).not.toContain(tool);
    }
    expect(declared).toContain("start_intake");
  });

  it("never gates a read", () => {
    // Refusing to answer "what did I sell?" costs nothing and blinds the
    // farmer; refusing to write is the only case worth blocking.
    for (const tool of declared) {
      if (tool.startsWith("list_") || tool.startsWith("get_")) {
        expect(gated.has(tool), `${tool} is a read and must not be gated`).toBe(false);
      }
    }
  });

  it("refuses before the tool body runs, not after", () => {
    // Placing the check after the switch would write the row first.
    const gate = src.indexOf("WRITE_TOOLS.has(toolName)");
    const body = src.indexOf('switch (toolName)');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body);
  });

  it("tells the farmer what happened in their own words", () => {
    expect(src).toContain("I have not saved it");
  });
});