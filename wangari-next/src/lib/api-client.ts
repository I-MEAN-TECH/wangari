/**
 * Centralized API client.
 * All fetch calls should go through this to ensure JWT auth headers are sent.
 * Write requests made while offline are queued on-device and synced later.
 */

import { getToken, logout } from "./auth-client";
import { enqueue } from "./offline-queue";
import { cacheGet, cacheSet, resolveRead } from "./read-cache";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";
export { API_BASE };

interface RequestOptions extends RequestInit {
  json?: unknown;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Add JWT token
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Add JSON body
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(json);
  }

  // ── Offline writes: queue on-device, report success, sync later ──
  const isWrite = json !== undefined && fetchOptions.method && fetchOptions.method !== "GET";
  if (isWrite && typeof window !== "undefined" && !navigator.onLine && !path.includes("/auth/")) {
    const label = describeWrite(path, fetchOptions.method as string);
    enqueue(path, fetchOptions.method as "POST" | "PUT" | "PATCH", json, label);
    window.dispatchEvent(new CustomEvent("wangari:write_queued", { detail: { label } }));
    // Optimistic success — the flusher will deliver it; clientId prevents duplicates.
    return { queued: true, offline: true } as T;
  }

  // ── Offline reads: prefer the network, fall back to the last good answer ──
  // A farmer with no signal must still see the numbers they recorded earlier,
  // or the empty screen reads as "my record was lost" — which is precisely the
  // belief the write queue exists to prevent.
  const serveFromCache = (): T | null => {
    const cached = cacheGet<T>(path);
    const resolved = resolveRead<T>({ ok: false }, cached, Date.now());
    if (resolved.data === null || resolved.data === undefined) return null;
    window.dispatchEvent(
      new CustomEvent("wangari:showing_cached", {
        detail: { path, label: resolved.label, age: resolved.age },
      })
    );
    // Several endpoints return a bare ARRAY (deliveries, sales, transactions).
    // Spreading an array into `{...d}` turns it into an object with numeric keys,
    // which would then render as an empty list — the screen would look exactly
    // like "your records are gone", which is the failure this whole layer exists
    // to prevent. Copy the array instead, then hang the marker off it.
    const out: any = Array.isArray(resolved.data) ? [...resolved.data] : { ...(resolved.data as any) };
    out.__stale = true;
    out.__cachedAt = cached?.at ?? null;
    return out as T;
  };

  if (!isWrite && typeof window !== "undefined" && !navigator.onLine) {
    const cached = serveFromCache();
    if (cached) return cached;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
    });
  } catch {
    // The request never left the device — flaky signal, not an API error. Serve
    // the last good answer rather than an error page.
    if (!isWrite && typeof window !== "undefined") {
      const cached = serveFromCache();
      if (cached) return cached;
    }
    throw new Error("You appear to be offline, and these numbers are not saved on this device yet.");
  }

  // Successful GET → remember it, so the next cold spot has something to show.
  if (!isWrite && res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
    res
      .clone()
      .json()
      .then((payload) => cacheSet(path, payload))
      .catch(() => {});
  } else if (isWrite && res.ok) {
    // A write that actually reached the server is the earliest moment a farmer
    // may have a first record. The activation listener turns this into the
    // `first_record` ping — the server verifies it against real rows, so this
    // is only ever a hint.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wangari:write_succeeded", { detail: { path } }));
    }
  }

  // Handle auth errors — only logout on /api/auth routes, not dashboard data
  if (res.status === 401 && path.startsWith("/api/auth")) {
    logout();
    throw new Error("Session expired. Please login again.");
  }

  // Check content type to catch HTML responses (usually means wrong URL)
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `[Wangari] API returned HTML instead of JSON. ` +
      `URL: ${path}, Status: ${res.status}`
    );
  }

  const data = await res.json();

  if (res.status === 403 && data?.trialExpired) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wangari:trial_expired", { detail: data.error }));
    }
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`) as Error & {
      status?: number;
      needsFarm?: boolean;
      needsConfirmation?: boolean;
    };
    err.status = res.status;
    if (data.needsFarm) err.needsFarm = true;
    // A server-side "are you sure?" (e.g. merging two different species) is a
    // first-class flag, not something the caller should have to match out of
    // the message text. Keeps the confirmation path honest if the wording moves.
    if (data.needsConfirmation) err.needsConfirmation = true;
    throw err;
  }

  // A successful promo redemption / subscription change is broadcast so the
  // sidebar padlocks and the trial timer update live, without a page reload.
  if (typeof window !== "undefined" && data && typeof data === "object" && (data as any).ok === true && (data as any).expiresAt) {
    window.dispatchEvent(new CustomEvent("wangari:subscription_updated", { detail: data }));
  }

  return data as T;
}

// ─── Typed API helpers ────────────────────────────────────

// Human-readable label for the sync banner.
function describeWrite(path: string, method: string): string {
  const kind = path.match(/\/api\/(\w+)/)?.[1] || "record";
  const names: Record<string, string> = {
    sales: "Sale", production: "Production record", transactions: "Transaction",
    crops: "Crop entry", inventory: "Inventory update", vaccinations: "Vaccination",
    flocks: "Flock update", workers: "Worker record", deliveries: "Delivery",
    breeding: "Breeding record", attendance: "Attendance",
  };
  return `${method === "POST" ? "New" : "Updated"} ${names[kind] || "record"}`;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),

  post: <T = any>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", json: body }),

  put: <T = any>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", json: body }),

  patch: <T = any>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", json: body }),

  delete: <T = any>(path: string) =>
    request<T>(path, { method: "DELETE" }),

  upload: async <T = any>(path: string, formData: FormData): Promise<T> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
    return data as T;
  },
};

export default api;
