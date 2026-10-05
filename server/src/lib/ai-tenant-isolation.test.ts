import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tenant isolation for the assistant.
 *
 * Wangari reads and writes real farm records on a model's instruction. The
 * model is not a security boundary: it can be talked into asking for record
 * #7 when the farmer means their own, it can repeat an id it saw in an earlier
 * turn, and a prompt-injected message can simply name someone else's farm.
 *
 * So the only thing standing between two farmers' books is that EVERY query
 * inside executeTool carries the farmId that came off the authenticated
 * session — never an id, never a name, never anything the model supplied.
 *
 * These tests read the source rather than the database, because a database test
 * would only prove today's queries. The failure this guards against is a future
 * edit that adds a query and forgets the scope, and only a source-level check
 * sees that.
 */
const aiSrc = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");
const intakeSrc = readFileSync(join(process.cwd(), "src", "routes", "ai-intake.ts"), "utf8");

function blockOf(src: string, openRe: RegExp): string {
  const m = openRe.exec(src);
  expect(m, `could not locate ${openRe}`).toBeTruthy();
  const from = m!.index;
  const lines = src.slice(from).split("\n");
  let depth = 0;
  let seen = false;
  for (let i = 0; i < lines.length; i++) {
    for (const c of lines[i]) {
      if (c === "{") { depth++; seen = true; }
      if (c === "}") depth--;
    }
    if (seen && depth === 0) return lines.slice(0, i + 1).join("\n");
  }
  throw new Error("unterminated block");
}

const executor = blockOf(aiSrc, /async function executeTool\(/);

/** Every prisma call in a block, with the lines that follow it. */
function prismaCalls(block: string): Array<{ model: string; op: string; snippet: string }> {
  const out: Array<{ model: string; op: string; snippet: string }> = [];
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /prisma\.(\w+)\.(findMany|findFirst|findUnique|count|aggregate|update|updateMany|delete|deleteMany|create|createMany|upsert)\(/.exec(lines[i]);
    if (!m) continue;
    // The where clause lives on this line or the next couple.
    const snippet = lines.slice(i, i + 4).join(" ").replace(/\s+/g, " ");
    out.push({ model: m[1], op: m[2], snippet });
  }
  return out;
}

describe("the assistant cannot read or write another farm's records", () => {
  it("scopes every query in executeTool to the session farmId", () => {
    const calls = prismaCalls(executor);
    // Guard the guard: if the extraction breaks, the loop below is vacuous.
    expect(calls.length, "expected to find prisma calls in executeTool").toBeGreaterThan(15);

    const unscoped = calls.filter(
      (c) => !/farmId/.test(c.snippet) && !/flock:\s*\{\s*farmId/.test(c.snippet),
    );
    expect(
      unscoped.map((c) => `${c.model}.${c.op}`),
      "these queries do not mention farmId anywhere near them — each needs a reason and a test",
    ).toEqual([]);
  });

  it("takes farmId from the authenticated session, never from the model", () => {
    // executeTool receives farmId as an argument. What matters is that the
    // caller passes the session's value and not something the model chose.
    const callers = aiSrc.split("\n").filter((l) => /executeTool\(/.test(l) && !/async function/.test(l));
    expect(callers.length, "expected both the stream and chat paths to call executeTool").toBeGreaterThanOrEqual(2);
    for (const c of callers) {
      expect(c, "executeTool called without the session farmId").toMatch(/farmId/);
      expect(c, "executeTool called with a model-supplied farm").not.toMatch(/args\.farmId/);
      expect(c, "executeTool called with the raw body farmId").not.toMatch(/req\.body\w*farmId/);
    }
  });

  it("refuses to act when the session has no farm", () => {
    // A missing farmId must stop the turn, not widen it to "no filter".
    expect(aiSrc).toMatch(/if \(!farmId\) return res\.status\(400\)/);
  });

  it("cannot prefill another farm's record through a hallucinated id", () => {
    // The model chooses this id. It is the single most direct route to someone
    // else's books, so the query carries farmId as well.
    expect(intakeSrc).toMatch(/findFirst\(\{\s*where:\s*\{\s*id,\s*farmId\s*\}\s*\}\)/);
  });

  it("scopes the edit prefill to the same farm it is about to write to", () => {
    const fn = blockOf(intakeSrc, /export async function fetchRecordValues\(/);
    expect(fn).toMatch(/farmId: number/);
    expect(fn).toMatch(/where:\s*\{\s*id,\s*farmId\s*\}/);
  });
});

describe("the undo path in the intake router is scoped too", () => {
  const undo = blockOf(intakeSrc, /router\.delete\("\/:entity\/:id"/);

  it("takes the farm from the session, not from the request", () => {
    expect(undo).toMatch(/const farmId = req\.user!\.farmId/);
    expect(undo).not.toMatch(/req\.body\.?farmId|req\.params\.farmId/);
  });

  it("scopes every query it runs", () => {
    /* The undo path is where scoping is easiest to skip: each id here came from
       a record this farm just created, so an unscoped query is provably
       harmless TODAY. That is exactly the argument that rots — the day the
       provenance changes, the unscoped query silently becomes a cross-tenant
       read or delete. So every query carries the scope even when it does not
       need it. */
    const calls = prismaCalls(undo);
    expect(calls.length, "expected the undo path to run queries").toBeGreaterThan(3);
    const unscoped = calls.filter(
      (c) => !/farmId/.test(c.snippet) && !/flock:\s*\{\s*farmId/.test(c.snippet),
    );
    expect(
      unscoped.map((c) => `${c.model}.${c.op}: ${c.snippet}`),
      "these undo queries are not scoped to the farm",
    ).toEqual([]);
  });

  it("never deletes by id alone, even one it just looked up", () => {
    // The lookup is scoped, so the delete is safe — but a delete that re-states
    // the scope survives being copied into a function that does not look it up
    // first. deleteMany rather than delete, because there is no unique-by-scope
    // constraint on these tables.
    expect(undo).not.toMatch(/\.(delete|update)\(\{\s*where:\s*\{\s*id:/);
  });
});

describe("the writers are scoped too", () => {
  const writers = readFileSync(join(process.cwd(), "src", "lib", "intake-writers.ts"), "utf8");

  it("every update writer looks the row up by id AND farm before writing", () => {
    // An update by id alone would let a farmer correct somebody else's row if
    // the id ever came from anywhere but their own confirmation.
    const lookups = [...writers.matchAll(/findFirst\(\{\s*where:\s*\{([^}]*)\}\s*\}\)/g)].map(
      (m) => m[1].trim(),
    );
    expect(lookups.length, "expected an ownership check in the update writers").toBeGreaterThan(5);
    const byIdOnly = lookups.filter((w) => /^\s*id\s*$/.test(w));
    expect(
      byIdOnly,
      "an update writer looks the row up by id alone — it would write another farm's record",
    ).toEqual([]);
  });
});