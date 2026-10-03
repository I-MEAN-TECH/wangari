/**
 * Read-through cache — "I saved my milk, now show me my numbers."
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The offline *write* queue has existed for a while and works: a farmer with no
 * signal saves a delivery, sees success, and the write replays when signal
 * returns, protected server-side by `SyncedWrite` idempotency.
 *
 * But half of offline-first was never built, and it is the half the farmer
 * actually notices. Open Deliveries with no signal and the screen is EMPTY —
 * so the farmer concludes the record was lost, even though it is safely queued
 * and will sync. The write half is invisible; the read half tells a lie. That
 * is worse than having no offline support at all, because it destroys trust in
 * the record the farmer just made.
 *
 * So: keep the last good response per GET path on the device, serve it when the
 * network fails, and label its age in plain words. No server change, no schema
 * change, no sync conflict to reason about — the server stays the only source of
 * truth, and the cache is strictly a fallback.
 *
 * One rule that matters more than the caching: **never present stale data as
 * fresh.** If we cannot say when it was last true, we must not show it at all.
 */

const CACHE_PREFIX = "wangari_cache_v1:";
const MAX_ENTRIES = 60; // generous for one farmer's screens, bounded for a cheap phone

export interface CacheEntry<T = unknown> {
  data: T;
  /** Epoch ms when this was fetched from the server. */
  at: number;
}

/** Storage-key segment for the current user, so one shared handset cannot show
 *  the previous owner their farm's numbers. Written by `setUser()` in
 *  auth-client and cleared by `removeToken()` — a shared handset is a
 *  documented reality in this market, not an edge case, and a farmer handing
 *  their phone to the next person must not leak the first person's milk money. */
function userKey(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const raw = window.localStorage.getItem("wangari_user_id");
    if (raw) return raw;
  } catch {
    /* storage blocked — fall through */
  }
  return "anon";
}

const keyFor = (path: string) => `${CACHE_PREFIX}${userKey()}:${path}`;

/** Bound the cache so a long-lived session on a 1GB phone cannot fill it. */
function evictIfFull() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length < MAX_ENTRIES) return;
    // Drop the oldest entries first.
    const dated = keys
      .map((k) => {
        try {
          const raw = localStorage.getItem(k);
          return { k, at: raw ? (JSON.parse(raw) as CacheEntry).at ?? 0 : 0 };
        } catch {
          return { k, at: 0 };
        }
      })
      .sort((a, b) => a.at - b.at);
    for (const { k } of dated.slice(0, Math.ceil(MAX_ENTRIES / 4))) {
      localStorage.removeItem(k);
    }
  } catch {
    /* storage blocked — caching is best-effort */
  }
}

export function cacheSet<T>(path: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(keyFor(path), JSON.stringify({ data, at: Date.now() } satisfies CacheEntry<T>));
    evictIfFull();
  } catch {
    // Quota exceeded, or private browsing. Caching is best-effort and must
    // never surface as an error to a farmer who is trying to record milk.
  }
}

export function cacheGet<T>(path: string): CacheEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyFor(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    // A corrupt entry is worse than no entry: serving garbage as the farmer's
    // numbers is the one failure mode this whole layer must never have.
    if (!parsed || typeof parsed !== "object" || !("data" in parsed) || !Number.isFinite(parsed.at)) {
      localStorage.removeItem(keyFor(path));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Drop every cached entry. Called on sign-out.
 *
 * Deliberately removes ALL users' entries, not just the current one. On a
 * shared handset the previous owner's numbers must not survive on the device
 * for whoever signs in next — and once we have deleted the sign-out marker we
 * can no longer tell which entries were whose, so "clear everything" is the
 * only safe reading.
 */
export function cacheClear(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    /* best-effort */
  }
}

// ── pure presentation helpers (tested; no storage, no clock) ─────────────────

/**
 * "How stale is this?" in the words a farmer would use.
 *
 * Deliberately coarse. A farmer does not need "4 minutes 12 seconds"; they need
 * to know whether this is today's picture or last week's.
 */
export function freshnessLabel(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "just now";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Whether a cached entry is old enough that we should stop calling it a
 * current picture.
 *
 * Beyond a week it is a historical record, not "your numbers" — showing it
 * without a stronger warning would be a quiet lie. Two days is chosen because
 * it is longer than any plausible gap between a farmer's own visits, so
 * anything fresher is genuinely "what I saw last time".
 */
export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;
export const ABANDON_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function classifyCacheAge(ageMs: number): "fresh" | "stale" | "abandoned" {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "fresh";
  if (ageMs >= ABANDON_AFTER_MS) return "abandoned";
  if (ageMs >= STALE_AFTER_MS) return "stale";
  return "fresh";
}

export interface ReadResult<T> {
  data: T | null;
  source: "network" | "cache" | "none";
  /** How old the served data is, or null when it came from the network. */
  ageMs: number | null;
  /** Plain-language age, or null when the data is current. */
  label: string | null;
  age: "fresh" | "stale" | "abandoned" | "none";
}

/**
 * The whole read path, as one pure decision. This is the function the tests
 * actually pin, because "did we show the farmer a lie?" is the only question
 * that matters here.
 *
 * The rule it encodes: **prefer the network, fall back to the cache, and never
 * let cached data travel without its age attached.** A cached payload is served
 * even when it is ancient — an empty screen is what taught us that offline
 * support was not really there — but it arrives labelled, and `age` escalates
 * so the caller can warn harder as it gets older.
 */
export function resolveRead<T>(
  network: { ok: true; data: T } | { ok: false },
  cached: CacheEntry<T> | null,
  now: number
): ReadResult<T> {
  if (network.ok) {
    return { data: network.data, source: "network", ageMs: null, label: null, age: "fresh" };
  }

  if (cached) {
    const ageMs = Math.max(0, now - cached.at);
    return {
      data: cached.data,
      source: "cache",
      ageMs,
      label: freshnessLabel(ageMs),
      age: classifyCacheAge(ageMs),
    };
  }

  return { data: null, source: "none", ageMs: null, label: null, age: "none" };
}