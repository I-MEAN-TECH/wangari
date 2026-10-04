/**
 * The stream must always end with a sentence.
 *
 * Two ways out of the agent loop do not send one: the step budget runs out
 * mid-job, or the provider fails between two tool calls. In both cases the
 * tool feed is already scrolling past on the farmer's screen, so silence is
 * indistinguishable from a frozen app — and a farmer watching an app hang
 * does not try a second time.
 *
 * This is the difference between "Wangari got two thirds of the way" and
 * "the app broke", so it is held in place here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src", "routes", "ai.ts"), "utf8");

/** The block that runs after the loop, before `done` is sent. */
const closure = src.slice(src.indexOf("if (!answered) {") - 900);
const stream = src.slice(src.indexOf('router.post("/stream"'));

describe("a farmer is never left with tools and no answer", () => {
  it("tracks whether a sentence was ever sent", () => {
    expect(src).toMatch(/let answered = false/);
    expect(src).toMatch(/send\("message", \{ content: text \}\);\s*answered = true;/);
  });

  it("closes the stream with a message when nothing was said", () => {
    expect(closure).toMatch(/if \(!answered\) \{[\s\S]*?send\("message"/);
  });

  it("says so plainly when the provider could not be reached at all", () => {
    // No tools and no text means the model never answered. Telling the
    // farmer "I could not reach my thinking service" is honest; an empty
    // bubble is not.
    expect(src).toContain("I could not reach my thinking service");
  });

  it("reports what it actually did, and what did not go through", () => {
    // Composed from the real tool results, never invented.
    expect(src).toMatch(/const done = actions\.filter\(\(a\) => a\.ok\)/);
    expect(src).toMatch(/const failed = actions\.filter\(\(a\) => !a\.ok\)/);
    expect(src).toContain("This did not go through:");
  });

  it("tells the farmer why it stopped when the step budget ran out", () => {
    // Otherwise the farmer assumes the answer is complete when it is not.
    expect(src).toContain("that was as far as I could get in one go");
  });

  it("still sends `done` after the closing message", () => {
    const msg = closure.indexOf('send("message"');
    const done = closure.indexOf('send("done"');
    expect(msg).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(msg);
  });

  it("does not invent a message when the farmer closed the tab", () => {
    // Writing to a closed connection is pointless and can throw, so the
    // abort guard has to come first.
    const abortGuard = closure.lastIndexOf("if (aborted)");
    expect(abortGuard).toBeGreaterThan(-1);
    expect(abortGuard).toBeLessThan(closure.indexOf("if (!answered)"));
    expect(stream).toMatch(/if \(aborted\) \{\s*res\.end\(\);\s*return;\s*\}/);
  });
});