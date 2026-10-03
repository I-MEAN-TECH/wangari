"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PhoneField, PinField, PinKeypad, PinConfirmHint } from "@/components/auth/phone-pin-field";
import { registerWithPhone, loginWithPhone } from "@/lib/phone-auth";

/**
 * Phone + PIN sign-in and sign-up (gap-analysis row 0, GAP 1).
 *
 * This screen is the answer to the finding that 5 of 8 production farms had
 * never recorded anything. The email register asks for a name, an email, a
 * password, a farm name and then an email OTP — five documented abandonment
 * triggers in a row, per the ICTworks research, before the farmer sees anything
 * they came for. This asks for two things and creates the farm.
 *
 * Both modes live on one screen because a farmer who has never used this app
 * arrives at "sign in" by habit and should not have to hunt for another page.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

type Mode = "login" | "register";

export default function PhoneAuthPage() {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("login");

  const [phone, setPhone] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [name, setName] = React.useState("");
  const [farmName, setFarmName] = React.useState("");
  const [coopCode, setCoopCode] = React.useState("");

  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const isRegister = mode === "register";

  const reset = () => {
    setPin("");
    setConfirmPin("");
    setError("");
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    reset();
  };

  const canSubmit =
    phone.replace(/\D/g, "").length >= 10 &&
    pin.length === 4 &&
    (!isRegister || (confirmPin.length === 4 && confirmPin === pin));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    try {
      if (isRegister) {
        const res = await registerWithPhone({
          phone,
          pin,
          name: name.trim() || undefined,
          farmName: farmName.trim() || undefined,
          coopCode: coopCode.trim() || undefined,
        });
        // A co-op member should land in onboarding, not a screen asking about
        // things their chair already told the group.
        router.push(res.coopJoined ? "/onboarding?coop=1" : "/onboarding");
      } else {
        await loginWithPhone({ phone, pin });
        router.push("/dashboard");
      }
    } catch (err: any) {
      // Server messages are written for farmers; surface them verbatim rather
      // than replacing them with a generic failure.
      setError(err?.message ?? "Something went wrong. Try again.");
      setPin("");
      setConfirmPin("");
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (isRegister) setConfirmPin((c) => (c.length >= 4 ? c : (c + d).slice(0, 4)));
  };

  const backspace = () => {
    setPin((p) => p.slice(0, -1));
    setConfirmPin((c) => c.slice(0, -1));
  };

  return (
    <div className="min-h-screen bg-wangari-bg flex items-center justify-center px-4 py-10">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="w-full max-w-md">
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-wangari-green-50">
                <ShieldCheck className="h-6 w-6 text-wangari-green-800" />
              </div>
              <h1 className="text-2xl font-semibold text-wangari-heading">
                {isRegister ? "Start recording" : "Welcome back"}
              </h1>
              <p className="text-sm text-wangari-muted">
                {isRegister
                  ? "Your phone number and a 4-digit PIN. No email, no password."
                  : "Enter your phone number and PIN."}
              </p>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-full bg-wangari-green-50 p-1">
              {(["login", "register"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    mode === m ? "bg-white text-wangari-green-800 shadow-sm" : "text-wangari-muted"
                  }`}
                >
                  {m === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <PhoneField value={phone} onChange={setPhone} autoFocus />

              {isRegister && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-semibold text-wangari-heading leading-none">
                      Your name
                    </label>
                    <input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Optional"
                      className="flex h-11 w-full rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading placeholder:text-wangari-subtle focus-visible:outline-none focus-visible:border-wangari-green-500 focus-visible:ring-2 focus-visible:ring-wangari-green-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="farm" className="text-sm font-semibold text-wangari-heading leading-none">
                      Farm name
                    </label>
                    <input
                      id="farm"
                      value={farmName}
                      onChange={(e) => setFarmName(e.target.value)}
                      placeholder="Optional"
                      className="flex h-11 w-full rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm text-wangari-heading placeholder:text-wangari-subtle focus-visible:outline-none focus-visible:border-wangari-green-500 focus-visible:ring-2 focus-visible:ring-wangari-green-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="coop" className="text-sm font-semibold text-wangari-heading leading-none">
                      Co-op or group code
                    </label>
                    <input
                      id="coop"
                      value={coopCode}
                      onChange={(e) => setCoopCode(e.target.value.toUpperCase())}
                      placeholder="Optional"
                      maxLength={6}
                      className="flex h-11 w-full rounded-xl border border-wangari-border bg-white px-4 py-2 text-sm uppercase tracking-widest text-wangari-heading placeholder:normal-case placeholder:tracking-normal placeholder:text-wangari-subtle focus-visible:outline-none focus-visible:border-wangari-green-500 focus-visible:ring-2 focus-visible:ring-wangari-green-500/20"
                    />
                    <p className="text-xs text-wangari-muted flex items-start gap-1.5">
                      <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      If your chairperson gave you a code, enter it here and you will join the group automatically.
                    </p>
                  </div>
                </>
              )}

              <PinField value={pin} onChange={setPin} showStrength={isRegister} error={error} />

              {isRegister && (
                <>
                  <PinField
                    value={confirmPin}
                    onChange={setConfirmPin}
                    label="PIN again"
                    hint="Just to be sure you have it."
                    autoFocus={false}
                    id="pin-confirm"
                  />
                  <PinConfirmHint pin={pin} confirm={confirmPin} />
                </>
              )}

              <PinKeypad onDigit={addDigit} onBackspace={backspace} />

              <Button type="submit" size="lg" className="w-full" disabled={!canSubmit || loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isRegister ? "Create my account" : "Sign in"}
              </Button>
            </form>

            <div className="border-t border-wangari-border pt-4 text-center">
              <p className="text-sm text-wangari-muted">
                Prefer email?{" "}
                <Link href="/login" className="font-semibold text-wangari-green-800 hover:underline">
                  Sign in with email
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}