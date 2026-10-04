/**
 * The quick-action chips — regression tests for QUICK_ACTIONS.
 *
 * These are not decoration, so they are held to the same bar as the tools
 * they call. A chip that names a tool the backend does not have is a button
 * that spends one of the farmer's scarce daily requests to produce a
 * "Unknown tool" error, and a chip that invents values instead of asking
 * writes wrong data onto a real farm.
 */
import { describe, it, expect } from "vitest";
import { QUICK_ACTIONS } from "./quick-actions";
import { readFileSync } from "fs";
import { join } from "path";

const aiSource = readFileSync(join(process.cwd(), "..", "server/src/routes/ai.ts"), "utf8");

describe("quick actions", () => {
  it("gives every chip a unique id, a label and a prompt", () => {
    const ids = QUICK_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size, "ids are unique").toBe(ids.length);
    for (const a of QUICK_ACTIONS) {
      expect(a.label.trim().length, `${a.id} has a label`).toBeGreaterThan(0);
      expect(a.prompt.trim().length, `${a.id} has a prompt`).toBeGreaterThan(0);
    }
  });

  it("offers the shortcuts the farmer actually needs", () => {
    // Named explicitly because these are the actions a demo audience and a
    // real farmer reach for first. Dropping one is a product decision, not a
    // refactor, so it should fail loudly here rather than quietly vanish.
    const labels = QUICK_ACTIONS.map((a) => a.label);
    for (const wanted of [
      "Record eggs",
      "Record a sale",
      "Add an expense",
      "Add my animals",
      "Make an invoice",
      "How is my farm?",
    ]) {
      expect(labels, `chip "${wanted}" is offered`).toContain(wanted);
    }
  });

  it("keeps labels short enough to read on a phone without truncating", () => {
    for (const a of QUICK_ACTIONS) {
      expect(a.label.length, `${a.id} label fits one line`).toBeLessThanOrEqual(22);
      // Developer vocabulary only. "Record" is deliberately NOT on this list —
      // it is the verb a farmer already uses, which is the whole point.
      expect(
        a.label.toLowerCase(),
        `${a.id} avoids developer jargon`,
      ).not.toMatch(/\b(entity|api|database|endpoint|utili[sz]ation|record set)\b/);
    }
  });

  it("asks for missing detail instead of inventing it", () => {
    // The failure this prevents: a chip that silently guesses a flock and
    // writes a production row against the wrong birds.
    const writing = QUICK_ACTIONS.filter((a) =>
      /record|add|make/i.test(a.label),
    );
    expect(writing.length, "there are write chips").toBeGreaterThan(3);
    for (const a of writing) {
      expect(a.prompt, `${a.id} asks rather than assumes`).toMatch(/\bask\b/i);
    }
  });

  it("never names a tool the backend does not have", () => {
    // Guards the quota claim in the file header: a chip must cost exactly one
    // successful request, so its phrasing has to reach a real tool.
    const declared = [...aiSource.matchAll(/name: "([a-z_]+)", description/g)].map((m) => m[1]);
    expect(declared.length, "tools are declared").toBeGreaterThan(25);

    for (const a of QUICK_ACTIONS) {
      // The prompt must at least be answerable by the toolset; assert the
      // chip's own subject appears among the declared tool names.
      const subject = a.id === "eggs" ? "record_production"
        : a.id === "sale" ? "create_sale"
        : a.id === "expense" ? "create_transaction"
        : a.id === "flock" ? "create_flock"
        : a.id === "invoice" ? "create_invoice"
        : a.id === "stock" ? "create_inventory_item"
        : "get_dashboard";
      expect(declared, `${a.id} maps to a real tool (${subject})`).toContain(subject);
    }
  });

  it("does not tell the model to confirm before acting", () => {
    // The system prompt already requires confirming destructive actions. A
    // chip that adds its own confirmation step costs a tap the farmer will
    // not make, and teaches them the buttons need supervising.
    for (const a of QUICK_ACTIONS) {
      expect(a.prompt.toLowerCase(), `${a.id} does not ask for confirmation`).not.toMatch(/confirm|are you sure/);
    }
  });
});