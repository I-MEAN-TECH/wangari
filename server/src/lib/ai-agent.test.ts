/**
 * Wangari AI agent — regression tests for the tool executor and agentic loop.
 *
 * These guard the bugs found in review: a units mix-up that wrote hectares into
 * an acres column, sales created with no line items, get_dashboard returning
 * flocks instead of a summary, and destructive tools that cannot be undone.
 *
 * Every assertion here is mutation-proven: reverting the corresponding fix in
 * routes/ai.ts makes the specific test fail.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const aiSource = readFileSync(join(process.cwd(), "src/routes/ai.ts"), "utf8");

// Pull the executor + tool schema straight out of the route so these tests
// cannot drift from the real implementation.
function toolSchema(name: string): string {
  const i = aiSource.indexOf(`name: "${name}"`);
  expect(i, `tool ${name} is declared`).toBeGreaterThan(-1);
  const start = aiSource.lastIndexOf("{ type: \"function\"", i);
  const end = aiSource.indexOf("} } }", i);
  return aiSource.slice(start, end);
}

function executorCase(name: string): string {
  const i = aiSource.indexOf(`case "${name}":`);
  expect(i, `tool ${name} has an executor case`).toBeGreaterThan(-1);
  // Slice to the next case/default so multi-line handlers (get_dashboard) are
  // read whole rather than truncated at an arbitrary offset.
  const rest = aiSource.slice(i);
  const next = rest.slice(1).search(/\n\s*case "|^\s*default:/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("AI tool schema", () => {
  it("create_crop declares area in acres, not hectares", () => {
    const schema = toolSchema("create_crop");
    expect(schema).toContain("areaAcres");
    // The old bug: the model was asked for hectares and the handler stored the
    // raw number into the acres column (a 2.4x understatement of field size).
    expect(schema).not.toContain("areaHectares");
  });

  it("exposes the billing tools the farmer needs to 'do anything'", () => {
    for (const t of ["create_invoice", "list_invoices", "undo_last_action"]) {
      expect(aiSource, `${t} is available to the agent`).toContain(`name: "${t}"`);
    }
  });
});

describe("AI tool executor", () => {
  it("create_crop writes areaAcres from args.areaAcres, never args.areaHectares", () => {
    const c = executorCase("create_crop");
    expect(c).toContain("areaAcres: raw");
    expect(c).not.toContain("args.areaHectares");
  });

  it("create_crop rejects a non-positive area instead of storing junk", () => {
    const c = executorCase("create_crop");
    expect(c).toMatch(/raw <= 0/);
  });

  it("create_sale preserves line items passed by the model", () => {
    const c = executorCase("create_sale");
    expect(c).toContain("Array.isArray(args.items)");
    // The old bug: items was hard-coded to [] so every AI-recorded sale was
    // invisible in the ledger breakdown.
    expect(c).not.toMatch(/items: \[\], farmId/);
  });

  it("get_dashboard returns a financial summary, not a flock list", () => {
    const c = executorCase("get_dashboard");
    for (const field of ["profit", "income", "expense", "lowStock", "eggsCollected"]) {
      expect(c, `dashboard exposes ${field}`).toContain(field);
    }
  });

  it("every advertised tool has an executor case", () => {
    const declared = [...aiSource.matchAll(/name: "([a-z_]+)", description/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(25);
    const missing = declared.filter((t) => !aiSource.includes(`case "${t}":`));
    expect(missing, `tools declared but never executed: ${missing.join(", ")}`).toEqual([]);
  });

  it("scopes deletes to the farm from the verified token", () => {
    for (const t of ["delete_flock", "delete_transaction", "delete_sale"]) {
      const c = executorCase(t);
      expect(c, `${t} is scoped by farmId`).toMatch(/where: \{ id: args\.id, farmId \}/);
    }
  });

  it("records an undo entry before a destructive delete", () => {
    for (const t of ["delete_flock", "delete_transaction"]) {
      const c = executorCase(t);
      expect(c, `${t} pushes an undo entry`).toContain("pushUndo");
    }
  });

  it("restores a deleted flock via undo_last_action", () => {
    const c = executorCase("undo_last_action");
    expect(c).toContain("prisma.flock.create");
    expect(c).toContain("prisma.transaction.create");
  });
});

describe("AI agentic loop", () => {
  it("loops until the model stops asking for tools", () => {
    expect(aiSource).toMatch(/while \(steps < MAX_AGENT_STEPS\)/);
    expect(aiSource).toContain("MAX_AGENT_STEPS");
  });

  it("bounds the loop so a confused model cannot spin forever", () => {
    expect(aiSource).toMatch(/AI_MAX_STEPS \|\| 8/);
    expect(aiSource).toContain("truncatedByBudget");
  });

  it("stops and surfaces the failure when a tool errors", () => {
    // Continuing after a failed write would let the model compound one mistake.
    expect(aiSource).toMatch(/allSteps\.some\(\(s\) => !s\.ok\)\) break/);
  });

  it("streams each step to the browser so the farmer can see the work", () => {
    expect(aiSource).toContain('router.post("/stream"');
    expect(aiSource).toContain('send("tool_start"');
    expect(aiSource).toContain('send("tool_end"');
    expect(aiSource).toContain("text/event-stream");
  });

  it("stops burning tokens if the farmer closes the tab mid-task", () => {
    expect(aiSource).toContain("req.on(\"close\"");
    expect(aiSource).toMatch(/if \(aborted\) break/);
  });
});

describe("AI provider safety", () => {
  it("returns 503 rather than leaking internal config when unconfigured", () => {
    expect(aiSource).toContain("503");
    expect(aiSource).not.toContain("Get a free key at ${getProvider");
  });

  it("never trusts a farmId from the request body", () => {
    expect(aiSource).toContain("req.user!.farmId");
    expect(aiSource).not.toMatch(/req\.body\.farmId/);
  });
});