"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { adminApi, setAdminSession } from "@/lib/admin-client";

type LoginResult = { token: string; admin: { id: number; name: string; email: string; role: string } };

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [totpCode, setTotpCode] = React.useState("");
  const [mfaStep, setMfaStep] = React.useState(false);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [emailCodeSent, setEmailCodeSent] = React.useState(false);
  const [emailCodeBusy, setEmailCodeBusy] = React.useState(false);
  const [emailCodeMsg, setEmailCodeMsg] = React.useState("");
  const [resendCooldown, setResendCooldown] = React.useState(0);

  // When the MFA step appears, auto-send an email code so the admin can
  // sign in without an authenticator app. Cooldown prevents spamming.
  React.useEffect(() => {
    if (!mfaStep || emailCodeSent) return;
    setEmailCodeSent(true);
    (async () => {
      setEmailCodeBusy(true);
      try {
        await adminApi.post("/mfa/email-code", { email, password });
        setEmailCodeMsg(`We emailed a 6-digit code to ${email}. It expires in 10 minutes.`);
        setResendCooldown(60);
      } catch {
        setEmailCodeMsg("");
      } finally {
        setEmailCodeBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfaStep]);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function resendEmailCode() {
    setEmailCodeBusy(true);
    setError("");
    try {
      await adminApi.post("/mfa/email-code", { email, password });
      setEmailCodeMsg(`Code re-sent to ${email}.`);
      setResendCooldown(60);
    } catch (err: any) {
      setError(err?.message || "Could not resend the code");
    } finally {
      setEmailCodeBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await adminApi.post<LoginResult | { mfaRequired: boolean }>("/login", {
        email,
        password,
        ...(mfaStep ? { totpCode } : {}),
      });
      if ("mfaRequired" in res && res.mfaRequired) {
        setMfaStep(true);
        setError("");
        return;
      }
      const ok = res as LoginResult;
      setAdminSession(ok.token, ok.admin);
      router.replace("/waadmin");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-wangari-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-wangari-green-50 shadow-sm"><ShieldCheck className="h-6 w-6 text-wangari-green-700" /></div>
          <h1 className="text-xl font-bold text-wangari-heading">Wangari Admin</h1>
          <p className="mt-1 text-sm text-wangari-muted">
            {mfaStep ? "Two-factor verification" : "Platform mission control — staff only"}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-wangari-border bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {mfaStep ? (
            <>
              <p className="text-xs leading-relaxed text-wangari-muted">
                Enter the 6-digit code we just emailed to <span className="font-semibold text-wangari-heading">{email}</span> — or a code from your authenticator app / a recovery code.
              </p>
              {emailCodeMsg && (
                <p className="rounded-lg bg-wangari-green-50 px-3 py-2 text-xs text-wangari-green-800">{emailCodeBusy ? "Sending code…" : emailCodeMsg}</p>
              )}
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-center text-lg font-semibold tracking-[0.4em] text-wangari-heading placeholder:text-wangari-subtle focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                placeholder="000000"
              />
              <button
                type="button"
                onClick={() => {
                  setMfaStep(false);
                  setTotpCode("");
                  setError("");
                }}
                className="text-xs font-medium text-wangari-muted hover:text-wangari-heading"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-wangari-muted">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm text-wangari-heading placeholder:text-wangari-subtle focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-wangari-muted">Password</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm text-wangari-heading placeholder:text-wangari-subtle focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                  placeholder="••••••••"
                />
              </div>
            </>
          )}
          {error && <div className="rounded-lg border border-badge-red-bg bg-tone-bad-bg px-3 py-2 text-xs text-badge-red-text">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl bg-wangari-green-800 text-sm font-semibold text-white shadow-md transition-all hover:bg-wangari-green-900 hover:shadow-lg disabled:opacity-60"
          >
            {busy ? (mfaStep ? "Verifying…" : "Signing in…") : mfaStep ? "Verify code" : "Sign in to Admin"}
          </button>
          {mfaStep && (
            <>
              <button
                type="button"
                onClick={resendEmailCode}
                disabled={emailCodeBusy || resendCooldown > 0}
                className="w-full rounded-xl border border-wangari-border py-2 text-xs font-medium text-wangari-green-800 transition-colors hover:bg-wangari-green-50 disabled:opacity-50"
              >
                {emailCodeBusy ? "Sending…" : resendCooldown > 0 ? `Resend email code in ${resendCooldown}s` : "Resend email code"}
              </button>
              <p className="text-center text-[11px] text-wangari-subtle">
                Lost your device? Use one of your recovery codes in place of the 6-digit code.
              </p>
            </>
          )}
        </form>
        <p className="mt-4 text-center text-[11px] text-wangari-subtle">
          Admin accounts are provisioned internally. Sessions expire after 4 hours.
        </p>
      </div>
    </div>
  );
}
