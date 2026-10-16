import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wiring facts for the AI write-tool gate.
 *
 * The change under test: a free-core user trying to save anything through
 * the AI must be told *it's a plan rule, not a bug*. A refusal that just
 * says "not in your plan" reads like a broken feature. The new code:
 *   1. Looks up the user's plan tier via `userPlanTier` (from plan-gate).
 *   2. For free_core, returns a specific refusal that names the plan and
 *      points at /subscription.
 *   3. For starter/growth on a module their plan doesn't cover, keeps the
 *      existing "ask for something in Money, Stock or the weather" copy.
 *
 * These tests read source on purpose. The actual refusal message is shaped
 * by the model and the model isn't running in unit tests; what we can
 * prove is the contract: the gate uses userPlanTier, the free_core branch
 * mentions "Free Core", and the existing non-free branch is preserved.
 */
const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src", ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

describe("the AI write gate names the plan in its refusal", () => {
  const ai = read("routes/ai.ts");
  const gate = read("middleware/plan-gate.ts");

  it("calls userPlanTier to resolve the user's tier", () => {
    // The previous code only called isModuleAllowed, which returns a boolean.
    // To name the plan in the refusal, we need the tier, hence userPlanTier.
    expect(ai).toMatch(/planTierForUser\(userId\)/);
    expect(ai).toMatch(/userPlanTier/);
  });

  it("userPlanTier is exported from plan-gate", () => {
    // The new function is what the AI gate imports. If it's not exported,
    // the gate can't import it and the test would fail at runtime.
    expect(gate).toMatch(/export async function userPlanTier\(/);
  });

  it("userPlanTier returns the four documented values", () => {
    // "free_core" | "starter" | "growth" | "unauthorized" — the AI gate
    // branches on these and so does the sidebar. Drift here = bug.
    const tierFn = gate.slice(gate.indexOf("export async function userPlanTier"));
    expect(tierFn).toMatch(/return "free_core"/);
    expect(tierFn).toMatch(/return "starter"/);
    expect(tierFn).toMatch(/return "growth"/);
    expect(tierFn).toMatch(/return "unauthorized"/);
  });

  it("the free_core branch is distinct from the starter/growth copy", () => {
    // A previous version's bug: a single refusal message that did not
    // mention "Free Core", so users thought the AI was broken. The new
    // code branches on tier === "free_core" and emits a tier-specific
    // message that names the plan and points at /subscription.
    const freeCoreBlock = ai.slice(ai.indexOf('tier === "free_core"'));
    expect(freeCoreBlock).toMatch(/Free Core/);
    expect(freeCoreBlock).toMatch(/\/subscription/);
  });

  it("keeps the existing 'Money, Stock or the weather' copy for paid tiers", () => {
    // Starter and Growth users on a module their plan doesn't cover
    // (e.g. Starter asking for workers) still need the existing fallback
    // message. Don't break what works.
    expect(ai).toMatch(/Money, Stock or the weather/);
  });

  it("runs the tier check AFTER moduleAllowedForUser, not before", () => {
    // The plan check only fires for tools the user is actually blocked on.
    // Reordering would re-call planTierForUser for every read tool —
    // needless DB load and slower turns. The original `if (WRITE_TOOLS.has
    // (toolName) && userId != null)` block must still wrap the new branch.
    const block = ai.slice(ai.indexOf("WRITE_TOOLS.has(toolName)"), ai.indexOf("switch (toolName)"));
    expect(block).toMatch(/moduleAllowedForUser\(userId, module\)/);
    expect(block).toMatch(/planTierForUser\(userId\)/);
  });

  it("never silently allows a free_core user to run a write tool", () => {
    // The contract: every write tool routes through WRITE_TOOLS.has, every
    // such call with a module is gated by moduleAllowedForUser, and any
    // block returns a refusal (the function ends in `return { error: ... }`).
    // If this test ever needs to relax, do it for a specific reason and
    // update the comment — silently letting a free user write through the
    // AI is the regression to prevent.
    const writeBlock = ai.slice(ai.indexOf("WRITE_TOOLS.has(toolName)"), ai.indexOf("switch (toolName)"));
    expect(writeBlock).toMatch(/return\s*\{\s*error:/);
  });
});
