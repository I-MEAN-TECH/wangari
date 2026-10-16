import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wiring facts for the AI write-tool gate.
 *
 * The contract under test: a single refusal message is returned for every
 * blocked write, regardless of the user's tier. The copy names the modules
 * the user CAN use for free (Money, Stock, weather) so it reads as a
 * redirect, not an error. Per-tier variants were tried and reverted — they
 * read as a sales pitch to free-core users, who expected a feature to work,
 * not a pitch. The single message is the right product answer.
 *
 * These tests read source on purpose. The actual refusal message is shaped
 * by the model and the model isn't running in unit tests; what we can
 * prove is the contract: the gate uses moduleAllowedForUser, the refusal
 * has the "Money, Stock or the weather" copy, and there is no per-tier
 * branch that could drift.
 */
const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

describe("the AI write gate uses a single refusal for every tier", () => {
  const ai = read("routes/ai.ts");

  it("calls moduleAllowedForUser to gate every write", () => {
    // The boolean gate is the only authority. A second copy of the rules
    // would drift, and the drift presents as "the AI can do it but I
    // cannot see it" — the exact bug this replaced.
    expect(ai).toMatch(/moduleAllowedForUser\(userId, module\)/);
  });

  it("does not branch on plan tier inside the write gate", () => {
    // Re-introducing a per-tier branch in this file would be the bug this
    // test exists to prevent. The single refusal is the contract.
    const writeBlock = ai.slice(ai.indexOf("WRITE_TOOLS.has(toolName)"), ai.indexOf("switch (toolName)"));
    expect(writeBlock).not.toMatch(/tier\s*===\s*"free_core"/);
    expect(writeBlock).not.toMatch(/userPlanTier/);
    expect(writeBlock).not.toMatch(/planTierForUser/);
  });

  it("returns the 'Money, Stock or the weather' copy for every blocked write", () => {
    // The redirect copy names what the user CAN do for free, not what
    // they're being denied. That is the right shape for a refusal.
    const writeBlock = ai.slice(ai.indexOf("WRITE_TOOLS.has(toolName)"), ai.indexOf("switch (toolName)"));
    expect(writeBlock).toMatch(/Money, Stock or the weather/);
    expect(writeBlock).toMatch(/That part of the farm is not in your plan yet/);
  });

  it("returns a refusal in the { error: ... } shape, not a throw", () => {
    // The contract: the agentic loop reads step.ok = false from the
    // { error } object and stops. A throw here would break the loop and
    // surface a stack trace to the farmer's chat.
    const writeBlock = ai.slice(ai.indexOf("WRITE_TOOLS.has(toolName)"), ai.indexOf("switch (toolName)"));
    expect(writeBlock).toMatch(/return\s*\{\s*error:/);
  });

  it("start_intake still resolves the module from the entity, not the tool", () => {
    // start_intake covers eleven entities. Gating it on the tool name
    // would refuse a crop on the flocks plan. The entity-driven module
    // lookup is the contract — don't break it while refactoring the refusal.
    const writeBlock = ai.slice(ai.indexOf("WRITE_TOOLS.has(toolName)"), ai.indexOf("switch (toolName)"));
    expect(writeBlock).toMatch(/intakeModule\(args\.entity\)/);
    expect(writeBlock).toMatch(/TOOL_MODULE\[toolName\]/);
  });
});
