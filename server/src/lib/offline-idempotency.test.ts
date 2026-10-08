import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Offline writes must be idempotent on EVERY endpoint a farmer can record to.
 *
 * ── The bug this exists to prevent ──────────────────────────────────────────
 * The app queues writes to localStorage while offline and replays them with a
 * unique `clientId`; `middleware/idempotency.ts` collapses a replayed write onto
 * the original so a farmer is never charged twice for one record.
 *
 * That guard is applied per-route, by hand, in index.ts. Nothing enforced it,
 * so the list silently drifted: `/api/deliveries` was mounted WITHOUT the guard
 * while production, sales and transactions had it. Deliveries is the day-one
 * path — the one the new onboarding step and the delivery statement both point
 * a brand-new farmer at, and the number the whole "you're owed KES Y" story
 * rests on. A farmer whose connection dropped mid-flush would replay the
 * delivery and be told their co-op owes them twice what they actually owe.
 *
 * `tsc` cannot catch this: an unguarded mount is perfectly valid Express. And
 * nothing fails at boot. It only shows up as wrong money on a farmer's
 * statement, offline, on a weak connection — the hardest thing to reproduce and
 * the easiest thing to ship. So assert the mounting in the source.
 *
 * ── Why the client is cross-checked too ─────────────────────────────────────
 * The guard reads `req.body.clientId`; the flusher writes `{ ...body, clientId }`.
 * If either side is renamed, the guard silently degrades into a pass-through
 * and every endpoint here becomes unprotected again while still reading
 * "GUARDED" in a source scan. So the two ends of that contract are asserted
 * against each other here, not just the server side.
 */

/** Endpoints a farmer can record to, and whose writes the offline queue replays. */
const OFFLINE_REPLAYABLE_WRITES = [
  "production",
  "deliveries",
  "sales",
  "transactions",
  "inventory",
  "crops",
  // Livestock joined the list late: a group-to-group transfer, a merge or a
  // head-count change replayed twice would double-move animals while every
  // count still reconciled locally. Kept here so it cannot drift out again.
  "flocks",
  "animals",
] as const;

const serverSrc = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts: string[]): string {
  try {
    return readFileSync(join(serverSrc, ...parts), "utf8");
  } catch {
    return "";
  }
}

const indexSource = read("index.ts");

/** Map every `/api/x` mount to whether idempotencyGuard was applied to it. */
function mounts(): Map<string, boolean> {
  const found = new Map<string, boolean>();
  const re = /app\.use\(\s*"\/api\/([^"]+)"([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexSource)) !== null) {
    const [, path, rest] = m;
    // A path can legitimately be mounted twice (two routers, one URL space).
    // Guarded wins: if any registration guards it, the write is protected.
    const guarded = /idempotencyGuard/.test(rest);
    found.set(path, (found.get(path) ?? false) || guarded);
  }
  return found;
}

describe("every offline-replayable write is idempotency-guarded", () => {
  const table = mounts();

  it("found the /api mounts in index.ts", () => {
    // If this ever fails the assertions below are vacuous, so fail loudly.
    expect(table.size).toBeGreaterThan(10);
  });

  for (const endpoint of OFFLINE_REPLAYABLE_WRITES) {
    it(`guards /api/${endpoint}`, () => {
      expect(table.has(endpoint)).toBe(true);
      expect(table.get(endpoint)).toBe(true);
    });
  }
});

describe("the offline replay contract is the one the guard reads", () => {
  const guardSource = read("middleware", "idempotency.ts");
  // server/src -> server -> repo root, so two levels up from serverSrc.
  const providerSource = read(
    "..",
    "..",
    "wangari-next",
    "src",
    "components",
    "offline-provider.tsx",
  );
  const queueSource = read(
    "..",
    "..",
    "wangari-next",
    "src",
    "lib",
    "offline-queue.ts",
  );

  it("found the frontend and guard sources to cross-check", () => {
    // A silent empty read would make these assertions fail for the wrong
    // reason, and a source scan that quietly scans nothing is worse than one
    // that is absent. Fail loudly instead.
    expect(guardSource.length).toBeGreaterThan(0);
    expect(providerSource.length).toBeGreaterThan(0);
    expect(queueSource.length).toBeGreaterThan(0);
  });

  it("the server reads the idempotency key from the request body", () => {
    expect(guardSource).toMatch(/req\.body\?\.clientId/);
  });

  it("the client sends that key when replaying the queue", () => {
    expect(providerSource).toMatch(/\.\.\.\(body as object\),\s*clientId/);
  });

  it("every queued write carries an id to send", () => {
    expect(queueSource).toMatch(/id:\s*`\$\{Date\.now\(\)\}-/);
  });

  it("passes on (unprotected) when no key is present, so online writes are untouched", () => {
    // Guards must never become a write-blocker for a request that simply is not
    // a replay. Without clientId the middleware has nothing to collapse.
    expect(guardSource).toMatch(/if \(!clientId[\s\S]*?\) return next\(\)/);
  });
});
