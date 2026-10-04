/**
 * Every door into a reply must create the conversation.
 *
 * run() is reached three ways: the farmer types and sends, taps a
 * quick-action chip, or hits retry. The conversation id was created in only
 * the first of those, so a farmer whose very first action was tapping
 * "Record eggs" — which is exactly what the empty-state chips invite — got no
 * conversation, nothing was written, and the work vanished when they closed
 * the app.
 *
 * The bug is invisible from the store's tests, because the store works: it
 * was never asked to save. So this file reads the page and checks the
 * guarantee sits inside run(), where a future caller cannot forget it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(process.cwd(), "src", "app", "(dashboard)", "ai", "page.tsx"),
  "utf8",
);

/** The body of run(), up to the next top-level declaration. */
const runBody = src.slice(
  src.indexOf("const run = React.useCallback"),
  src.indexOf("const stop ="),
);

describe("a reply always belongs to a conversation", () => {
  it("creates the conversation inside run, not in a caller", () => {
    // In a caller it is a promise, not a guarantee: the next person to add a
    // button that starts a run gets a chat that silently never saves.
    expect(runBody).toMatch(/setConversationId\(\(id\) => id \?\? newConversationId\(\)\)/);
  });

  it("is created only once, and never replaced mid-conversation", () => {
    // Replacing the id would file this reply under a new conversation and
    // orphan everything the farmer already said.
    expect(runBody).toContain("id ?? newConversationId()");
    expect(runBody).not.toMatch(/setConversationId\(newConversationId\(\)\)/);
  });

  it("covers every caller, not just the send button", () => {
    const doors = (src.match(/\brun\(/g) || []).length;
    // run is declared once and called from send, quickSend and retry.
    expect(doors).toBeGreaterThanOrEqual(4);
    expect(src).toContain("await run(history, action.prompt)");
    expect(src).toContain("run(history, lastUser.content)");
  });

  it("saves as the farmer talks, not on the way out", () => {
    // Closing the tab, a crash or a flat battery all skip an unmount
    // handler, so an unmount save loses the last answer.
    const effect = src.slice(
  src.indexOf("React.useEffect(() => {\n    if (!conversationId) return;"),
  src.indexOf("const startNew"),
);
    expect(effect).toContain("if (turns.some((t) => t.streaming)) return;");
    expect(effect).toContain("if (!turns.some((t) => t.content.trim())) return;");
    // And it must actually re-run. Guards behind `[]` are decoration: the
    // effect fires once on mount, sees an empty chat, and never saves again.
    expect(effect).toContain("}, [turns, conversationId]);");
  });

  it("does not save a blank conversation that never became one", () => {
    // The id is only minted once a run starts, so an untouched chat stays
    // out of the panel entirely.
    expect(src).toMatch(/const \[conversationId, setConversationId\] = React\.useState<string \| null>\(null\)/);
  });
});