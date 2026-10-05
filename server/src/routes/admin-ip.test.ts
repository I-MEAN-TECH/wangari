import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guards in the IP admin routes.
 *
 * These cannot be reached by mounting the router — that needs a JWT and a live
 * Postgres — so they are read from the source, which is the same trade the
 * other route tests in this directory make. What is worth pinning is not that
 * the file parses but that the specific refusals stay, because each of them
 * exists because of a specific failure.
 */

const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

const ip = read("routes/admin-ip.ts");
const health = read("routes/admin-ai.ts");
const modelHealth = read("lib/model-health.ts");
const index = read("index.ts");

describe("only a super admin can manage IP rules", () => {
  it("guards every route with the super-admin role", () => {
    expect(ip).toContain('const superOnly = requireAdmin(["super_admin"])');
    // Captured as three groups so the assertion can be about the GUARD, not the
    // path. The first version built its failure message from the path and then
    // asserted the guard matched it, which could only ever fail.
    const routes = [...ip.matchAll(/^router\.(get|post|patch|delete)\("([^"]*)",\s*([^,\n]+)/gm)].map(
      (m) => ({ line: `${m[1]} ${m[2]}`, guard: m[3].trim() }),
    );
    expect(routes.length, "expected the full set of IP routes").toBeGreaterThanOrEqual(5);
    const unguarded = routes.filter((r) => !/superOnly/.test(r.guard));
    expect(
      unguarded.map((r) => `${r.line} → ${r.guard}`),
      "these routes are reachable by something other than a super admin",
    ).toEqual([]);
  });

  it("is mounted on its own prefix, and the AI router cannot shadow it", () => {
    expect(index).toContain('import adminIpRoutes from "./routes/admin-ip.js"');
    expect(index).toContain('app.use("/api/admin/ip", adminIpRoutes)');
    // /api/admin/ai matches /api/admin/ai/** only. Asserting the prefixes are
    // distinct is cheap insurance against someone renaming one to "a".
    expect(index).toContain('app.use("/api/admin/ai", adminAiRoutes)');
  });

  it("audits every change", () => {
    const audits = [...ip.matchAll(/auditAdminAction\(/g)].length;
    expect(audits, "add, update and delete must all be audited").toBeGreaterThanOrEqual(3);
  });
});

describe("it refuses to lock the operator out", () => {
  it("refuses a block covering the caller's own address", () => {
    // Unrecoverable from inside the app: the panel you would use to undo it is
    // the panel you just locked yourself out of. This has to be a server-side
    // refusal, not a confirmation dialog the operator can dismiss.
    expect(ip).toMatch(/if \(action === "block" && self && matches\(pattern, self\)\)/);
    expect(ip).toContain("would lock you out of this panel");
  });

  it("re-checks on edit, because flipping an allow to a block is the same mistake", () => {
    expect(ip).toMatch(/if \(action === "block" && self && matches\(existing\.pattern, self\)\)/);
  });

  it("reads the caller's address the same way the guard does", () => {
    expect(ip).toContain("clientIp(req)");
  });
});

describe("a rule that cannot work is refused rather than stored", () => {
  it("validates on save with the same function the matcher uses", () => {
    // Two different definitions of "valid" would mean a rule the panel shows as
    // active and that matches nothing at all. Checked on all three routes that
    // accept a pattern — preview, create and edit — because a dry run that
    // accepts what the save refuses is worse than no dry run.
    const checks = [...ip.matchAll(/isValidPattern\(/g)].length;
    expect(checks, "preview, create and edit must each validate the pattern").toBe(3);
    // Every validation sits on a local named `pattern`, never on a raw
    // re-read of the body, so there is one definition per route to audit.
    const validated = [...ip.matchAll(/isValidPattern\((\w+)\)/g)].map((m) => m[1]);
    expect(validated).toEqual(["pattern", "pattern", "pattern"]);
  });

  it("accepts only block and allow", () => {
    expect(ip).toContain('function normaliseAction(v: unknown): "block" | "allow" | null');
    expect(ip).toMatch(/action must be block or allow/);
  });

  it("invalidates the request-path cache on every change", () => {
    // The matcher reads a 5-second cache so a ban is not paid for with a
    // database query on every request. Forgetting to invalidate it would leave
    // the panel showing a rule the app is still ignoring for up to five
    // seconds — and an operator would reasonably call that the rule not working.
    const invalidations = [...ip.matchAll(/invalidateIpRules\(\)/g)].length;
    const mutations = [...ip.matchAll(/prisma\.ipRule\.(create|update|delete)\(/g)].length;
    expect(invalidations).toBe(mutations);
  });
});

describe("the AI health panel exposes forensics without exposing farms", () => {
  it("has the endpoint the panel calls", () => {
    expect(health).toMatch(/router\.get\("\/health", superOnly/);
    expect(health).toMatch(/router\.post\("\/health\/clear", superOnly/);
  });

  it("logs who and from where, which is the question the panel exists for", () => {
    /* The counting lives in lib/model-health.ts rather than in this route
       because it has to run over every record the store holds — the panel is
       sent only the most recent 60, so a count taken from those would
       under-report exactly when the numbers are worth trusting. The route's
       job is to call it, and this asserts that it does. */
    expect(health).toMatch(/\.\.\.summariseUsage\(uses\)/);
    expect(modelHealth).toMatch(/export function summariseUsage\(uses: UseRecord\[\]\)/);
    expect(modelHealth).toMatch(/uniqueUsers: users\.size/);
    expect(modelHealth).toMatch(/uniqueIps: ips\.size/);
    // The fallback list, which is the question the panel exists to answer.
    expect(health).toMatch(/fellBackFrom/);
  });

  it("carries no prompt or farm content", () => {
    /* The assistant guarantees one farm's records cannot reach another. A
       diagnostics endpoint holding questions or answers would be the one place
       that guarantee ends — so it is asserted, not assumed. */
    const block = health.slice(health.indexOf('router.get("/health"'));
    const end = block.indexOf('router.post("/health/clear"');
    const live = block.slice(0, end);
    for (const leak of ["messages", "req.body", "SYSTEM_PROMPT", "tools", "tool_calls"]) {
      expect(live, `the health endpoint must not touch ${leak}`).not.toContain(leak);
    }
  });

  it("states that its view is one worker, rather than implying it is complete", () => {
    // PM2 runs two workers and the store is per-process. An operator comparing
    // two loads should know why they differ, not conclude the data is wrong.
    expect(health).toContain("pid: process.pid");
  });

  it("only lets a human bring back a retired model", () => {
    // A retirement that expired on its own would quietly put a retired model
    // back in front of farmers, and the next farmer to ask would find out.
    expect(health).toContain("modelHealth.clear(model)");
    expect(health).toContain("ai.model_health_cleared");
  });
});