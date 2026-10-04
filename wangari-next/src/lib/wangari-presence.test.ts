/**
 * Wangari's shared presence — regression tests for lib/wangari-presence.ts.
 *
 * The behaviour that matters is not the store, which is small. It is that ONE
 * state reaches every surface. Her face is now the module's icon and stands
 * at the top of the Home screen, while the only thing that knows what she is
 * doing is the AI page. If publishing were lossy, stale, or re-render-happy,
 * the farmer would see the icon idle while the panel beside it was mid-task —
 * and would be right to stop believing the face.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setPresence,
  clearPresence,
  getPresence,
  subscribePresence,
  PRESENCE_STATE,
  PRESENCE_LINE,
  PRESENCE_VERB,
  isAnnounced,
  waitLine,
  type Presence,
} from "./wangari-presence";

beforeEach(() => {
  clearPresence();
});

describe("presence store", () => {
  it("starts idle, so an app that never opens Wangari shows her at rest", () => {
    expect(getPresence()).toBe("idle");
  });

  it("does not notify when the state is unchanged", () => {
    let calls = 0;
    const off = subscribePresence(() => {
      calls++;
    });
    setPresence("working");
    expect(calls).toBe(1);
    // One answer streams many tool_start/tool_end pairs, and the presence
    // rarely changes between them. Notifying anyway would repaint the sidebar
    // icon and the Home header dozens of times for a single reply.
    setPresence("working");
    setPresence("working");
    expect(calls).toBe(1);
    off();
  });

  it("notifies again once the state really changes", () => {
    const seen: Presence[] = [];
    const off = subscribePresence(() => seen.push(getPresence()));
    setPresence("reasoning");
    setPresence("working");
    expect(seen).toEqual(["reasoning", "working"]);
    off();
  });

  it("survives a listener unsubscribing during its own notification", () => {
    const calls: string[] = [];
    // React unmounts components from inside their own subscriber, which
    // mutates the listener set while it is being iterated.
    let offB = () => {};
    const offA = subscribePresence(() => {
      calls.push("a");
      offB();
    });
    offB = subscribePresence(() => {
      calls.push("b");
    });
    expect(() => setPresence("speaking")).not.toThrow();
    expect(calls).toEqual(["a", "b"]);
    offA();
    offB();
  });

  it("stops notifying a listener that unsubscribed", () => {
    let calls = 0;
    const off = subscribePresence(() => {
      calls++;
    });
    off();
    setPresence("working");
    expect(calls).toBe(0);
  });

  it("clearPresence returns her to rest so a closed panel cannot strand her", () => {
    setPresence("working");
    clearPresence();
    expect(getPresence()).toBe("idle");
  });
});

describe("presence to avatar state", () => {
  it("maps every state onto a real avatar state", () => {
    const valid = new Set([
      "idle", "listening", "typing", "reasoning", "working", "speaking", "error",
    ]);
    for (const p of Object.keys(PRESENCE_STATE) as Presence[]) {
      expect(valid.has(PRESENCE_STATE[p]), `${p} maps to a real avatar state`).toBe(true);
    }
  });

  it("folds done into idle so there is exactly one resting look", () => {
    // Confetti after a farmer records a week of sales is not welcome, and a
    // second "finished" pose would make the face mean nothing.
    expect(PRESENCE_STATE.done).toBe("idle");
    expect(PRESENCE_STATE.idle).toBe("idle");
  });

  it("covers every presence with a line a farmer can read", () => {
    for (const p of Object.keys(PRESENCE_STATE) as Presence[]) {
      expect(PRESENCE_LINE[p]?.trim().length, `${p} has a line`).toBeGreaterThan(0);
    }
  });

  it("never says the word AI to the farmer", () => {
    // The rename only means something if her own voice does not reintroduce
    // the word we just removed from the module name.
    for (const [p, line] of Object.entries(PRESENCE_LINE)) {
      expect(/\bai\b/i.test(line), `${p} avoids "AI"`).toBe(false);
    }
  });

  it("only announces states worth interrupting a farmer for", () => {
    expect(isAnnounced("idle")).toBe(false);
    expect(isAnnounced("typing")).toBe(false);
    expect(isAnnounced("working")).toBe(true);
    expect(isAnnounced("reasoning")).toBe(true);
    expect(isAnnounced("error")).toBe(true);
  });
});

describe("the verb shown beside her while she works", () => {
  it("is one word a farmer can read at a glance", () => {
    // The bare green dot this replaced said only "something is happening".
    for (const p of Object.keys(PRESENCE_STATE) as Presence[]) {
      expect(PRESENCE_VERB[p], `${p} has a verb`).toBeTypeOf("string");
    }
    expect(PRESENCE_VERB.working).toBe("Working");
    expect(PRESENCE_VERB.reasoning).toBe("Thinking");
    expect(PRESENCE_VERB.speaking).toBe("Answering");
  });

  it("says nothing while she is at rest, so the row disappears entirely", () => {
    // A row with an avatar and no word is just a floating face. The
    // indicator must vanish when there is nothing to report.
    expect(PRESENCE_VERB.idle).toBe("");
  });

  it("never says the word AI", () => {
    for (const [p, verb] of Object.entries(PRESENCE_VERB)) {
      expect(/\bai\b/i.test(verb), `${p} avoids "AI"`).toBe(false);
    }
  });
});
/**
 * The one-minute wait.
 *
 * Measured live on the free tier: one agentic farm question took 84,388ms
 * because the provider allows one request a minute and the turn spends two.
 * Almost all of that minute was silent, and a still avatar for 60 seconds
 * reads as a crashed app rather than a queue. These tests hold the wording
 * that closes that gap.
 */
describe("saying out loud that we are in a queue", () => {
  it("counts down using the server's own number", () => {
    expect(waitLine(45)).toBe("Waiting — about 45s");
  });

  it("never promises a second and then takes a minute", () => {
    // Rounding to "about 1s" and then running for 40 is worse than the
    // silence it replaced: the farmer learns not to believe the number.
    expect(waitLine(1)).toBe("Waiting — about 5s");
    expect(waitLine(0.2)).toBe("Waiting — about 5s");
  });

  it("switches to minutes rather than saying 400 seconds", () => {
    expect(waitLine(200)).toBe("Waiting — about 4 min");
  });

  it("still says something when the server has no number", () => {
    // `null` opensAt means no call has succeeded yet, so there is no window
    // to aim at. Silence here would be indistinguishable from the freeze.
    for (const bad of [null, undefined, 0, -5, Number.NaN] as const) {
      expect(waitLine(bad as number | null)).toBe(PRESENCE_LINE.waiting);
    }
  });

  it("keeps her thinking while she waits, rather than going still", () => {
    // An avatar that stops moving here tells the farmer she has given up.
    expect(PRESENCE_STATE.waiting).toBe(PRESENCE_STATE.reasoning);
    expect(PRESENCE_VERB.waiting).toBe("Waiting");
  });

  it("is worth announcing, because the icon is on the Home screen too", () => {
    expect(isAnnounced("waiting")).toBe(true);
  });
});
