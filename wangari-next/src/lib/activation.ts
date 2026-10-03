/**
 * Activation ping — the client half of the funnel.
 *
 * We reordered this product because 5 of 8 farms had never recorded anything.
 * That was a one-off manual query, so the instinct to build more features and
 * skip instrumenting anything was strong. This is the fix, and it is
 * deliberately the smallest thing that could work: two network calls, one per
 * day, that nobody sees and nobody is blocked by.
 *
 * Three rules, all of which exist to stop the metric flattering us:
 *
 *  1. NEVER GO THROUGH THE OFFLINE WRITE QUEUE. `api.post` queues writes when
 *     offline, and a queued ping would replay days later — stamping "active"
 *     onto a day the farmer was not really using the app. That is precisely
 *     how a retention number becomes fiction. So this uses raw `fetch` and,
 *     if there is no signal, does nothing at all.
 *  2. ONCE PER UTC DAY, locally guarded. The server would dedupe anyway; this
 *     just stops us paying for the round trip.
 *  3. FIRE AND FORGET. Nothing awaits this, nothing catches into the farmer's
 *     workflow. If analytics is down, the milk still gets recorded.
 */

import { getToken } from "./auth-client";

const PING_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";
const GUARD_PREFIX = "wangari_activation_v1:";

export type ClientStage = "active" | "first_record";

const todayUtc = () => new Date().toISOString().slice(0, 10);

function alreadySent(stage: ClientStage): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(`${GUARD_PREFIX}${stage}`) === todayUtc();
  } catch {
    return false; // storage blocked — send it rather than silently never send it
  }
}

function markSent(stage: ClientStage) {
  try {
    window.localStorage.setItem(`${GUARD_PREFIX}${stage}`, todayUtc());
  } catch {
    /* best-effort */
  }
}

/**
 * Tell the server one stage happened. Never throws, never blocks, never queues.
 *
 * `first_record` is a HINT, not a claim: the server checks the production rows
 * before counting it, so a client that reports a record which never landed is
 * simply ignored. That check is server-side on purpose — a metric we control
 * from the client is a metric we can accidentally lie about.
 */
export function pingActivation(stage: ClientStage): void {
  if (typeof window === "undefined") return;
  if (stage !== "active" && stage !== "first_record") return;
  if (!navigator.onLine) return;
  if (alreadySent(stage)) return;

  const token = getToken();
  if (!token) return;

  markSent(stage);
  fetch(`${PING_BASE}/api/activation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ stage }),
  }).catch(() => {
    // Not re-sent: the guard is already set, and a retry storm on a weak
    // connection costs the farmer data they were trying to record.
  });
}

/** Test/support hook: forget today's pings so the next call sends again. */
export function resetActivationGuard(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${GUARD_PREFIX}active`);
    window.localStorage.removeItem(`${GUARD_PREFIX}first_record`);
  } catch {
    /* best-effort */
  }
}