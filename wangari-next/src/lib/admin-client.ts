/**
 * API client for the super-admin dashboard (/waadmin).
 * Completely separate token storage from the farm app: an admin token in
 * wangari_admin_token can never be mistaken for a farm session, and signing
 * out of the admin panel never touches the farm login.
 */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";
const TOKEN_KEY = "wangari_admin_token";
const ADMIN_KEY = "wangari_admin_user";

export interface AdminSession {
  id: number;
  name: string;
  email: string;
  role: string;
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function setAdminSession(token: string, admin: AdminSession) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };
  const token = getAdminToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(json);
  }

  const res = await fetch(`${API_BASE}/api/admin${path}`, { ...fetchOptions, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/login")) {
    clearAdminSession();
    window.location.href = "/waadmin/login";
    throw new AdminApiError("Admin session expired", 401);
  }
  if (!res.ok) {
    throw new AdminApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const adminApi = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, json?: unknown) => request<T>(path, { method: "POST", json }),
  patch: <T = any>(path: string, json?: unknown) => request<T>(path, { method: "PATCH", json }),
  put: <T = any>(path: string, json?: unknown) => request<T>(path, { method: "PUT", json }),
  delete: <T = any>(path: string) => request<T>(path, { method: "DELETE" }),
};
