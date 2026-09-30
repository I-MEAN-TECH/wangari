/**
 * Centralized API client.
 * All fetch calls should go through this to ensure JWT auth headers are sent.
 * Write requests made while offline are queued on-device and synced later.
 */

import { getToken, logout } from "./auth-client";
import { enqueue } from "./offline-queue";

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

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

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
    const err = new Error(data.error || `Request failed: ${res.status}`) as Error & { status?: number; needsFarm?: boolean };
    err.status = res.status;
    if (data.needsFarm) err.needsFarm = true;
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
