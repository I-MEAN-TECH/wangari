import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { requireFarm } from "../middleware/requireOwner.js";

/** Minimal express doubles — requireFarm only reads req.user and writes res. */
function call(mw: typeof requireFarm, user: unknown) {
  let status = 0;
  let body: any = null;
  let passed = false;
  const res: any = {
    status(c: number) { status = c; return res; },
    json(b: any) { body = b; return res; },
  };
  mw({ user } as any, res, () => { passed = true; });
  return { status, body, passed };
}

describe("requireFarm: a session with no farm must never read an unscoped query", () => {
  // Proved live before the fix: a token with no farmId returned 6 flocks from
  // every farm in the database, because Prisma drops an `undefined` filter
  // rather than matching nothing. requireFarm turns that into a clear 403.
  it("refuses a session with no farm attached", () => {
    for (const user of [undefined, {}, { userId: 3, farmId: null }, { userId: 3 }]) {
      const r = call(requireFarm, user);
      expect(r.passed, `must not pass through: ${JSON.stringify(user)}`).toBe(false);
      expect(r.status).toBe(403);
      expect(r.body.needsFarm).toBe(true);
    }
  });

  it("lets a farm session through", () => {
    expect(call(requireFarm, { userId: 3, farmId: 3 }).passed).toBe(true);
  });

  it("lets a worker through — workers legitimately read flocks", () => {
    expect(call(requireFarm, { workerId: 9, farmId: 3 }).passed).toBe(true);
  });

  it("guards every route that scopes by req.user.farmId", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const routesDir = join(here, "..", "routes");
    const gaps: string[] = [];
    for (const file of readdirSync(routesDir)) {
      if (!file.endsWith(".ts")) continue;
      const src = readFileSync(join(routesDir, file), "utf8");
      if (!/req\.user!\.farmId!/.test(src)) continue;
      const guarded = /requireOwner|requireFarm/.test(src);
      if (!guarded) gaps.push(file);
    }
    expect(gaps, "farm-scoped routes with no farm guard").toEqual([]);
  });
});