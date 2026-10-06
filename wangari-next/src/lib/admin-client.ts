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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/admin${path}`, { ...fetchOptions, headers });
  } catch {
    // The request never reached the API at all (DNS, timeout, host down). A
    // raw "Failed to fetch" gave the admin no idea whether they had been logged
    // out, lost privileges, or hit an outage — and an unreachable host looks
    // like neither 401 nor 403, so it fell through as an unexplained failure.
    throw new AdminApiError(
      `Cannot reach the Wangari API at ${API_BASE}. The server may be down or unreachable.`,
      0
    );
  }
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

/**
 * Feedback is a Wangari data flow, not a SaaS feature, so it lives under the
 * `/api/admin` namespace the existing client already authors — not a separate
 * `adminApi` helper that would imply a new backend surface.
 *
 * Keep every field defensively copied. `Talkback` messages arrive async in the
 * foreground response based on Moonstone callbacks, so a slow or failing
 * Talkback webhook can stall or partially fail an otherwise-complete page —
 * and a `FeedbackRow` that came back once should not be trusted to stay the
 * same object across re-renders.
 */
export const feedbackApi = {
  /**
   * Defensive copy — the response may have been assembled under a slow
   * Talkback round-trip, and React should never hand a server object directly
   * to a list renderer.
   */
  getSummary: (days: number) =>
    request<FeedbackSummary>("/feedback?days=" + encodeURIComponent(String(days))).then(
      (s) => ({
        ...s,
        bySpecies: { ...s.bySpecies },
        byAudience: { ...s.byAudience },
        bestRanked: s.bestRanked.map((r) => ({ ...r })),
        improveRanked: s.improveRanked.map((r) => ({ ...r })),
        recent: (s.recent ?? []).map((r) => ({ ...r })),
      })
    ),
};

/** The shape the feedback summary endpoint returns, in the admin client's own words. */
export interface FeedbackSummary {
  periodDays: number;
  responses: number;
  ratedCount: number;
  averageRating: number | null;
  speciesCounts: Record<string, number>;
  bestRanked: { tag: string; count: number }[];
  improveRanked: { tag: string; count: number }[];
  bySpecies: Record<string, FeedbackSegmentSummary>;
  audienceCounts: Record<string, number>;
  byAudience: Record<string, FeedbackSegmentSummary>;
  channelCounts: Record<string, number>;
  labels: FeedbackLabels;
  recent: FeedbackRow[];
}

export interface FeedbackSegmentSummary {
  responses: number;
  ratedCount: number;
  averageRating: number | null;
  bestCounts: Record<string, number>;
  improveCounts: Record<string, number>;
}

export interface FeedbackLabels {
  best: Record<string, { label: string; icon: string }>;
  improve: Record<string, { label: string; icon: string }>;
  audience: Record<string, { label: string; icon: string }>;
  audienceOrder: string[];
}

export interface FeedbackRow {
  id: number;
  source: string;
  rating: number | null;
  best: string[];
  improve: string[];
  species: string[];
  comment: string | null;
  phone: string | null;
  audience: string | null;
  utm: string | null;
  farmId: number | null;
  createdAt: string;
}

