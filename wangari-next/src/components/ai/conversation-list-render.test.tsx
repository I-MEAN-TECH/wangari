/**
 * The conversations panel, rendered.
 *
 * The store tests prove conversations are saved; they cannot prove the farmer
 * can SEE them, and a panel that renders an empty rail while the data is
 * there is the exact failure this feature exists to prevent.
 *
 * renderToStaticMarkup: no DOM, which is the `node` environment.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ConversationList from "./conversation-list";
import { saveConversation } from "@/lib/ai-conversations";

class FakeStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

beforeEach(() => {
  (globalThis as any).window = { localStorage: new FakeStorage() };
});

const render = (props: Partial<Parameters<typeof ConversationList>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ConversationList, {
      activeId: null,
      onOpen: () => {},
      onNew: () => {},
      ...props,
    } as Parameters<typeof ConversationList>[0]),
  );

describe("the conversations panel", () => {
  it("explains itself when there is nothing yet", () => {
    // The panel's only job when empty is to say how it gets filled.
    const html = render();
    expect(html).toContain("Past conversations");
    expect(html).toContain("Your conversations will appear here");
  });

  it("offers a way to start a new conversation", () => {
    expect(render()).toContain("New conversation");
  });

  it("lists a past conversation under the farmer's own words", () => {
    saveConversation("c1", [
      { id: "u1", role: "user", content: "add a flock called Sasso Kenya" },
      { id: "a1", role: "assistant", content: "Added 200 birds." },
    ]);
    const html = render({ activeId: "c1" });
    expect(html).toContain("add a flock called Sasso Kenya");
    expect(html).toContain("Past conversations");
  });

  it("marks which conversation is open, so the farmer can see where they are", () => {
    saveConversation("c1", [{ id: "u1", role: "user", content: "first question" }]);
    saveConversation("c2", [{ id: "u2", role: "user", content: "second question" }]);
    const html = render({ activeId: "c2" });
    // Exactly one row is marked current; two would mean the farmer cannot
    // tell which chat they are in.
    expect((html.match(/aria-current="true"/g) || []).length).toBe(1);
    expect(html).toContain("second question");
  });

  it("gives every row a delete button that names it", () => {
    saveConversation("c1", [{ id: "u1", role: "user", content: "the flock one" }]);
    const html = render();
    // An unlabelled trash button is a mystery button to a screen reader.
    expect(html).toContain("aria-label=\"Delete the conversation about the flock one\"");
  });

  it("shows a close button only when it can be closed", () => {
    expect(render()).not.toContain("Close the conversation list");
    expect(render({ onClose: () => {} })).toContain("Close the conversation list");
  });
});