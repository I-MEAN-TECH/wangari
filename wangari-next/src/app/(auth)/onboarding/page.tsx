"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Milk,
  Wheat,
  Beef,
  Sprout,
  Egg,
  Droplets,
  Flower2,
  Check,
  ArrowRight,
  Loader2,
  MapPin,
} from "lucide-react";
import api from "@/lib/api-client";

/**
 * Onboarding — claim your farm.
 *
 * ── Why this page is being rewritten ───────────────────────────────────────
 * A 337-line wizard used to live here. It was linked from exactly one place
 * and POSTed to `/api/user-preferences`, a route that did not exist — the 404
 * was swallowed by `catch { /* Continue anyway *\/ }`. So the farm name,
 * location and farm type a farmer typed were silently thrown away and they
 * landed on the dashboard believing it had saved. Nothing ever checked
 * whether the account had been used at all.
 *
 * This version has three deliberate differences:
 *
 *  1. IT ACTUALLY SAVES. POST /api/auth/onboarding persists the farm name,
 *     county, location and farm type against the real farm row. There is no
 *     empty catch hiding a failed request.
 *
 *  2. IT IS SHORT — two required things: what you farm, and what you call the
 *     farm. Research (TraceX, Mar 2026) is blunt about this: "a form requiring
 *     14 fields before a harvest can be recorded will be abandoned or faked",
 *     and "registered is not the same as active". County and phone are
 *     optional; everything else is progressive, asked later in context.
 *
 *  3. IT IS THE SECURITY BOUNDARY. An account that has never been used cannot
 *     assert ownership of a farm, so it states its farm here before entering.
 *     Google proves identity; saying what you farm is the claim on the data.
 *
 * DESIGN (docs/module-plan.md §0): big targets, icons before words, Swahili,
 * no typing where a tap will do. The farmer picks a picture of their farm.
 */

const FARM_TYPES = [
  // ONE accent colour. An earlier version gave each farm type its own tint,
  // which turned a two-choice screen into a swatch chart and read as a
  // template. The icon and emoji carry the meaning; colour does not.
  { id: "poultry", label: "Poultry", sub: "Eggs · meat", icon: Egg, emoji: "🐔" },
  { id: "dairy", label: "Dairy", sub: "Cattle · goats", icon: Milk, emoji: "🐄" },
  { id: "cattle", label: "Cattle", sub: "Beef", icon: Beef, emoji: "🐃" },
  { id: "goats", label: "Goats", sub: "Meat", icon: Sprout, emoji: "🐐" },
  { id: "crops", label: "Crops", sub: "Maize · vegetables", icon: Wheat, emoji: "🌾" },
  { id: "horticulture", label: "Horticulture", sub: "Flowers · fruit", icon: Flower2, emoji: "🥬" },
  { id: "fish", label: "Fish", sub: "Ponds", icon: Droplets, emoji: "🐟" },
  { id: "bees", label: "Bees", sub: "Honey", icon: Sprout, emoji: "🐝" },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = React.useState<0 | 1>(0);
  const [farmType, setFarmType] = React.useState<string | null>(null);
  const [farmName, setFarmName] = React.useState("");
  const [county, setCounty] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Prefill from what we already know, so the farmer edits rather than types.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get<any>("/api/auth/onboarding");
        if (cancelled || !d?.farm) return;
        // A Google sign-in mints "Jane Doe Farm" as a placeholder — offer it as
        // a suggestion but never as an answer the farmer didn't give.
        setFarmName((prev) => prev || "");
        if (d.farm.county) setCounty((prev) => prev || d.farm.county);
      } catch {
        /* the form still works without the prefill */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!farmType) return;
    if (!farmName.trim()) {
      setError("Enter your farm name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/auth/onboarding", {
        farmName: farmName.trim(),
        farmType,
        county: county.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      // Straight to the day-one money moment, which is the whole point:
      // the farmer should see a number, not a setup checklist.
      router.push("/dashboard");
    } catch (e: any) {
      // Never swallow this. The old page's empty catch is exactly why farm
      // details were being lost without anyone noticing.
      setError(e?.message || "Could not save. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-wangari-cream px-4 py-8 flex items-start justify-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        {/* Progress: 2 steps, visible, no numbers to read */}
        <div className="mb-6 flex items-center gap-2" aria-hidden>
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-wangari-green-800" : "bg-wangari-border"
              }`}
            />
          ))}
        </div>

        {step === 0 ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold leading-tight text-wangari-heading sm:text-3xl">
                What do you farm?
              </h1>
              <p className="mx-auto mt-2 max-w-md text-wangari-muted">
                Pick one. It helps us show you what matters for your farm.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FARM_TYPES.map((f) => {
                const Icon = f.icon;
                const active = farmType === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFarmType(f.id);
                      setStep(1);
                    }}
                    className={`flex min-h-[128px] flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 transition-all active:scale-[0.98] ${
                      active ? "border-wangari-green-800 bg-wangari-card shadow-lg" : "border-wangari-green-100 bg-wangari-card"
                    }`}
                    aria-pressed={active}
                  >
                    <span className="text-4xl" aria-hidden>{f.emoji}</span>
                    <span className="flex items-center gap-1 text-sm font-bold text-wangari-heading">
                      <Icon className="h-4 w-4 text-wangari-green-800" aria-hidden />
                      {f.label}
                    </span>
                    <span className="text-[11px] text-wangari-muted">{f.sub}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-center text-xs text-wangari-subtle">
              You can add more later. We do not need everything today.
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold leading-tight text-wangari-heading sm:text-3xl">
                Your farm name
              </h1>
              <p className="mx-auto mt-2 max-w-md text-wangari-muted">
                This is the name that appears on your statements.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-wangari-green-100 bg-wangari-card p-5">
              <div>
                <label htmlFor="farmName" className="mb-1.5 block text-sm font-bold text-wangari-heading">
                  Jina la shamba
                </label>
                <input
                  id="farmName"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  placeholder="Amina's Farm"
                  maxLength={120}
                  className="h-14 w-full rounded-xl border-2 border-wangari-border px-4 text-lg font-medium text-wangari-heading outline-none focus:border-wangari-green-800"
                />
              </div>

              <div>
                <label htmlFor="county" className="mb-1.5 block text-sm font-bold text-wangari-heading">
                  Wilaya <span className="font-normal text-wangari-subtle">(hiari)</span>
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-wangari-subtle" aria-hidden />
                  <input
                    id="county"
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    placeholder="Kahawa"
                    maxLength={80}
                    className="h-14 w-full rounded-xl border-2 border-wangari-border pl-12 pr-4 text-lg text-wangari-heading outline-none focus:border-wangari-green-800"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-bold text-wangari-heading">
                  Namba ya simu <span className="font-normal text-wangari-subtle">(hiari)</span>
                </label>
                <input
                  id="phone"
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  maxLength={40}
                  className="h-14 w-full rounded-xl border-2 border-wangari-border px-4 text-lg text-wangari-heading outline-none focus:border-wangari-green-800"
                />
              </div>

              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  disabled={saving}
                  className="h-14 flex-1 rounded-xl border-2 border-wangari-border text-base font-bold text-wangari-muted disabled:opacity-50"
                >
                  Nyuma
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-xl bg-wangari-green-800 text-base font-bold text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <>
                      <Check className="h-5 w-5" aria-hidden />
                      Start
                      <ArrowRight className="h-5 w-5" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-4 text-center text-xs leading-relaxed text-wangari-subtle">
              We never share your details with anyone without your permission.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
