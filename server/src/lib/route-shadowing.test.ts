import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Literal routes must be registered BEFORE the ":id" catch-all.
 *
 * Express matches routes in registration order. `router.get("/:id")` matches
 * the literal string "compare" perfectly well — `Number("compare")` is NaN, so
 * the handler runs and the lookup finds nothing. The route that was actually
 * written never gets a chance to run.
 *
 * That is not hypothetical: the Compare button on /flocks has called
 * `/api/flocks/compare?ids=...` from the day it was built, and it has never
 * worked. The client swallowed the 404 in a bare catch and rendered "Select at
 * least 2 flocks to compare", so the farmer was told they had selected too few
 * when the request had simply failed. Two silent failures stacked.
 *
 * `tsc` cannot catch this — both routes are valid Express, and the client
 * happily type-checks against a URL that does not exist. Only ordering makes
 * it break, and only at runtime. So assert the ordering of the source.
 */

const flocksRoutePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "routes",
  "flocks.ts",
);

const source = readFileSync(flocksRoutePath, "utf8");

/** Line number (0-based) of the first `router.<verb>` registration for a path. */
function firstIndexOfRoute(path: string): number {
  const re = new RegExp(`router\\.(get|post|patch|delete|put)\\(\\s*"${path}"`);
  const match = re.exec(source);
  return match ? match.index : -1;
}

describe("flock routes are not shadowed by the ':id' catch-all", () => {
  it("has the literal /compare route", () => {
    expect(firstIndexOfRoute("/compare")).toBeGreaterThan(-1);
  });

  it("registers /compare before /:id", () => {
    const compare = firstIndexOfRoute("/compare");
    const byId = firstIndexOfRoute("/:id");
    expect(compare).toBeGreaterThan(-1);
    expect(byId).toBeGreaterThan(-1);
    expect(compare).toBeLessThan(byId);
  });

  it("keeps the root / route ahead of /:id too", () => {
    // The list endpoint is registered with a trailing-slash-free "/", so this
    // guards the same class of mistake if the file is ever reordered.
    expect(firstIndexOfRoute("/")).toBeLessThan(firstIndexOfRoute("/:id"));
  });
});

describe("the Compare button has an endpoint to call", () => {
  it("does not call a URL the server does not serve", () => {
    // The client is the other half of this bug: it called an endpoint that was
    // never written. Assert the two agree so they cannot drift again.
    const clientPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "wangari-next",
      "src",
      "components",
      "flocks",
      "FlockComparison.tsx",
    );
    let client: string;
    try {
      client = readFileSync(clientPath, "utf8");
    } catch {
      // Frontend not present in this checkout — nothing to cross-check.
      return;
    }

    const call = /api\/flocks\/([a-z-]+)/.exec(client);
    expect(call).not.toBeNull();
    expect(firstIndexOfRoute(`/${call![1]}`)).toBeGreaterThan(-1);
  });
});