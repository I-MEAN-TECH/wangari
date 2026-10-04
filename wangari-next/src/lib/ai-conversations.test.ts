/**
 * Conversation history on the phone.
 *
 * The promise this store makes is narrow and absolute: if a farmer closes
 * Wangari and comes back, the conversation is there. Everything below is
 * about the ways that promise quietly breaks — a half-streamed reply saved
 * as final text, a corrupt blob crashing the panel on open, unbounded growth
 * hitting the storage quota mid-answer.
 *
 * Runs in the `node` vitest environment, so there is no real localStorage.
 * The fake below is deliberately strict: it throws on quota, like the real
 * one does, because swallowing that is the behaviour under test.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  listConversations,
  saveConversation,
  getConversation,
  deleteConversation,
  titleFrom,
  newConversationId,
  relativeTime,
} from "./ai-conversations";
import type { Turn } from "@/components/ai/chat-panel";

const KEY = "wangari.conversations.v1";

class FakeStorage {
  map = new Map<string, string>();
  throwOnWrite = false;
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.throwOnWrite) throw new Error("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

let store: FakeStorage;

beforeEach(() => {
  store = new FakeStorage();
  (globalThis as any).window = { localStorage: store };
});

const user = (content: string, id = "u1"): Turn => ({ id, role: "user", content });
const bot = (content: string, id = "a1"): Turn => ({ id, role: "assistant", content });

describe("saving a conversation", () => {
  it("stores it and reads it back", () => {
    saveConversation("c1", [user("record 200 eggs"), bot("Done, 200 eggs recorded")]);
    expect(getConversation("c1")?.turns).toHaveLength(2);
    expect(listConversations()).toHaveLength(1);
  });

  it("refuses to save an empty chat", () => {
    // A row that opens into nothing is worse than no row: the farmer taps it
    // and gets a blank screen with no explanation.
    expect(saveConversation("c1", [])).toBeNull();
    expect(saveConversation("c2", [bot("")])).toBeNull();
    expect(listConversations()).toHaveLength(0);
  });

  it("never persists a half-streamed reply", () => {
    // A reply saved mid-stream is a sentence that stops mid-word, and the
    // farmer reads it as Wangari being cut off.
    saveConversation("c1", [
      user("hello"),
      { ...bot("She has 1 flock"), streaming: true },
    ]);
    const saved = getConversation("c1")!;
    expect(saved.turns.every((t) => !t.streaming)).toBe(true);
  });

  it("keeps the title from the farmer's first words", () => {
    saveConversation("c1", [user("how many flocks do I have"), bot("one")]);
    expect(getConversation("c1")?.title).toBe("how many flocks do I have");
  });

  it("keeps the title it was given instead of recomputing it", () => {
    // Re-titling on every save makes the list unreadable: rows churn under
    // the farmer's thumb while they are trying to tap one. Seeded directly,
    // because re-saving the same turns would produce the same title either
    // way and would pass against the very bug it is here to catch.
    store.map.set(
      KEY,
      JSON.stringify([
        {
          id: "c1",
          title: "Sasso flock",
          createdAt: 1,
          updatedAt: 1,
          turns: [{ id: "u1", role: "user", content: "old" }],
        },
      ]),
    );
    saveConversation("c1", [user("something else entirely"), bot("ok")]);
    expect(getConversation("c1")?.title).toBe("Sasso flock");
  });

  it("keeps the newest conversation first", () => {
    saveConversation("old", [user("yesterday")]);
    saveConversation("new", [user("today")]);
    expect(listConversations().map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("overwrites rather than duplicating on re-save", () => {
    saveConversation("c1", [user("hello")]);
    saveConversation("c1", [user("hello"), bot("hi")]);
    expect(listConversations()).toHaveLength(1);
    expect(getConversation("c1")?.turns).toHaveLength(2);
  });
});

describe("when storage misbehaves", () => {
  it("survives a quota error instead of breaking the chat", () => {
    // The farmer is mid-answer when this happens. Losing history is
    // survivable; an exception on every keystroke is not.
    store.throwOnWrite = true;
    expect(() => saveConversation("c1", [user("hello"), bot("hi")])).not.toThrow();
  });

  it("survives a corrupt blob and starts clean", () => {
    store.map.set(KEY, "{not json");
    expect(listConversations()).toEqual([]);
    expect(() => saveConversation("c1", [user("hello")])).not.toThrow();
  });

  it("survives a blob holding the wrong shape", () => {
    store.map.set(KEY, JSON.stringify([{ nope: true }, "string"]));
    expect(listConversations()).toEqual([]);
  });
});

describe("deleting", () => {
  it("removes only the chosen conversation", () => {
    saveConversation("c1", [user("one")]);
    saveConversation("c2", [user("two")]);
    deleteConversation("c1");
    expect(listConversations().map((c) => c.id)).toEqual(["c2"]);
  });

  it("is safe for a conversation that is already gone", () => {
    expect(() => deleteConversation("nope")).not.toThrow();
  });
});

describe("the title a farmer reads in the list", () => {
  it("is their own words, not a label we invented", () => {
    expect(titleFrom([user("how many flocks do I have?")])).toBe("how many flocks do I have?");
  });

  it("collapses a long question so the list still scans", () => {
    const title = titleFrom([user("a".repeat(120))]);
    expect(title.length).toBeLessThanOrEqual(43);
    expect(title.endsWith("…")).toBe(true);
  });

  it("never returns an empty title", () => {
    expect(titleFrom([])).toBe("New conversation");
    expect(titleFrom([bot("hello from me")])).toBe("New conversation");
  });
});

describe("ids and times", () => {
  it("gives two conversations different ids", () => {
    expect(newConversationId()).not.toBe(newConversationId());
  });

  it("describes when in words, not a timestamp to decode", () => {
    const now = Date.now();
    expect(relativeTime(now, now)).toBe("Just now");
    expect(relativeTime(now - 60_000, now)).toBe("1 minute ago");
    expect(relativeTime(now - 3 * 60_000, now)).toBe("3 minutes ago");
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe("2 hours ago");
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe("Yesterday");
    expect(relativeTime(now - 40 * 86_400_000, now)).toMatch(/ago|\d/);
  });
});