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
const trial = { ok: true, allowed: true, reason: "trial" as const };
const none = { ok: true, allowed: false, reason: "no-access" as const };

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
    expect(moduleAllowed(starter, ["livestock"], "flocks")).toBe(true);
    expect(moduleAllowed(starter, ["livestock"], "invoices")).toBe(false);
    expect(moduleAllowed(starter, ["sales"], "invoices")).toBe(true);
    expect(moduleAllowed(starter, ["sales"], "flocks")).toBe(false);
  });

  it("leaves the other tiers exactly as they were", () => {
    expect(moduleAllowed(growth, [], "flocks")).toBe(true);
    expect(moduleAllowed(growth, ["livestock"], "workers")).toBe(true);
    expect(moduleAllowed(trial, [], "workers")).toBe(true);
    expect(moduleAllowed(none, [], "dashboard")).toBe(false);
    expect(moduleAllowed(none, [], "flocks")).toBe(false);
  });
});

describe("the sidebar padlocks must agree with the 403s", () => {
  // trial.ts computes its own moduleAccess map for the sidebar. Two copies of
  // the plan rules drift apart and the farmer finds out: padlocks shown for
  // screens that open fine, or screens 403ing with no padlock to explain it.
  it("uses the same empty-hubs rule", () => {
    const src = read("routes/trial.ts");
    expect(src).toMatch(/selectedHubs\.length === 0 \? hub !== "team" : selectedHubs\.includes\(hub\)/);
  });

  it("borrows its hub table from the gate instead of copying it", () => {
    // trial.ts used to hand-roll a second table that had already fallen behind:
    // breeding, transactions, deliveries, documents and profitability existed
    // in the gate but not here, so those screens showed no padlock and then
    // answered 403 with nothing on screen to explain it.
    expect(read("routes/trial.ts")).toContain(
      'import { MODULE_HUB_MAP as GATED_HUB_MAP } from "../middleware/plan-gate.js"',
    );
    expect(read("routes/trial.ts")).toMatch(/\.\.\.GATED_HUB_MAP/);
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
    expect(declared.length).toBeGreaterThan(25);
  });

  it("has a module for every declared tool", () => {
    // A tool with no entry is an UNGATED tool: the agent would write a record
    // the farmer's plan will never let them open.
    for (const tool of declared) {
      expect(mapped.has(tool), `${tool} is missing from TOOL_MODULE`).toBe(true);
    }
  });

  it("gates every mutating tool", () => {
    expect(gated.has("create_flock")).toBe(true);
    expect(gated.has("create_invoice")).toBe(true);
    expect(gated.has("create_transaction")).toBe(true);
    expect(gated.has("create_sale")).toBe(true);
    expect(gated.has("create_worker")).toBe(true);
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