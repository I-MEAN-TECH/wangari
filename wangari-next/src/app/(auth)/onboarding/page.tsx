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
  { id: "poultry", label: "Kuku", sub: "Mayai · nyuma", icon: Egg, emoji: "🐔", tint: "#B45309" },
  { id: "dairy", label: "Maziwa", sub: "Ng'ombe · mbuzi", icon: Milk, emoji: "🐄", tint: "#166534" },
  { id: "cattle", label: "Ng'ombe", sub: "Nyama", icon: Beef, emoji: "🐃", tint: "#7C2D12" },
  { id: "goats", label: "Mbuzi", sub: "Nyama", icon: Sprout, emoji: "🐐", tint: "#4D7C0F" },
  { id: "crops", label: "Bustani", sub: "Mahindi · mboga", icon: Wheat, emoji: "🌾", tint: "#166534" },
  { id: "horticulture", label: "Mboga", sub: "Maua · matunda", icon: Flower2, emoji: "🥬", tint: "#15803D" },
  { id: "fish", label: "Samaki", sub: "Mabwitu", icon: Droplets, emoji: "🐟", tint: "#0E7490" },
  { id: "bees", label: "Nyuki", sub: "Asali", icon: Sprout, emoji: "🐝", tint: "#A16207" },
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
      setError("Andika jina la shamba lako.");
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
      setError(e?.message || "Hatukuweza kuhifadhi. Jaribu tena.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F0FDF4] via-white to-[#F8FAFC] px-4 py-8 flex items-start justify-center">
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
                i <= step ? "bg-[#166534]" : "bg-[#E2E8F0]"
              }`}
            />
          ))}
        </div>

        {step === 0 ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold leading-tight text-[#0F172A] sm:text-3xl">
                Unafanya nini shambani?
              </h1>
              <p className="mx-auto mt-2 max-w-md text-[#475569]">
                Chagua moja. Hii inatusaidia kukuonyesha kitu kinachokusaidia.
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
                    className={`flex min-h-[128px] flex-col items-center justify-center gap-1 rounded-3xl border-2 p-3 transition-all active:scale-[0.98] ${
                      active ? "border-[#166534] bg-white shadow-lg" : "border-[#DCFCE7] bg-white"
                    }`}
                    aria-pressed={active}
                  >
                    <span className="text-4xl" aria-hidden>{f.emoji}</span>
                    <span className="flex items-center gap-1 text-sm font-bold text-[#0F172A]">
                      <Icon className="h-4 w-4" style={{ color: f.tint }} aria-hidden />
                      {f.label}
                    </span>
                    <span className="text-[11px] text-[#64748B]">{f.sub}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-center text-xs text-[#94A3B8]">
              Ungeza aina nyingine baadaye. Hatuhitaji kila kitu leo.
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold leading-tight text-[#0F172A] sm:text-3xl">
                Jina la shamba lako
              </h1>
              <p className="mx-auto mt-2 max-w-md text-[#475569]">
                Hii ndio jina litakachoonekana kwenye hoja zako.
              </p>
            </div>

            <div className="space-y-4 rounded-3xl border border-[#DCFCE7] bg-white p-5">
              <div>
                <label htmlFor="farmName" className="mb-1.5 block text-sm font-bold text-[#0F172A]">
                  Jina la shamba
                </label>
                <input
                  id="farmName"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  placeholder="Shamba la Amina"
                  maxLength={120}
                  className="h-14 w-full rounded-2xl border-2 border-[#E2E8F0] px-4 text-lg font-medium text-[#0F172A] outline-none focus:border-[#166534]"
                />
              </div>

              <div>
                <label htmlFor="county" className="mb-1.5 block text-sm font-bold text-[#0F172A]">
                  Wilaya <span className="font-normal text-[#94A3B8]">(hiari)</span>
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94A3B8]" aria-hidden />
                  <input
                    id="county"
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    placeholder="Kahawa"
                    maxLength={80}
                    className="h-14 w-full rounded-2xl border-2 border-[#E2E8F0] pl-12 pr-4 text-lg text-[#0F172A] outline-none focus:border-[#166534]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-bold text-[#0F172A]">
                  Namba ya simu <span className="font-normal text-[#94A3B8]">(hiari)</span>
                </label>
                <input
                  id="phone"
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  maxLength={40}
                  className="h-14 w-full rounded-2xl border-2 border-[#E2E8F0] px-4 text-lg text-[#0F172A] outline-none focus:border-[#166534]"
                />
              </div>

              {error ? (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  disabled={saving}
                  className="h-14 flex-1 rounded-2xl border-2 border-[#E2E8F0] text-base font-bold text-[#475569] disabled:opacity-50"
                >
                  Nyuma
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-2xl bg-[#166534] text-base font-bold text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <>
                      <Check className="h-5 w-5" aria-hidden />
                      Anza
                      <ArrowRight className="h-5 w-5" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-4 text-center text-xs leading-relaxed text-[#94A3B8]">
              Hatutumi taarifa zako kwa mtu yeyote bila idhini yako.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
