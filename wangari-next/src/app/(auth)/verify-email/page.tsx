"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight, Mail, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackEvent } from "@/lib/posthog";
import { setToken, setUser, type AuthUser } from "@/lib/auth-client";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [code, setCode] = React.useState(["", "", "", "", "", ""]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [verified, setVerified] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [devNotice, setDevNotice] = React.useState<string | null>(null);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Auto-send code on mount if coming from registration
  React.useEffect(() => {
    if (email && !verified) {
      handleSendCode(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cooldown timer for resend
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendCode = async (silent = false) => {
    if (!email) return;
    if (!silent) setResending(true);
    setError("");

    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      if (data.devCode) {
        setDevCode(String(data.devCode));
        setDevNotice(
          data.message || "Email delivery is unavailable — use the code below."
        );
        trackEvent("verification_code_fallback_shown", { email });
      } else {
        setDevCode(null);
        setDevNotice(null);
        trackEvent("verification_code_sent", { email, silent });
      }
      if (!silent) setCooldown(60); // 60s cooldown
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to send code");
      }
      trackEvent("verification_code_send_failed", {
        email,
        error: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      if (!silent) setResending(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError("");

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5) {
      const fullCode = newCode.join("");
      if (fullCode.length === 6) {
        handleVerify(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      const newCode = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
      setCode(newCode);
      // Focus the next empty or the last
      const nextEmpty = newCode.findIndex((c) => !c);
      inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
      // Auto-submit if full code pasted
      if (pasted.length === 6) {
        handleVerify(pasted);
      }
    }
  };

  const handleVerify = async (fullCode: string) => {
    if (!email || fullCode.length !== 6) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: fullCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      // Verification completes the login: the server issues the session token
      // on success, so store it and the user lands in the dashboard directly.
      if (data.token && data.user) {
        setToken(data.token);
        setUser(data.user as AuthUser);
        trackEvent("user_logged_in", { method: "email_verification", user_id: data.user.id });
      }
      setVerified(true);
      trackEvent("email_verified", { email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      trackEvent("verification_code_wrong", { email });
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ──────────────────────────────────────
  if (verified) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="space-y-8 text-center"
      >
        <motion.div variants={fadeUp} className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-[#166534]/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-[#166534]" />
          </div>
        </motion.div>
        <motion.div variants={fadeUp}>
          <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">
            Email verified!
          </h1>
          <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
            Your account is now fully active. Let&apos;s get your farm set up.
          </p>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Button
            onClick={() => router.push("/onboarding")}
            className="w-full h-12 rounded-xl bg-[#166534] hover:bg-[#14532D] text-white font-bold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#166534]/25 hover:-translate-y-0.5 cursor-pointer"
          >
            Continue to Setup
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Code entry ─────────────────────────────────────────
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-8"
    >
      {/* Heading */}
      <motion.div variants={fadeUp}>
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-[#166534]/10 flex items-center justify-center">
            <Mail className="h-7 w-7 text-[#166534]" />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight text-center">
          Verify your email
        </h1>
        <p className="mt-2 text-sm text-[#64748B] text-center">
          We sent a 6-digit code to<br />
          <span className="font-semibold text-[#334155]">{email}</span>
        </p>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium"
        >
          {error}
        </motion.div>
      )}

      {/* On-screen code fallback (shown when email delivery failed or is disabled) */}
      {devCode && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-4 text-center"
        >
          <p className="text-xs font-semibold text-amber-800 mb-2">{devNotice}</p>
          <p className="text-2xl font-bold tracking-[0.3em] text-amber-900 font-mono">
            {devCode}
          </p>
          <p className="text-[11px] text-amber-700 mt-2">
            Enter this code above to verify. It expires in 15 minutes.
          </p>
        </motion.div>
      )}

      {/* Code inputs */}
      <motion.div variants={fadeUp} className="space-y-6">
        <div className="flex justify-center gap-3">
          {code.map((digit, i) => (
            <Input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              disabled={loading}
              className="w-12 h-14 text-center text-xl font-bold rounded-xl border-[#E5E7EB] focus:border-[#166534] focus:ring-[#166534]/20 transition-all"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-[#64748B]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying...
          </div>
        )}
      </motion.div>

      {/* Resend */}
      <motion.div variants={fadeUp} className="text-center space-y-3">
        <p className="text-xs text-[#94A3B8]">
          Code expires in 15 minutes
        </p>
        <button
          onClick={() => handleSendCode()}
          disabled={resending || cooldown > 0}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#166534] hover:underline disabled:text-[#94A3B8] disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
          {cooldown > 0
            ? `Resend code in ${cooldown}s`
            : resending
              ? "Sending..."
              : "Resend code"}
        </button>
      </motion.div>

      {/* Spam folder tip — also trains Gmail when the user marks us Not Spam */}
      <motion.div
        variants={fadeUp}
        className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3.5"
      >
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1">
          <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          Not seeing the code? Check Spam <em>and</em> Promotions/Updates tabs
        </p>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Gmail splits mail across tabs — the code sometimes lands in
          <strong> Promotions</strong> or <strong>Updates</strong>. If it&apos;s
          in Spam, open it and tap <strong>“Not spam”</strong>. That tells
          Gmail to deliver our future emails straight to your inbox.
        </p>
      </motion.div>

      {/* Back to login */}
      <motion.div variants={fadeUp} className="text-center">
        <Link
          href="/login"
          className="text-sm font-semibold text-[#64748B] hover:text-[#334155] transition-colors"
        >
          ← Back to sign in
        </Link>
      </motion.div>
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#166534]" />
      </div>
    }>
      <VerifyEmailForm />
    </React.Suspense>
  );
}
