/**
 * SSE parsing — regression tests for lib/ai-stream.ts.
 *
 * The behaviour guarded here is chunk-boundary handling. A network chunk
 * can split a frame anywhere, including inside `data: {"content":"...`,
 * and the failure mode is silent: the tool result simply never appears,
 * so the farmer is told an action was taken when nothing happened.
 */
import { describe, it, expect } from "vitest";
import { parseSSE } from "./ai-stream";

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("parseSSE", () => {
  it("reads a single event", () => {
    const { events } = parseSSE(frame("done", { steps: 2, truncatedByBudget: false }));
    expect(events).toEqual([{ type: "done", steps: 2, truncatedByBudget: false }]);
  });

  it("reads several events from one buffer", () => {
    const buf = frame("start", { provider: "unorouter", model: "m" })
      + frame("message", { content: "Hello" })
      + frame("done", { steps: 0, truncatedByBudget: false });
    const { events } = parseSSE(buf);
    expect(events.map((e) => e.type)).toEqual(["start", "message", "done"]);
  });

  it("holds back an incomplete frame instead of dropping it", () => {
    // THE regression: the buffer ends mid-frame because the chunk did.
    const complete = frame("tool_end", { tool: "create_sale", ok: true, result: "Recorded" });
    const cut = complete.slice(0, 30);
    const { events, rest } = parseSSE(cut);
    expect(events).toEqual([]);
    expect(rest).toBe(cut);
  });

  it("recovers the held frame once the rest arrives", () => {
    const complete = frame("tool_end", { tool: "create_sale", ok: true, result: "Recorded" });
    const first = parseSSE(complete.slice(0, 30));
    const second = parseSSE(first.rest + complete.slice(30));
    expect(second.events).toEqual([
      { type: "tool_end", tool: "create_sale", ok: true, result: "Recorded" },
    ]);
  });

  it("survives a chunk boundary landing inside the JSON payload", () => {
    const data = { type: "message", content: "Recorded 200 eggs from flock 1 today" };
    const complete = frame("message", data);
    const mid = Math.floor(complete.length / 2);
    const a = parseSSE(complete.slice(0, mid));
    const b = parseSSE(a.rest + complete.slice(mid));
    expect([...a.events, ...b.events]).toEqual([data]);
  });

  it("handles CRLF line endings from a proxy", () => {
    const buf = `event: message\r\ndata: {"content":"hi"}\r\n\r\n`;
    expect(parseSSE(buf).events).toEqual([{ type: "message", content: "hi" }]);
  });

  it("ignores comments and keep-alives rather than inventing events", () => {
    expect(parseSSE(": keep-alive\n\n").events).toEqual([]);
    expect(parseSSE("\n\n").events).toEqual([]);
  });

  it("joins a multi-line data field", () => {
    const buf = 'event: message\ndata: {"type":"message",\ndata: "content":"hi"}\n\n';
    const { events } = parseSSE(buf);
    expect(events).toEqual([{ type: "message", content: "hi" }]);
  });

  it("reports unreadable JSON as an error instead of throwing", () => {
    // A silent failure here would look to the farmer like Wangari just
    // stopped talking, with nothing on screen to explain why.
    const { events } = parseSSE("event: message\ndata: {not json}\n\n");
    expect(events).toEqual([
      { type: "error", message: "Wangari sent something unreadable." },
    ]);
  });

  it("returns nothing for an empty buffer", () => {
    expect(parseSSE("")).toEqual({ events: [], rest: "" });
  });
});
