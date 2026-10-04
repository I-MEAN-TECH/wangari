"use client";

/**
 * What Wangari is doing RIGHT NOW, anywhere in the app.
 *
 * The reason this exists: her face is no longer only inside the AI panel.
 * Once her avatar is the module's icon and sits at the top of the Home
 * screen, the farmer sees her without opening the panel — so the face has
 * to mean the same thing everywhere it appears. A living avatar beside a
 * dead panel is worse than no avatar at all: it teaches the farmer that
 * her expressions are decoration.
 *
 * So the AI page publishes what she is doing here, and every other surface
 * (the module icon, the Home header) subscribes. One source of truth, so
 * the icon cannot say "thinking" while the panel says "idle".
 *
 * Deliberately a plain module-level store rather than a React context.
 * The publisher is a leaf page, the consumers are leaves, and nothing in
 * between needs to re-render when it changes — a provider would put a
 * re-render on the whole dashboard shell for a 24px icon to blink.
 */

import { useSyncExternalStore } from "react";
import type { AvatarState } from "@/components/ai/wangari-avatar";

/** The same vocabulary the AI panel already uses. */
export type Presence =
  | "idle"
  | "typing"
  | "listening"
  | "reasoning"
  | "working"
  | "waiting"
  | "speaking"
  | "done"
  | "error";

/**
 * What each state looks like on the avatar itself.
 *
 * `done` folds into `idle` on purpose: a farmer who just recorded a week
 * of sales does not want confetti, and it means there is exactly one
 * resting look in the whole product.
 */
export const PRESENCE_STATE: Record<Presence, AvatarState> = {
  idle: "idle",
  typing: "typing",
  listening: "listening",
  reasoning: "reasoning",
  working: "working",
  // Waiting keeps the thinking animation on purpose. She IS still working -
  // the provider is simply not ready yet - and an avatar that goes still here
  // reads as "she gave up", which is exactly the wrong thing to show someone
  // who is deciding whether to keep waiting.
  waiting: "reasoning",
  speaking: "speaking",
  done: "idle",
  error: "error",
};

/**
 * One short line per state, for the surfaces too small for a label.
 * These are what a farmer reads, so they avoid the word "AI" entirely —
 * the point of the rename is that she is a person on their farm, not a
 * feature of the software.
 */
export const PRESENCE_LINE: Record<Presence, string> = {
  idle: "Ask me about your farm",
  typing: "Tell me what you need",
  listening: "Listening",
  reasoning: "Thinking",
  working: "Working on your farm",
  // The time is added at the call site, from the server's own countdown. The
  // bare word here is the fallback when we do not know how long: still more
  // honest than silence, and still not a promise we cannot keep.
  waiting: "Waiting for a free slot",
  speaking: "Answering",
  done: "Done",
  error: "Something went wrong",
};

/**
 * One bare verb per state, for surfaces with no room for a sentence.
 *
 * This is the label that sits BESIDE her face while she works, inside the
 * conversation. It is separate from PRESENCE_LINE because a full sentence
 * there competes with the reply streaming in underneath it: "Wangari is
 * working on your farm" above a half-written paragraph reads as two
 * answers, and the farmer cannot tell which one is about their birds.
 *
 * A verb alone is enough next to a face that is visibly moving.
 */
export const PRESENCE_VERB: Record<Presence, string> = {
  idle: "",
  typing: "Getting ready",
  listening: "Listening",
  reasoning: "Thinking",
  working: "Working",
  // Replaced wholesale by the countdown when the server sent one. This is what
  // shows in the moment before it does.
  waiting: "Waiting",
  speaking: "Answering",
  done: "Done",
  error: "Something went wrong",
};

/** Only the states worth announcing to a farmer who is NOT looking at her. */
const ANNOUNCED: ReadonlySet<Presence> = new Set<Presence>([
  "reasoning",
  "working",
  "waiting",
  "speaking",
  "error",
]);

/**
 * What Wangari says while waiting out the provider's free-tier limit.
 *
 * Deliberately names the cause. "Still working" after a minute invites the
 * farmer to conclude the app has hung; naming a queue tells them there is a
 * line and they are in it, and a line ends.
 *
 * Rounded up, and never below 5s: saying "about 1 second" and then taking 40
 * is worse than the silence we replaced.
 */
export function waitLine(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return PRESENCE_LINE.waiting;
  }
  const s = Math.max(5, Math.ceil(seconds));
  return `Waiting — about ${s < 60 ? `${s}s` : `${Math.ceil(s / 60)} min`}`;
}

let current: Presence = "idle";
const listeners = new Set<() => void>();

/** Publish what Wangari is doing. Called by the AI page as it streams. */
export function setPresence(next: Presence): void {
  if (next === current) return;
  current = next;
  // A copy, not the set itself: a listener that unsubscribes while being
  // notified would otherwise mutate the collection mid-iteration.
  for (const fn of [...listeners]) fn();
}

/** Reset on unmount so a closed panel does not leave her stuck mid-thought. */
export function clearPresence(): void {
  setPresence("idle");
}

/** Subscribe to every change. Exported so the store is testable without a DOM. */
export function subscribePresence(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The state right now. Exported for the same reason. */
export function getPresence(): Presence {
  return current;
}

const subscribe = subscribePresence;
const getSnapshot = getPresence;

/**
 * Subscribe to Wangari's state.
 *
 * Returns `"idle"` on the server and for the very first client render, so
 * both trees agree; the real value arrives in the same commit as any other
 * hydration-safe store.
 */
export function useWangariPresence(): Presence {
  return useSyncExternalStore(subscribe, getSnapshot, () => "idle" as Presence);
}

/** Whether this state is worth showing a farmer who cannot see her face. */
export function isAnnounced(p: Presence): boolean {
  return ANNOUNCED.has(p);
}