import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inventory expiring-soon endpoint for Free Core.
 *
 * The free tier must surface inventory that is about to expire. The
 * `expiryDate` column is already on the `Inventory` model; the route is
 * the new piece. It returns items whose expiry falls within the next
 * N days (default 30), ordered most-urgent first, with the KES value at
 * risk calculated from `quantity * unitCost`.
 *
 * The endpoint is on the free path because spoiled stock is the highest
 * single inventory failure on a smallholder farm — the farmer needs to
 * know the same week, not on a paid dashboard.
 */

const DAY = 86400000;
const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

describe("the inventory expiring-soon route", () => {
  const route = read("routes/inventory.ts");

  it("mounts GET /api/inventory/expiring on the inventory router", () => {
    expect(route).toMatch(/router\.get\(['"]\/expiring['"]/);
  });

  it("filters to items with expiryDate in the next 30 days by default", () => {
    // The query must use a window that starts at "now" and ends at
    // "now + 30 days", so the farmer sees what is going bad THIS week.
    expect(route).toMatch(/expiryDate:\s*\{\s*gte:\s*on/);
    // The upper bound is the horizon, default 30 days, parameterised.
    expect(route).toMatch(/lte:\s*horizon/);
  });

  it("orders by expiryDate ascending so the most-urgent is first", () => {
    expect(route).toMatch(/orderBy:\s*\{\s*expiryDate:\s*['"]asc['"]/);
  });

  it("returns value-at-risk (quantity * unitCost) per item", () => {
    // The dashboard tile surfaces this. The endpoint must compute it.
    expect(route).toMatch(/valueAtRisk/);
    expect(route).toMatch(/unitCost/);
  });

  it("accepts a `?days=N` override up to 365", () => {
    // A farmer who wants a 60-day or 90-day view should be able to
    // override the default. Cap at 365 so a typo doesn't return the
    // whole history.
    expect(route).toMatch(/Number\(req\.query\.days/);
    expect(route).toMatch(/365/);
  });

  it("scopes the query to req.user.farmId", () => {
    // Other farms' inventory must never leak through the endpoint.
    expect(route).toMatch(/farmId:\s*req\.user!\.farmId!/);
  });
});
