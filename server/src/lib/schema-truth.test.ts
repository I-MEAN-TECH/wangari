import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the bug class behind the production error this file exists for:
 * `prisma.vaccination.findMany({ where: { farmId } })`.
 *
 * Vaccination has no farmId column — it belongs to a flock, which belongs to a
 * farm. Prisma rejects the query at RUNTIME, so the dashboard's action list
 * 500s in production. Crucially, `tsc` does not catch it: a deliberate probe
 * confirmed Prisma's generated types accept the call, so the whole suite stays
 * green while the dashboard is broken for every user.
 *
 * ── Two earlier attempts, and why this one is different ────────────────────
 * 1. A regex keyed by the schema's PascalCase model names matched nothing,
 *    because call sites are `prisma.vaccination` (camelCase). It `continue`d
 *    past every miss and passed with the bug in the file.
 * 2. Widening the window made it match the *preceding* call and flag two
 *    correct `flock: { farmId }` sites as broken. A guard that cries wolf gets
 *    ignored.
 * Both shared a failure mode: parsing source with a regex and trusting that a
 * green run means something. So the assertions below check the count of call
 * sites covered, and this test is verified by reintroducing the bug — a check
 * that cannot fail is not a check.
 *
 * The source of truth is Prisma's own generated `XWhereInput` types, not a
 * regex over the schema.
 */

const CLIENT_DTS = join(process.cwd(), "node_modules", ".prisma", "client", "index.d.ts");

function readClientTypes(): string {
  return readFileSync(CLIENT_DTS, "utf8");
}

/**
 * Model name -> the field names Prisma accepts in its WhereInput.
 *
 * Read from the generated client rather than schema.prisma: it is the exact
 * contract the runtime enforces, including the effect of @map, so there is no
 * second place to update when a column is renamed.
 */
function whereInputFields(client: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const start = /export type ([A-Za-z][A-Za-z0-9_]*)WhereInput = \{/g;
  for (const m of client.matchAll(start)) {
    const model = m[1];
    // The body ends at the first closing brace on its own line. Prisma indents
    // these inside a namespace block and closes with "\n  }", not "\n};", which
    // is why an earlier version of this parser matched nothing at all.
    const from = m.index + m[0].length;
    const rest = client.slice(from, from + 4000);
    const close = rest.search(/\n\s*\}/);
    if (close === -1) continue;
    const fields = new Set<string>();
    for (const f of rest.slice(0, close).matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*)\??:/gm)) {
      if (!["AND", "OR", "NOT"].includes(f[1])) fields.add(f[1]);
    }
    out.set(model, fields);
    // Call sites are `prisma.vaccination.…` but the generated type is
    // `VaccinationWhereInput`. Key both casings: the first version of this test
    // looked up only the PascalCase name, missed every call site, and passed
    // with the production bug still in the file.
    out.set(model.charAt(0).toLowerCase() + model.slice(1), fields);
  }
  return out;
}

/** Every .ts file under src/, excluding tests. */
function sourceFiles(dir = join(process.cwd(), "src")): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/**
 * Every `prisma.<model>.<verb>({ ... where: { farmId ...` site.
 *
 * The window is bounded by the call itself: it cannot cross a `;`, and it stops
 * at a newline that starts a new statement, so a neighbouring call is never
 * mistaken for this one.
 */
/**
 * The balanced `{ ... }` argument object beginning at `start`.
 *
 * Comments are already blanked, so every brace counted here is real code.
 */
function balancedObject(text: string, start: number): string {
  if (text[start] !== "{") return "";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

function farmIdFilterSites(): Array<{ model: string; file: string; line: number }> {
  const found: Array<{ model: string; file: string; line: number }> = [];
  const start = /prisma\.([A-Za-z][A-Za-z0-9_]*)\.[A-Za-z]+\(/g;
  for (const file of sourceFiles()) {
    const raw = readFileSync(file, "utf8");
    // Blank out comments before scanning, preserving offsets and newlines so
    // reported line numbers stay true. Without this, the explanatory comment
    // sitting inside the very query being checked ("// no farmId column on
    // Vaccination...") pushed the real `where:` past the scan window and the
    // check passed on the broken query.
    const text = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

    for (const m of text.matchAll(start)) {
      const model = m[1];
      const from = m.index + m[0].length;
      // Brace-match the call's own argument object instead of guessing a window
      // length. Every earlier version used a character budget, and each one
      // broke the same way: a long comment inside the call ate the whole budget
      // and the check passed on the very query it was written for. Braces do not
      // care how long the call is.
      const region = balancedObject(text, from);
      const rel = region.search(/where:\s*\{\s*farmId\b/);
      if (rel !== -1) {
        found.push({
          model,
          file: file.replace(process.cwd(), ""),
          line: text.slice(0, from + rel).split("\n").length,
        });
      }
    }
  }
  return found;
}

describe("prisma where-clauses use columns the generated client accepts", () => {
  const client = readClientTypes();
  const models = whereInputFields(client);

  it("reads the generated client, so the check has real inputs", () => {
    // If prisma generate has not run, or the file moved, every lookup below
    // silently misses. Fail loudly instead.
    expect(client.length).toBeGreaterThan(100_000);
    expect(models.size).toBeGreaterThan(40);
    expect(models.get("Flock")?.has("farmId")).toBe(true);
    expect(models.get("Vaccination")?.has("farmId")).toBe(false);
  });

  it("covers the call sites it claims to cover", () => {
    const sites = farmIdFilterSites();
    // The previous regex version passed while covering nothing. A floor here
    // means a broken matcher fails instead of passing quietly.
    expect(sites.length).toBeGreaterThan(50);
    // And every model it names must be one we can actually check.
    const unknown = sites.filter((s) => !models.has(s.model));
    expect(unknown.map((u) => `${u.model} in ${u.file}`)).toEqual([]);
  });

  it("never filters a model on farmId unless that model has a farmId column", () => {
    const violations = farmIdFilterSites()
      .filter((s) => !models.get(s.model)!.has("farmId"))
      .map((s) => `${s.model} has no farmId column — ${s.file}:${s.line}`);

    expect(violations, violations.join("\n")).toEqual([]);
  });
});