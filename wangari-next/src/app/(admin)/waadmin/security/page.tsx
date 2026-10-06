"use client";

import * as React from "react";
import QRCode from "qrcode";
import {
  Lock, KeyRound, ShieldCheck, RefreshCw, LogOut, EyeOff, Eye,
  Fingerprint, History, AlertTriangle, CheckCircle2, Copy, Laptop,
} from "lucide-react";
import { adminApi, setAdminSession, clearAdminSession, getAdminSession } from "@/lib/admin-client";
import { PageHeader, Panel, StatCard, Loading, ErrorState, GhostButton } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { BTN_PRIMARY_H11 } from "@/components/ui/patterns";

/**
 * Admin Security & MFA — account security center.
 * - TOTP MFA enrollment with a locally-rendered QR (the TOTP secret is never
 *   sent to a third-party QR image service).
 * - Password change (requires current password + MFA code when enabled) —
 *   bumps tokenVersion and revokes every admin session.
 * - Recovery-code rotation and remaining-count visibility.
 * - Sign-out-everywhere via tokenVersion bump (all issued admin tokens die).
 * - Security activity feed from the audit log.
 */

interface SecuritySummary {
  email: string;
  mfaEnabled: boolean;
  mfaEnabledAt: string | null;
  recoveryCodesRemaining: number;
  lastLogin: string | null;
  events: { id: number; action: string; createdAt: string; details: unknown }[];
  hasGoogleOnly: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.mfa.setup": "Started MFA enrollment",
  "admin.mfa.enable": "Enabled MFA",
  "admin.mfa.disable": "Disabled MFA",
  "admin.security.password_change": "Changed password",
  "admin.security.recovery_rotate": "Rotated recovery codes",
  "admin.security.signout_all": "Signed out everywhere",
};

function eventLabel(action: string): string {
  if (EVENT_LABELS[action]) return EVENT_LABELS[action];
  return action.replace(/^admin\./, "").replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminSecurityPage() {
  const session = getAdminSession();
  const [summary, setSummary] = React.useState<SecuritySummary | null>(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // MFA enrollment state
  const [setup, setSetup] = React.useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);
  const [confirmSaved, setConfirmSaved] = React.useState(false);

  // Password change state
  const [pwCurrent, setPwCurrent] = React.useState("");
  const [pwNew, setPwNew] = React.useState("");
  const [pwConfirm, setPwConfirm] = React.useState("");
  const [pwCode, setPwCode] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);

  // Rotation / signout state
  const [rotatePassword, setRotatePassword] = React.useState("");
  const [rotateCode, setRotateCode] = React.useState("");
  const [rotating, setRotating] = React.useState(false);
  const [signoutPassword, setSignoutPassword] = React.useState("");
  const [signoutConfirm, setSignoutConfirm] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setSummary(await adminApi.get<SecuritySummary>("/security/summary"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Render the QR locally — the otpauth secret never leaves the browser.
  React.useEffect(() => {
    if (!setup?.otpauthUri) { setQrDataUrl(null); return; }
    QRCode.toDataURL(setup.otpauthUri, { width: 200, margin: 1, color: { dark: "#14532D", light: "#FFFFFF" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [setup?.otpauthUri]);

  const mfaEnabled = summary?.mfaEnabled ?? false;
  const post = React.useCallback(async <T,>(path: string, body: unknown): Promise<T> => {
    return adminApi.post<T>(path, body);
  }, []);

  async function startSetup() {
    setError(""); setNotice(""); setBusy(true);
    try { setSetup(await post("/mfa/setup", {})); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function verifyEnable() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const r = await post<{ recoveryCodes: string[] }>("/mfa/verify", { code });
      setEnabled(true); setSetup(null); setRecoveryCodes(r.recoveryCodes); setConfirmSaved(false);
      load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  function setEnabled(v: boolean) {
    setSummary((s) => (s ? { ...s, mfaEnabled: v, mfaEnabledAt: v ? new Date().toISOString() : null, recoveryCodesRemaining: v ? (s.recoveryCodesRemaining || 8) : 0 } : s));
  }

  async function disableMfa() {
    // Disable flow reuses the rotate form inputs? No — dedicated small form below.
  }

  async function changePassword() {
    setError(""); setNotice(""); setBusy(true);
    try {
      if (pwNew !== pwConfirm) throw new Error("New passwords do not match");
      const r = await post<{ token: string }>("/security/change-password", {
        currentPassword: pwCurrent, newPassword: pwNew, totpCode: pwCode || undefined,
      });
      // Server revoked all sessions but returned a fresh token for this tab.
      if (session) setAdminSession(r.token, session);
      setPwCurrent(""); setPwNew(""); setPwConfirm(""); setPwCode("");
      setNotice("Password changed. All other admin sessions were signed out.");
      load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function rotateCodes() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const r = await post<{ recoveryCodes: string[] }>("/security/recovery-codes/rotate", {
        password: rotatePassword, code: rotateCode,
      });
      setRecoveryCodes(r.recoveryCodes); setConfirmSaved(false); setRotating(false);
      setRotatePassword(""); setRotateCode("");
      setSummary((s) => (s ? { ...s, recoveryCodesRemaining: r.recoveryCodes.length } : s));
      setNotice("New recovery codes generated. Old codes no longer work.");
      load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function signOutEverywhere() {
    setError(""); setNotice(""); setBusy(true);
    try {
      await post("/security/signout-everywhere", { password: signoutPassword });
      clearAdminSession();
      window.location.href = "/waadmin/login";
    } catch (e: any) { setError(e.message); setBusy(false); }
  }

  const pwLenOk = pwNew.length >= 12;
  const pwMatch = pwNew.length > 0 && pwNew === pwConfirm;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Security & MFA"
        description="Authentication, recovery, and session control for your admin account"
        actions={mfaEnabled ? (
          <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> MFA protected</Badge>
        ) : (
          <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" /> MFA not enabled</Badge>
        )}
      />

      {error && <ErrorState message={error} />}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-wangari-border bg-wangari-green-50 px-4 py-3 text-sm font-medium text-wangari-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
        </div>
      )}

      {!summary ? (
        <Panel><Loading label="Loading security settings…" /></Panel>
      ) : (
        <>
          {/* Posture stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="MFA status"
              value={mfaEnabled ? "Enabled" : "Off"}
              icon={<Fingerprint className="h-5 w-5" />}
              accent={mfaEnabled ? "green" : "amber"}
              hint={summary.mfaEnabledAt ? `since ${new Date(summary.mfaEnabledAt).toLocaleDateString()}` : "enable below — strongly recommended"}
            />
            <StatCard
              label="Recovery codes"
              value={summary.recoveryCodesRemaining}
              icon={<KeyRound className="h-5 w-5" />}
              accent={summary.recoveryCodesRemaining >= 3 ? "slate" : "amber"}
              hint={mfaEnabled ? (summary.recoveryCodesRemaining === 0 ? "none left — rotate now" : "single-use, remain after login") : "available once MFA is on"}
            />
            <StatCard
              label="Last sign-in"
              value={summary.lastLogin ? timeAgo(summary.lastLogin) : "—"}
              icon={<History className="h-5 w-5" />}
              accent="blue"
              hint={summary.lastLogin ? new Date(summary.lastLogin).toLocaleString() : "no recorded logins"}
            />
            <StatCard
              label="Auth method"
              value={summary.hasGoogleOnly ? "Google" : "Password"}
              icon={<Lock className="h-5 w-5" />}
              accent="violet"
              hint={summary.hasGoogleOnly ? "no local password set" : "email + password with MFA"}
            />
          </div>

          {/* MFA card */}
          <Panel title="Authenticator app (TOTP)" description="Works with Google Authenticator, Authy, 1Password, or any TOTP app">
            {!mfaEnabled && !setup && (
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 rounded-xl bg-badge-yellow-bg px-4 py-3 text-sm text-wangari-text">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-wangari-amber-600" />
                  Admin sign-in currently relies on your password alone.
                </div>
                <button
                  onClick={startSetup}
                  disabled={busy}
                  className="rounded-xl bg-wangari-green-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-wangari-green-900 disabled:opacity-60"
                >
                  {busy ? "Starting…" : "Set up MFA"}
                </button>
              </div>
            )}

            {setup && (
              <div className="space-y-4 border-t border-wangari-border pt-5">
                <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="Scan to add Wangari Admin to your authenticator" className="h-[200px] w-[200px] rounded-xl border border-wangari-border bg-white p-2" />
                  )}
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-semibold text-wangari-heading">1. Scan with your authenticator app</p>
                    <p className="text-xs text-wangari-muted">The QR is generated in your browser — the secret is never sent anywhere.</p>
                    <p className="text-xs text-wangari-muted">
                      Can&apos;t scan? Enter this secret manually:
                      <button onClick={() => setShowSecret((v) => !v)} className="ml-2 inline-flex items-center gap-1 font-medium text-wangari-green-700 hover:underline">
                        {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {showSecret ? "hide" : "show"}
                      </button>
                      {showSecret && <code className="ml-2 rounded bg-wangari-green-50 px-1.5 py-0.5 font-mono text-xs text-wangari-green-800">{setup.secret}</code>}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-wangari-heading">2. Enter the 6-digit code to confirm</p>
                  <div className="mt-2 flex max-w-xs gap-2">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                      placeholder="000000"
                      className="h-11 flex-1 rounded-xl border border-wangari-border px-4 text-center font-semibold tracking-[0.3em] text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                    />
                    <button
                      onClick={verifyEnable}
                      disabled={busy || code.replace(/\D/g, "").length !== 6}
                      className={BTN_PRIMARY_H11}
                    >
                      {busy ? "Verifying…" : "Enable"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {mfaEnabled && !recoveryCodes && (
              <div className="flex items-center justify-between border-t border-wangari-border pt-4">
                <p className="text-sm text-wangari-muted">MFA is active. Each sign-in needs a code from your authenticator.</p>
                <GhostButton onClick={() => setRotating((v) => !v)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Rotate recovery codes
                </GhostButton>
              </div>
            )}

            {rotating && (
              <div className="mt-4 space-y-3 rounded-xl bg-wangari-cream p-4">
                <p className="text-sm font-semibold text-wangari-heading">Confirm to generate new recovery codes</p>
                <p className="text-xs text-wangari-muted">This invalidates all existing recovery codes.</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    value={rotatePassword}
                    onChange={(e) => setRotatePassword(e.target.value)}
                    placeholder="Current password"
                    autoComplete="current-password"
                    className="h-11 w-52 rounded-xl border border-wangari-border bg-white px-4 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                  />
                  <input
                    value={rotateCode}
                    onChange={(e) => setRotateCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="6-digit code"
                    className="h-11 w-40 rounded-xl border border-wangari-border bg-white px-4 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                  />
                  <button
                    onClick={rotateCodes}
                    disabled={busy || !rotatePassword || !rotateCode}
                    className={BTN_PRIMARY_H11}
                  >
                    {busy ? "Working…" : "Rotate codes"}
                  </button>
                </div>
              </div>
            )}

            {/* Recovery codes — shown once */}
            {recoveryCodes && (
              <div className="mt-4 space-y-3 border-t border-wangari-border pt-5">
                <p className="text-sm font-semibold text-wangari-heading">Save your recovery codes now</p>
                <p className="text-xs text-wangari-muted">Each code works once if you lose your device. They will not be shown again.</p>
                <div className="grid w-fit grid-cols-2 gap-x-8 gap-y-1.5 rounded-xl bg-wangari-cream px-6 py-4 font-mono text-sm text-wangari-heading">
                  {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <GhostButton onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}>
                    <Copy className="h-3.5 w-3.5" /> Copy codes
                  </GhostButton>
                  <label className="flex items-center gap-2 text-xs text-wangari-muted">
                    <input type="checkbox" checked={confirmSaved} onChange={(e) => setConfirmSaved(e.target.checked)} className="accent-wangari-green-700" />
                    I&apos;ve stored them somewhere safe
                  </label>
                  <button
                    onClick={() => { setRecoveryCodes(null); setNotice("Recovery codes saved. Store them somewhere safe — they are shown only once."); }}
                    disabled={!confirmSaved}
                    className="rounded-xl bg-wangari-green-800 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-wangari-green-900 disabled:opacity-60"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* Password change — always available for password-based admins */}
      {summary && !summary.hasGoogleOnly && (
        <Panel title="Change password" description="Changing your password signs out every other admin session">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                  className="h-11 w-full rounded-xl border border-wangari-border px-4 pr-10 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                />
                <button onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-3 text-wangari-muted hover:text-wangari-text" tabIndex={-1}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <input
                type={showPw ? "text" : "password"}
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder="New password (min 12 characters)"
                autoComplete="new-password"
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
              />
              <input
                type={showPw ? "text" : "password"}
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
              />
              {mfaEnabled && (
                <input
                  value={pwCode}
                  onChange={(e) => setPwCode(e.target.value)}
                  inputMode="numeric"
                  placeholder="6-digit authenticator code"
                  className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                />
              )}
            </div>
            <div className="space-y-3">
              <div className={`flex items-center gap-2 text-xs ${pwLenOk ? "text-wangari-green-700" : "text-wangari-muted"}`}>
                {pwLenOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-wangari-border" />}
                At least 12 characters
              </div>
              <div className={`flex items-center gap-2 text-xs ${pwMatch ? "text-wangari-green-700" : "text-wangari-muted"}`}>
                {pwMatch ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-wangari-border" />}
                Passwords match
              </div>
              <div className="rounded-xl bg-wangari-cream px-3.5 py-3 text-xs text-wangari-muted">
                <Laptop className="mr-1 inline h-3.5 w-3.5 text-wangari-green-700" />
                All other signed-in sessions are revoked when the password changes. This tab stays signed in.
              </div>
              <button
                onClick={changePassword}
                disabled={busy || !pwCurrent || !pwLenOk || !pwMatch || (mfaEnabled && pwCode.replace(/\D/g, "").length !== 6)}
                className="h-11 w-full rounded-xl bg-wangari-green-800 px-4 text-sm font-semibold text-white shadow-md hover:bg-wangari-green-900 disabled:opacity-60 sm:w-auto"
              >
                {busy ? "Working…" : "Change password"}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* Sign out everywhere */}
      {summary && (
        <Panel title="Sessions" description="Revoke every admin sign-in across all devices">
          {!signoutConfirm ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-wangari-muted">
                <LogOut className="h-4 w-4 shrink-0 text-wangari-muted" />
                Immediately invalidates all admin tokens — including this one.
              </div>
              <GhostButton onClick={() => setSignoutConfirm(true)} className="shrink-0 text-badge-red-text hover:bg-badge-red-bg">
                <LogOut className="h-3.5 w-3.5" /> Sign out everywhere
              </GhostButton>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl bg-badge-red-bg/40 p-4">
              <p className="text-sm font-semibold text-wangari-heading">Confirm with your password</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  value={signoutPassword}
                  onChange={(e) => setSignoutPassword(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                  className="h-11 w-52 rounded-xl border border-wangari-border bg-white px-4 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
                />
                <button
                  onClick={signOutEverywhere}
                  disabled={busy || !signoutPassword}
                  className="h-11 rounded-xl bg-wangari-red-600 px-4 text-sm font-semibold text-white shadow-md hover:bg-badge-red-text disabled:opacity-60"
                >
                  {busy ? "Revoking…" : "Revoke all sessions"}
                </button>
                <GhostButton onClick={() => { setSignoutConfirm(false); setSignoutPassword(""); }} className="h-11">Cancel</GhostButton>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Security activity */}
      {summary && (
        <Panel title="Security activity" description="Recent security-related events on your account">
          {summary.events.length === 0 ? (
            <p className="text-sm text-wangari-muted">No security events recorded yet.</p>
          ) : (
            <div className="divide-y divide-wangari-border">
              {summary.events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-700">
                      {ev.action === "admin.login" ? <Lock className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    </div>
                    <span className="truncate text-sm font-medium text-wangari-text">{eventLabel(ev.action)}</span>
                  </div>
                  <span className="ml-3 shrink-0 text-xs text-wangari-muted" title={new Date(ev.createdAt).toLocaleString()}>
                    {timeAgo(ev.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
