/**
 * Client-side JWT auth utility.
 * Stores the token in localStorage and provides helpers for login/register/logout.
 */

const TOKEN_KEY = "wangari_token";
const USER_KEY = "wangari_user";

// ─── Analytics (PostHog) ──────────────────────────────────
// Dynamic import keeps this dependency-free at module scope; trackEvent is a
// safe no-op when PostHog isn't configured.
async function track(event: string, props?: Record<string, unknown>) {
  try {
    const { trackEvent } = await import("@/lib/posthog");
    trackEvent(event, props);
  } catch {}
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatar?: string | null;
  role?: string;
  farmId?: number | null;
  profileComplete?: boolean;
  googleId?: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  farmId?: number | null;
  farm?: { id: number; name: string };
}

// ─── Token Management ─────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ─── User Management ──────────────────────────────────────

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/** Decode JWT payload (no verification — server verifies on every API call). */
export function getTokenPayload(): { userId?: number; workerId?: number; farmId?: number | null; role?: string } | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/** True if the stored token belongs to a farm worker (PIN login). */
export function isWorkerSession(): boolean {
  const p = getTokenPayload();
  return !!p && (p.role === "worker" || !!p.workerId);
}

// ─── Auth Actions ─────────────────────────────────────────
// All auth calls go through Next.js API routes (same origin, no env var needed)

export async function login(email: string, password: string, totpCode?: string): Promise<AuthResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
  });

  const data = await res.json();
  if (!res.ok) {
    if (data?.mfaRequired) {
      // Two-factor challenge — surface the flag to the login page.
      const err = new Error("mfaRequired") as any;
      err.payload = { mfaRequired: true };
      throw err;
    }
    throw new Error(data.error || "Login failed");
  }

  if (data?.emailVerifyRequired) {
    // Mandatory email verification (manual accounts). No session token is
    // issued — a fresh code was emailed to the address they logged in with.
    // Do NOT store anything; the verify page completes the login.
    const err = new Error("emailVerifyRequired") as any;
    err.payload = { emailVerifyRequired: true, devCode: data.devCode };
    throw err;
  }

  setToken(data.token);
  setUser(data.user);
  track("user_logged_in", { method: "password", user_id: data.user?.id });
  return data;
}

// ─── Two-factor authentication (authenticator app) ───

export async function mfaStatus(): Promise<{ enabled: boolean }> {
  const token = getToken();
  const res = await fetch("/api/auth/mfa/status", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to check 2FA status");
  return data;
}

export async function mfaSetup(): Promise<{ secret: string; uri: string }> {
  const token = getToken();
  const res = await fetch("/api/auth/mfa/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to start 2FA setup");
  return data;
}

export async function mfaVerify(code: string): Promise<{ enabled: boolean; recoveryCodes: string[] }> {
  const token = getToken();
  const res = await fetch("/api/auth/mfa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Invalid code");
  track("mfa_enabled", {});
  return data;
}

export async function mfaDisable(password: string, code: string): Promise<{ enabled: boolean }> {
  const token = getToken();
  const res = await fetch("/api/auth/mfa/disable", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ password, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to disable 2FA");
  track("mfa_disabled", {});
  return data;
}

export async function register(
  name: string,
  email: string,
  password: string,
  phone?: string
): Promise<AuthResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, phone }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Registration failed");

  // Manual registration now requires email verification: the response has no
  // token — the register page routes to /verify-email which completes login.
  if (!data.token) {
    track("user_signed_up", { method: "password" });
    return data;
  }

  setToken(data.token);
  setUser(data.user);
  track("user_signed_up", { method: "password", user_id: data.user?.id });
  return data;
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send reset email");
  return data;
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to reset password");
  return data;
}

export async function googleLogin(credential: string): Promise<AuthResponse> {
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Google login failed");

  setToken(data.token);
  setUser(data.user);
  track("user_logged_in", { method: "google", user_id: data.user?.id, new_user: !!data.user?.googleId });
  return data;
}

export async function linkGoogleAccount(credential: string): Promise<{ success: boolean; user: any }> {
  const res = await fetch("/api/auth/link-google", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ credential }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to link Google account");
  return data;
}

export async function updateProfile(data: { name?: string; phone?: string; location?: string; county?: string; farmName?: string }): Promise<any> {
  const res = await fetch("/api/auth/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to update profile");

  // Update local user data
  const currentUser = getUser();
  if (currentUser && result.user) {
    setUser({ ...currentUser, ...result.user });
  }

  return result;
}

export async function sendVerificationCode(email: string): Promise<{ message: string }> {
  const res = await fetch("/api/auth/send-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send verification code");
  if (data.devCode) {
    track("verification_code_fallback_shown", { email });
  } else {
    track("verification_code_sent", { email });
  }
  return data;
}

export async function verifyEmail(
  email: string,
  code: string
): Promise<{ message: string; token?: string; user?: AuthUser; farmId?: number | null }> {
  const res = await fetch("/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Verification failed");
  track("email_verified", { email });

  // Verified = logged in. The server issues the session token on success.
  if (data.token && data.user) {
    setToken(data.token);
    setUser(data.user);
    track("user_logged_in", { method: "email_verification", user_id: data.user.id });
  }
  return data;
}

export function logout(): void {
  track("user_logged_out");
  removeToken();
  if (typeof window !== "undefined") {
    try {
      import("@/lib/posthog").then(({ resetPostHog }) => resetPostHog());
    } catch {}
    window.location.href = "/login";
  }
}
