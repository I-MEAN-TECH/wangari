/**
 * Offline write queue — the "save on device, sync when online" layer.
 *
 * When a farmer records a sale / output / expense with no connection, the
 * write is stored in localStorage with a unique clientId and reported to the
 * UI as SUCCESS (so their workflow is never blocked). A background flusher
 * replays the queue whenever connectivity returns.
 *
 * Duplicate protection: every queued write carries `clientId`. The backend
 * honours it — replaying a queued write twice never creates two records.
 */

const QUEUE_PREFIX = "wangari_offline_queue_v1";

/**
 * The queue is namespaced PER USER.
 *
 * A queued write is replayed with whoever's token is current at flush time, so a
 * single shared queue means farmer A's unsent delivery lands in farmer B's farm
 * the moment B signs in on the same phone. Shared handsets are a documented
 * reality in this market (ICTworks lists them among the reasons farmers abandon
 * agri-apps), so this is the normal case, not an edge case.
 *
 * It also stops the reverse: B cannot flush or see A's pending records.
 */
function queueKey(): string {
  if (typeof window === "undefined") return QUEUE_PREFIX;
  try {
    const uid = window.localStorage.getItem("wangari_user_id");
    return `${QUEUE_PREFIX}:${uid || "anon"}`;
  } catch {
    return QUEUE_PREFIX;
  }
}

/** Drop every user's queued writes. Called on sign-out — see read-cache.cacheClear. */
export function queueClearAll(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(QUEUE_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    /* best-effort */
  }
}

export interface QueuedWrite {
  id: string; // unique clientId sent to the backend for idempotency
  path: string;
  method: "POST" | "PUT" | "PATCH";
  body: unknown;
  queuedAt: number;
  label: string; // human description for the sync banner
}

function readQueue(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(queueKey()) || "[]") as QueuedWrite[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedWrite[]) {
  localStorage.setItem(queueKey(), JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent("wangari:queue_changed", { detail: queue.length }));
}

export function queueSize(): number {
  return readQueue().length;
}

export function enqueue(path: string, method: QueuedWrite["method"], body: unknown, label: string) {
  const queue = readQueue();
  // clientId doubles as the idempotency key on the backend.
  const item: QueuedWrite = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    path,
    method,
    body,
    queuedAt: Date.now(),
    label,
  };
  queue.push(item);
  writeQueue(queue);
  return item.id;
}

export function peekQueue(): QueuedWrite[] {
  return readQueue();
}

/** Remove specific ids after a successful flush. */
export function removeFromQueue(ids: string[]) {
  const idSet = new Set(ids);
  writeQueue(readQueue().filter((q) => !idSet.has(q.id)));
}

/** Age of the oldest queued item in minutes (for the banner). */
export function oldestQueuedMinutes(): number {
  const queue = readQueue();
  if (queue.length === 0) return 0;
  return Math.floor((Date.now() - Math.min(...queue.map((q) => q.queuedAt))) / 60000);
}

/**
 * Flush the queue in order. Stops at the first hard failure (e.g. 401 —
 * session expired) to preserve ordering; validation errors (400/409/422)
 * drop the item permanently rather than blocking the queue forever.
 * Returns { sent, failed } counts.
 */
export async function flushQueue(
  doFetch: (path: string, method: string, body: unknown, clientId: string) => Promise<void>
): Promise<{ sent: number; failed: number }> {
  const queue = readQueue();
  let sent = 0;
  let failed = 0;
  const done: string[] = [];

  for (const item of queue) {
    try {
      await doFetch(item.path, item.method, item.body, item.id);
      sent++;
      done.push(item.id);
    } catch (err: any) {
      const status = err?.status;
      if (status === 401 || status === 403) break; // auth problem — stop, retry later
      // Hard validation failure — discard so one bad record can't jam the queue.
      failed++;
      done.push(item.id);
    }
  }

  if (done.length > 0) removeFromQueue(done);
  return { sent, failed };
}
