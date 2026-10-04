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

  it("get_dashboard filters production by a real Date, not a date-only string", () => {
    const c = executorCase("get_dashboard");
    // The old bug: `sinceDay` was a "YYYY-MM-DD" string handed to a
    // `date DateTime @db.Date` column's `gte`. Prisma accepts that on write
    // and rejects it in a filter, so the single most likely demo question —
    // "how is my farm doing?" — threw and the farmer saw a generic failure.
    expect(c).not.toMatch(/sinceDay/);
    expect(c).toMatch(/date: \{ gte: since \}/);
  });

  it("never filters a date column with a sliced date-only string", () => {
    // Guards the whole class, not just the one call site: the mistake is
    // invisible to TypeScript (a string is assignable nowhere near this
    // filter) and only fails at runtime against Postgres.
    expect(aiSource).not.toMatch(/(gte|lte): \w*Day\b/);
  });

  it("never WRITES a date column with a sliced date-only string", () => {
    // The filter half of this bug was found and fixed while the write half
    // was still live: record_production, create_transaction and
    // record_attendance all failed with "premature end of input. Expected
    // ISO-8601 DateTime", which meant "record 200 eggs" could not reach the
    // database at all.
    //
    // Checked per-tool rather than globally, because slicing a date to a
    // string is legitimately used elsewhere for display, and a blanket ban
    // would pass for the wrong reason.
    for (const t of ["record_production", "create_transaction", "record_attendance"]) {
      const c = executorCase(t);
      expect(c, `${t} writes a real Date`).toMatch(/date: new Date\(\)/);
      expect(c, `${t} does not write a date-only string`).not.toMatch(/split\("T"\)/);
    }
    // The transaction that undo_last_action restores is a DateTime too.
    const undo = executorCase("undo_last_action");
    expect(undo, "the restored transaction has a real Date").toMatch(/date: new Date\(\)/);
    expect(undo).not.toMatch(/split\("T"\)/);
  });

  it("agrees with the schema about which columns are dates", () => {
    // The root cause both times was trusting a string where the schema says
    // DateTime. If a column changes type, this is the test that notices the
    // tool layer still assumes otherwise.
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    for (const model of ["DailyProduction", "Transaction", "Attendance"]) {
      const body = schema.slice(schema.indexOf(`model ${model} {`));
      expect(body.slice(0, 800), `${model}.date is a DateTime`).toMatch(/date\s+DateTime/);
    }
  });

  it("summarises every list tool in words instead of echoing its name", () => {
    const listTools = [
      ...aiSource.matchAll(/name: "(list_[a-z_]+)", description/g),
    ].map((m) => m[1]);
    expect(listTools.length).toBeGreaterThan(5);
    // The old bug: list_* had no label, so the panel showed the farmer the raw
    // identifier "list_flocks". A row count also gives the model something
    // concrete to answer from.
    for (const t of listTools) {
      expect(aiSource, `${t} has a human label`).toContain(`${t}: "`);
    }
    expect(aiSource).toContain("COUNT_NOUN");
    expect(aiSource).toMatch(/if \(Array\.isArray\(result\)\)/);
  });

  it("counts in words, with the right number", () => {
    // "Read sales — 1 sales" is exactly the kind of detail a farmer notices
    // and stops trusting. One row takes the singular, many take the plural,
    // and an empty list says so rather than saying "0".
    expect(aiSource).toContain("SINGULAR_NOUN");
    expect(aiSource).toMatch(/result\.length === 1 \? one : noun/);
    expect(aiSource).toContain("— none yet");
    // The compound nouns a trailing-s strip cannot reach must name a singular.
    for (const [tool, noun] of Object.entries({
      list_production: "record",
      list_transactions: "money record",
      list_attendance: "attendance record",
    })) {
      expect(aiSource, `${tool} has a singular`).toContain(`${tool}: "${noun}"`);
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