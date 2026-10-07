"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, ArrowRight, UserCheck, HardHat, KeyRound, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, googleLogin, setToken, setUser, AccountNotProvisionedError } from "@/lib/auth-client";
import api from "@/lib/api-client";

import { AuthAvatarContext } from "@/app/(auth)/layout";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const { setAvatarState } = React.useContext(AuthAvatarContext);

  // Role Tab state: "owner" | "worker"
  const [userRole, setUserRole] = React.useState<"owner" | "worker">("owner");

  // Farm Owner Form State
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  // Two-factor (authenticator app) state
  const [mfaStep, setMfaStep] = React.useState(false);
  const [totpCode, setTotpCode] = React.useState("");

  // Farm Worker Form State
  const [farmCode, setFarmCode] = React.useState("");
  const [workerPin, setWorkerPin] = React.useState("");

  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const googleButtonRef = React.useRef<HTMLDivElement>(null);
  const [googleLoaded, setGoogleLoaded] = React.useState(false);

  React.useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) return; // No client ID configured — skip Google button

    const setupGoogle = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            try {
              setError("");
              setLoading(true);
              setAvatarState("loading");
              await googleLogin(response.credential);
              setAvatarState("success");
              router.push(callbackUrl);
            } catch (err) {
              setAvatarState("error");
              // Google proved WHO you are, but this identity has never been
              // used on Wangari. The server refuses to auto-create a farm — so
              // send the farmer to registration instead of into a placeholder
              // farm (see routes/auth.ts). Identity from Google; ownership of a
              // farm comes from stating the farm.
              if (err instanceof AccountNotProvisionedError) {
                setError("");
                router.push(
                  `/register?googleEmail=${encodeURIComponent(err.email ?? "")}`
                );
                return;
              }
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            } finally {
              setLoading(false);
            }
          },
        });
        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
            width: "100%",
          });
        }
        setGoogleLoaded(true);
      }
    };

    if (window.google?.accounts?.id) {
      setupGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = setupGoogle;
    document.head.appendChild(script);
  }, [callbackUrl, router, setAvatarState]);

  // Handle Farm Owner Login
  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setAvatarState("loading");

    try {
      const result = await login(email, password, mfaStep ? totpCode : undefined);
      setAvatarState("success");
      router.push(callbackUrl);
    } catch (err: any) {
      setAvatarState("error");
      if (err?.payload?.emailVerifyRequired) {
        // Mandatory verification: a fresh code was emailed to this address.
        // The verify page completes login once the code is confirmed.
        setError("");
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } else if (err?.payload?.mfaRequired) {
        setMfaStep(true);
        setError("");
      } else {
        setError(err instanceof Error ? err.message : "Invalid credentials. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Worker Connection Code Login
  const handleWorkerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setAvatarState("loading");

    try {
      const res: any = await api.post("/api/worker/login", {
        farmCode,
        pin: workerPin,
      });

      if (res.token) {
        setAvatarState("success");
        setToken(res.token);
        // Store worker identity — replaces any owner profile in localStorage
        setUser({
          id: res.worker?.id ?? 0,
          name: res.worker?.name ?? "Worker",
          email: res.worker?.phone ?? "",
          role: "worker",
          farmId: res.worker?.farmId ?? null,
        });
        router.push("/worker");
      } else {
        throw new Error("Login failed. No token received.");
      }
    } catch (err) {
      setAvatarState("error");
      setError(err instanceof Error ? err.message : "Incorrect Farm Code or 4-digit PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      {/* Heading */}
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-black text-wangari-heading tracking-tight">
          Welcome to Wangari
        </h1>
        <p className="mt-1 text-sm text-wangari-muted font-medium">
          Select your role to access your farm portal
        </p>
      </motion.div>

      {/* DUAL ROLE TAB SELECTOR */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 p-1.5 bg-wangari-cream rounded-2xl gap-1">
        <button
          type="button"
          onClick={() => { setUserRole("owner"); setError(""); }}
          className={`py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            userRole === "owner"
              ? "bg-wangari-green-800 text-white shadow-md"
              : "text-wangari-muted hover:text-wangari-heading"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          Farm Owner
        </button>
        <button
          type="button"
          onClick={() => { setUserRole("worker"); setError(""); }}
          className={`py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            userRole === "worker"
              ? "bg-wangari-green-800 text-white shadow-md"
              : "text-wangari-muted hover:text-wangari-heading"
          }`}
        >
          <HardHat className="h-4 w-4" />
          Farm Worker
        </button>
      </motion.div>

      {/* Error display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-tone-bad-bg border border-tone-bad-border p-4 text-xs font-bold text-tone-bad-text"
        >
          {error}
        </motion.div>
      )}

      {/* ─── TAB 1: FARM OWNER FORM ─── */}
      {userRole === "owner" && (
        <form
          onSubmit={handleOwnerSubmit}
          className="space-y-4"
        >
          <motion.div variants={fadeUp}>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-bold text-wangari-text">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setAvatarState("typing-email")}
              onBlur={() => setAvatarState("idle")}
              required
              className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 focus:ring-wangari-green-800/20 font-semibold"
            />
          </div>

          {mfaStep ? (
            <div className="space-y-1.5">
              <Label htmlFor="totp" className="text-xs font-bold text-wangari-text">
                Two-Factor Code
              </Label>
              <Input
                id="totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={10}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 focus:ring-wangari-green-800/20 text-center text-xl font-bold tracking-[0.3em]"
              />
              <p className="text-[11px] text-wangari-subtle">
                Open your authenticator app and enter the 6-digit code. You can
                also use one of your recovery codes.
              </p>
            </div>
          ) : (
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-bold text-wangari-text">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setAvatarState(showPassword ? "show-password" : "typing-password")}
                onBlur={() => setAvatarState("idle")}
                required
                className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 focus:ring-wangari-green-800/20 pr-12 font-semibold"
              />
              <button
                type="button"
                onClick={() => {
                  const next = !showPassword;
                  setShowPassword(next);
                  setAvatarState(next ? "show-password" : "typing-password");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-wangari-subtle hover:text-wangari-muted"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          )}

          {mfaStep ? (
            <button
              type="button"
              onClick={() => { setMfaStep(false); setTotpCode(""); setError(""); }}
              className="text-xs font-bold text-wangari-muted hover:text-wangari-text"
            >
              ← Back to password
            </button>
          ) : (
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-wangari-muted cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-wangari-border text-wangari-green-800 focus:ring-wangari-green-800/20"
              />
              Remember me
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-bold text-wangari-green-800 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          )}            <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full h-12 rounded-2xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-black text-sm transition-all cursor-pointer shadow-md"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                VERIFYING CODE...
              </>
            ) : mfaStep ? (
              <>
                VERIFY CODE
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                SIGN IN AS FARMER
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </button>
        </motion.div>
        </form>
      )}

      {/* ─── TAB 2: FARM WORKER CODE LOGIN ─── */}
      {userRole === "worker" && (
        <form
          onSubmit={handleWorkerSubmit}
          className="space-y-4"
        >
          <motion.div variants={fadeUp}>
          <div className="p-4 rounded-2xl bg-wangari-green-50 border border-wangari-green-200">
            <p className="text-xs font-bold text-wangari-green-900">
              Ask your Farm Owner for your Farm Connection Code or 4-digit PIN.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="farmCode" className="text-xs font-bold text-wangari-text">
              Farm Connection Code (Optional if single farm)
            </Label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-wangari-subtle" />
              <Input
                id="farmCode"
                type="text"
                placeholder="e.g. WANGARI-K7Q"
                value={farmCode}
                onChange={(e) => setFarmCode(e.target.value.toUpperCase())}
                onFocus={() => setAvatarState("typing-farm")}
                onBlur={() => setAvatarState("idle")}
                className="h-12 pl-11 rounded-xl border-wangari-border focus:border-wangari-green-800 uppercase font-black tracking-wider text-sm"
              />
            </div>
          </div>            <div className="space-y-1.5">
            <Label htmlFor="workerPin" className="text-xs font-bold text-wangari-text">
              Your 4-Digit Worker PIN
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-wangari-subtle" />
              <Input
                id="workerPin"
                type="password"
                maxLength={4}
                inputMode="numeric"
                placeholder="e.g. 1234"
                value={workerPin}
                onChange={(e) => setWorkerPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onFocus={() => setAvatarState("typing-password")}
                onBlur={() => setAvatarState("idle")}
                required
                className="h-12 pl-11 rounded-xl border-wangari-border focus:border-wangari-green-800 font-black tracking-widest text-lg"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !workerPin}
            className="w-full h-14 rounded-2xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-black text-base transition-all cursor-pointer shadow-lg active:scale-98"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                CONNECTING...
              </>
            ) : (
              <>
                CONNECT & LOG IN
                <ArrowRight className="h-5 w-5 ml-2" />
              </>
            )}
          </button>
        </motion.div>
        </form>
      )}

      {/* Google Sign-In (Owner only) */}
      {userRole === "owner" && (
        <>
          <motion.div variants={fadeUp} className="flex items-center gap-4">
            <div className="flex-1 h-px bg-wangari-border" />
            <span className="text-xs font-medium text-wangari-muted">or</span>
            <div className="flex-1 h-px bg-wangari-border" />
          </motion.div>

          <div className="space-y-3 relative z-10">
            <div
              ref={googleButtonRef}
              className="w-full cursor-pointer flex justify-center min-h-[48px]"
              onClick={() => {
                if (window.google?.accounts?.id) {
                  window.google.accounts.id.prompt();
                }
              }}
            />
            {!googleLoaded && (
              <button
                type="button"
                onClick={() => {
                  if (window.google?.accounts?.id) {
                    // Google already loaded — just prompt
                    window.google.accounts.id.prompt();
                    setGoogleLoaded(true);
                  } else {
                    // Silently retry loading the script (no error shown)
                    const existing = document.querySelector('script[src*="accounts.google.com/gsi"]');
                    if (!existing) {
                      const s = document.createElement("script");
                      s.src = "https://accounts.google.com/gsi/client";
                      s.async = true;
                      s.onload = () => {
                        if (window.google?.accounts?.id) {
                          const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                          if (!clientId) return;
                          window.google.accounts.id.initialize({ client_id: clientId, callback: async (r: any) => { try { await googleLogin(r.credential); router.push(callbackUrl); } catch (e: any) { setError(e?.message || "Google sign-in failed"); } } });
                          if (googleButtonRef.current) window.google.accounts.id.renderButton(googleButtonRef.current, { theme: "outline", size: "large", width: "100%" });
                          setGoogleLoaded(true);
                        }
                      };
                      document.head.appendChild(s);
                    }
                  }
                }}
                className="w-full h-12 rounded-xl border border-wangari-border flex items-center justify-center gap-3 hover:bg-wangari-cream active:scale-98 transition-all cursor-pointer bg-wangari-card"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span className="text-sm font-bold text-wangari-text">Sign in with Google</span>
              </button>
            )}
          </div>

          <motion.p variants={fadeUp} className="text-center text-sm text-wangari-muted">
            Don&apos;t have a farm account?{" "}
            <Link
              href="/register"
              className="font-bold text-wangari-green-800 hover:underline"
            >
              Create one free
            </Link>
          </motion.p>
        </>
      )}
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-wangari-green-800" /></div>}>
      <LoginForm />
    </React.Suspense>
  );
}
