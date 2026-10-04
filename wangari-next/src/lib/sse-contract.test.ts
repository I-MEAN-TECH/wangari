/**
 * The server/client SSE contract — regression tests for lib/ai-stream.ts.
 *
 * The server (server/src/routes/ai.ts) emits these exact frames:
 *   start {provider, model}
 *   tool_start {tool, args, step}
 *   tool_end {tool, ok, result?, error?}
 *   message {content}
 *   done {steps, truncatedByBudget}
 *   error {message}
 *
 * These tests pin that contract to the client parser. The seam between the
 * two is where a mismatch shows up as an EMPTY BUBBLE — the farmer sends a
 * message, Wangari "thinks", and then nothing appears, with no error
 * anywhere to explain it. That is the single worst failure this feature has.
 */
import { describe, it, expect } from "vitest";
import { parseSSE, type StreamEvent } from "./ai-stream";

/** Build a frame exactly as the server's `send()` does. */
const send = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** A full run, in the order the agentic loop produces it. */
const FULL_RUN =
  send("start", { provider: "openrouter", model: "qwen/qwen3.8-27b:free" }) +
  send("tool_start", { tool: "get_dashboard", args: {}, step: 0 }) +
  send("tool_end", { tool: "get_dashboard", ok: true, result: "Income KES 120,000" }) +
  send("message", { content: "Your farm made KES 120,000 this month." }) +
  send("done", { steps: 1, truncatedByBudget: false });

/** Feed a wire through the parser in fixed-size chunks, as a network would. */
function parseInChunks(wire: string, size: number): StreamEvent[] {
  const events: StreamEvent[] = [];
  let buffer = "";
  for (let i = 0; i < wire.length; i += size) {
    buffer += wire.slice(i, i + size);
    const r = parseSSE(buffer);
    buffer = r.rest;
    events.push(...r.events);
  }
  return events;
}

describe("server/client SSE contract", () => {
  it("parses a whole run in order", () => {
    expect(parseSSE(FULL_RUN).events.map((e) => e.type)).toEqual([
      "start",
      "tool_start",
      "tool_end",
      "message",
      "done",
    ]);
  });

  it("survives ANY chunk size without losing an event", () => {
    // Every size from 1 byte upward, because a real network splits wherever
    // it likes. One byte at a time is the worst case and catches any
    // assumption that a whole frame arrives together.
    const reference = parseSSE(FULL_RUN).events.map((e) => e.type);
    for (let size = 1; size <= FULL_RUN.length; size++) {
      expect(parseInChunks(FULL_RUN, size).map((e) => e.type), `chunk size ${size}`).toEqual(
        reference,
      );
    }
  });

  it("delivers the reply text a farmer would read", () => {
    const message = parseInChunks(FULL_RUN, 13).find((e) => e.type === "message");
    expect(message).toEqual({
      type: "message",
      content: "Your farm made KES 120,000 this month.",
    });
  });

  it("delivers the tool result so the farmer can see the work", () => {
    const ended = parseInChunks(FULL_RUN, 7).find((e) => e.type === "tool_end");
    expect(ended).toMatchObject({ tool: "get_dashboard", ok: true, result: "Income KES 120,000" });
  });

  it("delivers the failure, not silence", () => {
    const failed = send("error", { message: "The connection dropped before Wangari finished." });
    expect(parseInChunks(failed, 9)).toEqual([
      { type: "error", message: "The connection dropped before Wangari finished." },
    ]);
  });

  it("preserves the budget-truncation flag the UI shows", () => {
    const truncated = send("done", { steps: 8, truncatedByBudget: true });
    const done = parseInChunks(truncated, 5).find((e) => e.type === "done");
    expect(done).toMatchObject({ steps: 8, truncatedByBudget: true });
  });

  it("handles a Swahili reply with no ASCII assumptions", () => {
    const sw = send("message", { content: "Umezaa mayai 200 kutoka kuku wa kwanza." });
    const got = parseInChunks(sw, 4).find((e) => e.type === "message");
    expect(got).toEqual({ type: "message", content: "Umezaa mayai 200 kutoka kuku wa kwanza." });
  });
});
