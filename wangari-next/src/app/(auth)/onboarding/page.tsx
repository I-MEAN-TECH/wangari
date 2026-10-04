"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Milk,
  Wheat,
  Beef,
  Rabbit,
  Egg,
  Fish,
  Flower2,
  Birdhouse,
  Check,
  ArrowRight,
  Loader2,
  MapPin,
  PartyPopper,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FIRST_RECORD_CHOICES } from "@/lib/first-record-choices";
import { onboardingRequired } from "@/lib/onboarding";

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
 *  4. IT ENDS ON THE FIRST RECORD, NOT ON A DASHBOARD OF ZEROS. The 2 Oct
 *     production audit found 5 of 8 farms had recorded nothing at all, and the
 *     documented cause was not sign-up but what a farmer met next: a dashboard
 *     of empty ratios that paid him nothing, so there was nothing to do twice.
 *     So the last step offers the two day-one jobs (docs/module-plan.md §8,
 *     Phase 0) and walks him straight into one. This is deliberately NOT a
 *     gate: the skip button is right there, because a step that traps a farmer
 *     is the exact bug this file was rewritten to kill.
 *
 * DESIGN: icons before words, no typing where a tap will do, and the same
 * Card/Button/Input primitives and sizing as the rest of the app. The farmer
 * picks a picture of their farm.
 */

const FARM_TYPES = [
  // ONE accent colour. An earlier version gave each farm type its own tint,
  // which turned this into a swatch chart and read as a template. The icon
  // carries the meaning; colour does not.
  //
  // Icons are lucide, never emoji: emoji render differently per platform, do
  // not inherit the text colour, and cannot be sized to match an icon set.
  // Lucide has no goat or bee, so Goats uses Rabbit (small livestock) and
  // Bees uses Birdhouse (the structure, which is how a keeper thinks of it).
  { id: "poultry", label: "Poultry", sub: "Eggs · meat", icon: Egg },
  { id: "dairy", label: "Dairy", sub: "Cattle · goats", icon: Milk },
  { id: "cattle", label: "Cattle", sub: "Beef", icon: Beef },
  { id: "goats", label: "Goats", sub: "Meat", icon: Rabbit },
  { id: "crops", label: "Crops", sub: "Maize · vegetables", icon: Wheat },
  { id: "horticulture", label: "Horticulture", sub: "Flowers · fruit", icon: Flower2 },
  { id: "fish", label: "Fish", sub: "Ponds", icon: Fish },
  { id: "bees", label: "Bees", sub: "Honey", icon: Birdhouse },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = React.useState<0 | 1 | 2>(0);
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
        // Already claimed? Then this form is a dead end he has already passed.
        // Without this, a farmer who claimed his farm and then refreshed on the
        // last step would be dropped back onto step 0 to type his farm name a
        // second time — the claim is durable, so the form must be too.
        //
        // The decision is the same tested rule the gate uses, not a second
        // copy of it, so the two cannot disagree about who is finished.
        if (!onboardingRequired({ firstRecordAt: d.firstRecordAt, claimedAt: d.claimedAt })) {
          router.replace("/dashboard");
          return;
        }
        // Only the county is worth pre-filling. The farm NAME is never
        // suggested from server data: a name the farmer did not choose is not
        // their answer, and silently accepting one is how a placeholder like
        // "Jane Doe Farm" ends up on a real statement.
        if (d.farm.county) setCounty((prev) => prev || d.farm.county);
      } catch {
        /* the form still works without the prefill */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
      // Step 2, NOT the dashboard. Claiming the farm is the security boundary
      // and it is done; the farmer is now owed something for having done it.
      //
      // The server sets farms.claimed_at on this POST, and OnboardingGate clears
      // on either claimedAt or real activity — so the doors on step 2 lead into
      // a farm he legitimately owns and the gate will not bounce him back.
      // That was verified against the server before building this, precisely
      // because getting it wrong would loop him between this page and /onboarding
      // forever.
      setStep(2);
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
        {/* Progress: 3 steps, visible, no numbers to read */}
        <div className="mb-6 flex items-center gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
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
                    onClick={() => setFarmType(f.id)}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-2",
                      "rounded-xl border p-4 transition-colors duration-200",
                      active
                        ? "border-wangari-green-600 bg-wangari-green-50"
                        : "border-wangari-border bg-wangari-card hover:border-wangari-green-300 hover:bg-wangari-green-50"
                    )}
                    aria-pressed={active}
                  >
                    {active ? (
                      <Check
                        className="absolute right-2 top-2 h-4 w-4 text-wangari-green-700"
                        aria-hidden
                      />
                    ) : null}
                    <Icon className="h-6 w-6 text-wangari-green-700" aria-hidden />
                    <span className="text-sm font-semibold text-wangari-heading">
                      {f.label}
                    </span>
                    <span className="text-xs text-wangari-muted">{f.sub}</span>
                  </button>
                );
              })}
            </div>

            {/* Tapping a tile selects it and marks it with a tick, rather than
                jumping straight on. Without that confirmation the farmer never
                learns whether the tap landed — and on a cheap handset they
                usually assume it did not. Two taps, not one. */}
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={() => setStep(1)}
              disabled={!farmType}
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>

            <p className="mt-4 text-center text-xs text-wangari-subtle">
              You can add more later. We do not need everything today.
            </p>
          </>
        ) : step === 1 ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold leading-tight text-wangari-heading sm:text-3xl">
                Your farm name
              </h1>
              <p className="mx-auto mt-2 max-w-md text-wangari-muted">
                This is the name that appears on your statements.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-wangari-border bg-wangari-card p-6">
              <div>
                <Label htmlFor="farmName" className="mb-1.5 block">
                  Farm name
                </Label>
                <Input
                  id="farmName"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  placeholder="Amina's Farm"
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="county" className="mb-1.5 block">
                  County{" "}
                  <span className="font-normal text-wangari-subtle">(optional)</span>
                </Label>
                <div className="relative">
                  <MapPin
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wangari-subtle"
                    aria-hidden
                  />
                  <Input
                    id="county"
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    placeholder="Kahawa"
                    maxLength={80}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="phone" className="mb-1.5 block">
                  Phone number{" "}
                  <span className="font-normal text-wangari-subtle">(optional)</span>
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  maxLength={40}
                />
              </div>

              {error ? (
                <p className="rounded-lg border border-tone-bad-border bg-tone-bad-bg px-4 py-3 text-sm font-medium text-tone-bad-text">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(0)}
                  disabled={saving}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-[2]"
                  onClick={submit}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <>
                      <Check className="h-4 w-4" aria-hidden />
                      Start
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </Button>
              </div>
            </div>

            <p className="mt-4 text-center text-xs leading-relaxed text-wangari-subtle">
              We never share your details with anyone without your permission.
            </p>
          </>
        ) : (
          /* ── Step 2: the first record, and the reason to come back ──────────
             Claiming the farm is the last thing we ask him to do before he gets
             anything. So we do not leave him on a dashboard of zeros; we offer
             the one job he can finish tonight.

             The same two choices the dashboard FirstRunCard shows, from the
             shared module, so the two screens can never drift apart. */
          <>
            <div className="mb-6 text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-wangari-green-50 px-4 py-1.5 text-wangari-green-800">
                <PartyPopper className="h-4 w-4" aria-hidden />
                <span className="text-sm font-semibold">Farm claimed</span>
              </div>
              <h1 className="text-2xl font-bold leading-tight text-wangari-heading sm:text-3xl">
                What did you get today?
              </h1>
              <p className="mx-auto mt-2 max-w-md text-wangari-muted">
                Pick one. You will see the number straight away.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FIRST_RECORD_CHOICES.map((c) => {
                const Icon = c.icon;
                return (
                  <Link
                    key={c.id}
                    href={c.href}
                    className={cn(
                      "group flex flex-col gap-2 rounded-2xl border border-wangari-border bg-wangari-card p-6",
                      "transition-all duration-200",
                      "hover:-translate-y-0.5 hover:border-wangari-green-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                    )}
                  >
                    <Icon className="h-7 w-7 text-wangari-green-700" aria-hidden />
                    <span className="text-base font-semibold text-wangari-heading">
                      {c.title}
                    </span>
                    <span className="-mt-1 text-sm text-wangari-muted">
                      {c.subtitle}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-wangari-green-800">
                      {c.cta}
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* A visible way out (R9). The step is an invitation, not a toll
                gate — a farmer who cannot answer today must still be able to
                reach the dashboard and come back tomorrow. */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-6 w-full"
              onClick={() => {
                // Pushing here rather than automatically is deliberate: the
                // dashboard layout mounts OnboardingGate, and entering it via a
                // real navigation makes it re-read the claim we just saved
                // instead of reusing a cached pre-claim decision.
                router.push("/dashboard", { scroll: false });
                router.refresh();
              }}
            >
              Do this later
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
