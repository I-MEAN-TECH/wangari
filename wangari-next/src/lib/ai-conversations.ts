"use client";

/**
 * Past conversations, kept on the phone.
 *
 * ── why this exists ──────────────────────────────────────
 * Wangari asked the farmer something, they answered, and then they closed
 * the app to go and check a cage. When they came back the whole thing was
 * gone — and worse, gone without explanation, so they assumed Wangari had
 * forgotten. The work was not lost (the records are in the database); the
 * *conversation* was. That is what this stores.
 *
 * ── why on the phone, not the server ──────────────────────
 * A farmer needs their conversation back after closing the app, which is a
 * one-device promise. Server-side storage would add a table, three routes
 * and a deploy for something that is one key/value pair today — and it would
 * make every keystroke a network call in the one screen where the farmer is
 * already waiting on the network.
 *
 * The honest limit: this follows the device, not the farmer. Clearing site
 * data, or asking for the same chat on a second phone, will not find it.
 * Storing them server-side is the next step, not this one.
 */

import type { Turn } from "@/components/ai/chat-panel";

export interface Conversation {
  id: string;
  /** What the farmer actually asked, trimmed to something a list can show. */
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: Turn[];
}

const KEY = "wangari.conversations.v1";

/**
 * How many to keep.
 *
 * Unbounded localStorage is a crash waiting to happen: Safari caps it around
 * 5MB and then every write throws. Old chats are also the ones nobody opens,
 * so the tail is dropped rather than the head.
 */
const MAX = 50;

/** Never persist a half-streamed reply or a transient failure. */
function cleanTurns(turns: Turn[]): Turn[] {
  return turns
    .filter((t) => typeof t.content === "string" && t.content.trim().length > 0)
    .map((t) => ({ ...t, streaming: false }));
}

/**
 * The title is the farmer's own words.
 *
 * Their first message is what they will recognise; anything we invent
 * ("Untitled", a date) makes the list harder to scan than the chat itself.
 */
export function titleFrom(turns: Turn[]): string {
  const first = turns.find((t) => t.role === "user");
  const text = (first?.content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "New conversation";
  return text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text;
}

/** localStorage is absent during SSR and can throw when the quota is hit. */
function read(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Conversation =>
        c && typeof c.id === "string" && Array.isArray(c.turns) && typeof c.updatedAt === "number",
    );
  } catch {
    // Corrupt or unreadable: an empty list is recoverable, a crash is not.
    return [];
  }
}

function write(list: Conversation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Out of quota or blocked. Losing history is survivable; breaking the
    // chat in the middle of an answer is not.
  }
}

export function newConversationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Newest first — the chat they were last in belongs at the top. */
export function listConversations(): Conversation[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | null {
  return read().find((c) => c.id === id) ?? null;
}

export function saveConversation(id: string, turns: Turn[]): Conversation | null {
  const cleaned = cleanTurns(turns);
  // An empty chat is not a conversation. Saving one would leave a row the
  // farmer cannot open into anything.
  if (cleaned.length === 0) return null;

  const now = Date.now();
  const list = read();
  const existing = list.find((c) => c.id === id);
  const next: Conversation = {
    id,
    title: existing?.title && existing.turns.length ? existing.title : titleFrom(cleaned),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    turns: cleaned,
  };

  const kept = [next, ...list.filter((c) => c.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt);
  write(kept.slice(0, MAX));
  return next;
}

export function deleteConversation(id: string): void {
  write(read().filter((c) => c.id !== id));
}

/** "2 minutes ago" — the farmer's clock, not a timestamp to decode. */
export function relativeTime(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? "Yesterday" : `${d} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}