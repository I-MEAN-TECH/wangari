import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

const actionEngine = read("routes/action-engine.ts");

describe("Action Engine rules and safety", () => {
  it("enforces tenant isolation: every prisma query filters on farmId", () => {
    const prismaCalls = [...actionEngine.matchAll(/prisma\.(\w+)\.(findMany|findUnique|findFirst|aggregate)\(\{([\s\S]*?)\}\)/g)];
    expect(prismaCalls.length).toBeGreaterThanOrEqual(10);
    for (const [, model, op, args] of prismaCalls) {
      if (model === "marketPrice") {
        // MarketPrice is a shared county-level commodity price benchmark, not per-farm
        continue;
      }
      if (model === "vaccination") {
        expect(args, `flock relation filter on ${model}.${op} must include farmId`).toContain("flock: { farmId }");
      } else {
        expect(args, `query on ${model}.${op} must filter by farmId`).toMatch(/(farmId|where:\s*\{\s*id:\s*farmId)/);
      }
    }
  });

  it("fixes production drop detection: queries 14 days and calculates lastWeek drop", () => {
    expect(actionEngine).toContain("const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000);");
    expect(actionEngine).toContain("date: { gte: twoWeeksAgo }");
    expect(actionEngine).toContain("e.lastWeek +=");
    expect(actionEngine).toContain("e.thisWeek +=");
    expect(actionEngine).toContain("(e.lastWeek - e.thisWeek) / e.lastWeek");
  });

  it("includes food-safety withdrawal alerts from HealthRecord", () => {
    expect(actionEngine).toContain("prisma.healthRecord.findMany");
    expect(actionEngine).toContain("activeWithdrawals(withdrawalInputs, now)");
    expect(actionEngine).toContain('priority: "critical"');
    expect(actionEngine).toContain('section: "health"');
  });

  it("includes scouting follow-up reminders from CropHealth", () => {
    expect(actionEngine).toContain("prisma.cropHealth.findMany");
    expect(actionEngine).toContain("followUpOn: { lte: today }");
    expect(actionEngine).toContain('section: "crops"');
  });

  it("includes overdue delivery payout alerts from Delivery", () => {
    expect(actionEngine).toContain("prisma.delivery.findMany");
    expect(actionEngine).toContain('status: "pending"');
    expect(actionEngine).toContain("payBy: { not: null, lt: today }");
    expect(actionEngine).toContain('section: "finance"');
  });

  it("includes crop stage milestones from crop-stages lib", () => {
    expect(actionEngine).toContain("findActiveMilestones(crops, today)");
    expect(actionEngine).toContain("crop-milestone-");
  });

  it("decorates actions with section and subject metadata", () => {
    expect(actionEngine).toContain('section?: "livestock" | "crops" | "finance" | "tasks" | "health" | "general"');
    expect(actionEngine).toContain("subject?: string;");
  });
});
