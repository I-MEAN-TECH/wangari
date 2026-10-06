"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/auth-client";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  if (!token) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="space-y-8 text-center"
      >
        <motion.div variants={fadeUp} className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-tone-bad-bg flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-wangari-red-500" />
          </div>
        </motion.div>
        <motion.div variants={fadeUp}>
          <h1 className="text-3xl font-extrabold text-wangari-heading tracking-tight">
            Invalid reset link
          </h1>
          <p className="mt-3 text-sm text-wangari-muted leading-relaxed">
            This password reset link is invalid or missing a token.
            <br />
            Please request a new one.
          </p>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 text-sm font-semibold text-wangari-green-800 hover:underline"
          >
            Request new reset link
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </motion.div>
    );
  }

  if (success) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="space-y-8 text-center"
      >
        <motion.div variants={fadeUp} className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-wangari-green-800/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-wangari-green-800" />
          </div>
        </motion.div>
        <motion.div variants={fadeUp}>
          <h1 className="text-3xl font-extrabold text-wangari-heading tracking-tight">
            Password reset!
          </h1>
          <p className="mt-3 text-sm text-wangari-muted leading-relaxed">
            Your password has been updated. You can now sign in with your new password.
          </p>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Button
            onClick={() => router.push("/login")}
            className="h-12 rounded-xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-bold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-wangari-green-800/25 hover:-translate-y-0.5 cursor-pointer px-8"
          >
            Sign In
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-8"
    >
      {/* Heading */}
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-extrabold text-wangari-heading tracking-tight">
          Set new password
        </h1>
        <p className="mt-2 text-sm text-wangari-muted">
          Choose a strong password for your account
        </p>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-tone-bad-bg border border-tone-bad-border px-4 py-3 text-sm text-badge-red-text font-medium"
        >
          {error}
        </motion.div>
      )}

      {/* Form */}
      <motion.form
        variants={fadeUp}
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <motion.div variants={fadeUp} className="space-y-2">
          <Label htmlFor="password" className="text-sm font-semibold text-wangari-text">
            New Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 focus:ring-wangari-green-800/20 transition-all pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-wangari-subtle hover:text-wangari-muted transition-colors"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-semibold text-wangari-text">
            Confirm Password
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 focus:ring-wangari-green-800/20 transition-all"
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-bold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-wangari-green-800/25 hover:-translate-y-0.5 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Resetting password...
              </>
            ) : (
              <>
                Reset Password
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </motion.div>
      </motion.form>

      {/* Back to login */}
      <motion.div variants={fadeUp} className="text-center">
        <Link
          href="/login"
          className="text-sm font-semibold text-wangari-muted hover:text-wangari-text transition-colors"
        >
          ← Back to sign in
        </Link>
      </motion.div>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-wangari-green-800" /></div>}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}
