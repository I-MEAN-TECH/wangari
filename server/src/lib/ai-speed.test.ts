import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchWeb, searchConfigured } from "./web-search.js";

const src = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");

/**
 * Why this file exists, in the farmer's words.
 *
 * "Tell me the status of the farm" produced ELEVEN tool calls — list_flocks,
 * list_production, list_crops, and so on, with list_flocks twice — and on a
 * provider that meters one request a minute, that is eleven minutes of
 * watching Wangari think.
 *
 * The cause was not the model being slow. The model was being handed
 * "Read flocks — 1 flock" instead of the flock, so it had no way to answer
 * and kept asking. It was working blind, and the fix was to stop blindfolding
 * it rather than to tell it to hurry.
 */
describe("the model is shown the DATA, not the summary", () => {
  it("sends the rows alongside the farmer-facing line", () => {
    // The two audiences need different text and were being given the same
    // one. The farmer scrolls past; the model has to reason about it.
    expect(src).toMatch(/ok \? \{ \.\.\.payload, ok, data: rowsForModel\(raw\) \}/);
  });

  it("never sends the one-line summary on its own", () => {
    expect(src).not.toMatch(
      /content: JSON\.stringify\(\{ \.\.\.payload, ok \}\)/,
    );
  });

  it("bounds what the model is given, so a big farm does not flood it", () => {
    // Unbounded rows are also slow: a model reading thousands of tokens of
    // raw records is not reasoning better, it is reading.
    const rows = Number(src.match(/const MAX_ROWS_TO_MODEL = (\d+)/)?.[1]);
    const chars = Number((src.match(/const MAX_CHARS_TO_MODEL = ([\d_]+)/)?.[1] || "0").replace(/_/g, ""));
    // A bound, not just a number: `\d+` matches 100000 just as happily as 25,
    // which is how an unbounded payload passed the first version of this.
    expect(rows, "rows per collection must stay small").toBeGreaterThan(0);
    expect(rows, "rows per collection must stay small").toBeLessThanOrEqual(50);
    expect(chars).toBeGreaterThan(0);
    expect(chars).toBeLessThanOrEqual(20_000);
    expect(src).toMatch(/slice\(0, MAX_ROWS_TO_MODEL\)/);
    expect(src).toContain("truncated");
  });
});

describe("one call answers a whole-farm question", () => {
  it("offers a combined status tool", () => {
    expect(src).toMatch(/name: "get_farm_status"/);
    expect(src).toContain('case "get_farm_status"');
  });

  it("tells the model to reach for it FIRST", () => {
    // A tool nobody uses is a tool that saves nothing. The description has to
    // say which questions it answers, or the model keeps listing.
    expect(src).toMatch(/Use this FIRST for any question about how the farm is doing/);
  });

  it("returns the parts a status report is made of, in one query", () => {
    const body = src.slice(
      src.indexOf('case "get_farm_status"'),
      src.indexOf('case "get_dashboard"'),
    );
    for (const table of ["flocks", "workers", "transactions", "sales", "invoices", "inventory", "customers", "crops", "production"]) {
      expect(body, `status must include ${table}`).toContain(table);
    }
    // One round trip to the database, not nine.
    expect(body).toContain("Promise.all");
  });

  it("names what is missing, so the answer says so rather than guessing", () => {
    expect(src.slice(src.indexOf('case "get_farm_status"'))).toContain("notRecorded");
  });

  it("runs the tools in one turn together", () => {
    // Independent reads done one after another are independent reads done too
    // slowly.
    expect(src).toMatch(/const settled = await Promise\.all\(/);
  });
});

describe("looking things up instead of remembering them", () => {
  it("is offered as a tool and never plan-gated", () => {
    expect(src).toMatch(/name: "search_web"/);
    // A read: refusing to look something up would just send the farmer back
    // to guessing, which is the thing we are trying to stop.
    const writes = src.slice(src.indexOf("const WRITE_TOOLS"));
    expect(writes.slice(0, writes.indexOf("]"))).not.toContain("search_web");
  });

  it("forbids inventing a price or a regulation", () => {
    expect(src).toContain("Never state a price, a regulation or a disease status from memory");
  });
});

describe("the search tool itself", () => {
  const saved = process.env.EXA_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = saved;
  });

  /**
   * This test used to assert the opposite of what it asserts now.
   *
   * It read: with no EXA_API_KEY, research reports itself unavailable and
   * refuses. That was honest and completely useless - the farmer was told
   * "not set up on this account" for every question, which is exactly what a
   * paid feature being absent looks like from the outside.
   *
   * The requirement is now a keyless search. So the contract is: available
   * with nothing configured, and STILL honest when it cannot reach anything.
   * The refusal is not gone - it is now specific about WHICH failure it was,
   * because "the network is down" must never be reported as "the web found
   * nothing", and a farmer would act on that difference.
   */
  it("needs no API key at all", () => {
    delete process.env.EXA_API_KEY;
    expect(searchConfigured()).toBe(true);
  });

  it("still refuses rather than guessing when it cannot reach anything", async () => {
    delete process.env.EXA_API_KEY;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ENOTFOUND");
    }) as any;
    try {
      const out = await searchWeb("maize price in Kisumu");
      expect(out.hits).toEqual([]);
      expect(out.ok).toBe(false);
      // The whole point survives the change: an honest gap beats a confident
      // wrong number. And the refusal must not contain a price.
      expect(out.note).not.toMatch(/KSh|KES|[0-9]/);
      expect(out.note).toMatch(/could not reach the internet/i);
    } finally {
      globalThis.fetch = real;
    }
  });

  it("distinguishes 'no results' from 'never reached the internet'", async () => {
    // Two failures that look identical if you only inspect the hits array,
    // and mean opposite things: one is a fact about the world, the other a
    // fact about the connection.
    const real = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<html><body>no results</body></html>", { status: 200 })) as any;
    let reachedNote = "";
    try {
      const out = await searchWeb("qqqq zzzz nonexistent");
      reachedNote = out.note ?? "";
      expect(out.tier).toBe("open");
    } finally {
      globalThis.fetch = real;
    }
    expect(reachedNote).toMatch(/looked, and found nothing/i);
  });

  it("needs something to look up", async () => {
    delete process.env.EXA_API_KEY;
    const { hits } = await searchWeb("   ");
    expect(hits).toEqual([]);
  });
});
describe("not paying a minute per search", () => {
  /**
   * Measured live on the layer-mash question: three search_web calls, and
   * 198,128ms before Wangari said a word. The provider allows one request a
   * minute, so each extra search is a whole minute of a farmer staring at a
   * screen - spent on refining a query that the first result had already
   * answered.
   *
   * Two searches stay allowed, because a good lookup often needs a second one
   * (the first finds the price, the second finds the date on it). The third
   * is refused, and refused in a way that tells the model to stop and answer.
   */
  it("caps research at two searches per farmer turn", () => {
    const src = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");
    expect(src).toMatch(/const SEARCHES_PER_TURN = Number\(process\.env\.AI_SEARCHES_PER_TURN \|\| 2\)/);
    // The cap is now per-turn, set from the super-admin registry on the budget,
    // and the constant remains the fallback. Both matter: without the constant
    // a registry read failure would leave `cap` undefined, and without the
    // per-turn assignment an operator's setting would never be applied.
    expect(src).toMatch(/budget\.searches >= \(budget\.cap \?\? SEARCHES_PER_TURN\)/);
    expect(src).toMatch(/budget\.cap = opsSettings\.searchesPerTurn/);
    expect(src).toMatch(/if \(budget\) budget\.searches\+\+;/);
  });

  it("tells the model to answer rather than keep searching", () => {
    // A bare error would make a model retry the same call. The refusal has to
    // read as advice, in the same voice the rest of the refusals use.
    const src = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");
    expect(src).toMatch(/Answer from what you have, and name what is still missing/);
  });

  it("counts searches per TURN, not per request", () => {
    // A module-level counter would throttle the farmer's second question of
    // the day, which is not the thing being paid for here.
    const src = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");
    expect(src).toMatch(/const budget: TurnBudget = \{ searches: 0 \};/);
    expect(src).toMatch(/raw = await executeTool\(toolName, args, farmId, req\.user!\.userId, budget\)/);
  });
});
