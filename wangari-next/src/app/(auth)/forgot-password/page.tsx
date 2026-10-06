"use client";

import * as React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Loader2, ArrowRight, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword } from "@/lib/auth-client";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
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
            Check your email
          </h1>
          <p className="mt-3 text-sm text-wangari-muted leading-relaxed">
            We sent a password reset link to<br />
            <span className="font-semibold text-wangari-text">{email}</span>
          </p>
        </motion.div>
        <motion.div variants={fadeUp} className="space-y-4">
          <p className="text-xs text-wangari-subtle">
            Didn&apos;t receive it? Check your spam folder or try again.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-wangari-green-800 hover:underline"
          >
            Back to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </motion.div>
    );
  }

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
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-wangari-muted">
          Enter your email and we&apos;ll send you a reset link
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
          <Label htmlFor="email" className="text-sm font-semibold text-wangari-text">
            Email
          </Label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-wangari-subtle">
              <Mail className="h-4 w-4" />
            </div>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 focus:ring-wangari-green-800/20 transition-all pl-10"
            />
          </div>
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
                Sending link...
              </>
            ) : (
              <>
                Send Reset Link
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
