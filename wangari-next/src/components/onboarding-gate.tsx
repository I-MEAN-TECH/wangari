"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import api from "@/lib/api-client";
import { onboardingRequired } from "@/lib/onboarding";

/**
 * OnboardingGate — an account that has never been used must claim its farm.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Nothing used to check whether an account had ever been used. A brand-new
 * account — or a Google sign-in that auto-created a placeholder "Jane Doe
 * Farm" — walked straight onto the dashboard with an empty farm behind it. On
 * a shared family handset (documented as one of the top farmer-adoption
 * barriers) the next person to pick up the phone simply inherited the session.
 *
 * The gate sends an account with NO real activity to /onboarding, where it
 * states what it farms and claims it. Identity is proven at sign-in; ownership
 * of the farm is proven by claiming it.
 *
 * ── The rule that must never break ─────────────────────────────────────────
 * Two signals mean "past onboarding": the farmer CLAIMED their farm, or they
 * have real activity. Either one clears the gate. Gating on activity alone was
 * the original bug: claiming a farm creates no records, so every farmer who
 * submitted the form was bounced straight back here, forever. That logic lives
 * in lib/onboarding.ts and is tested.
 *
 * While the state is loading we render nothing rather than guessing — a flash
 * of the wrong decision would be worse than a blank frame.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = React.useState<"loading" | "clear" | "gate">("loading");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get<{
          firstRecordAt: string | null;
          claimedAt: string | null;
        }>("/api/auth/onboarding");
        if (cancelled) return;
        setState(
          onboardingRequired({
            firstRecordAt: d?.firstRecordAt ?? null,
            claimedAt: d?.claimedAt ?? null,
          })
            ? "gate"
            : "clear"
        );
      } catch {
        // A network failure must NEVER gate a paying, working farmer out of
        // their own farm. Fail open — the server still enforces real access.
        if (!cancelled) setState("clear");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (state === "gate" && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [state, pathname, router]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wangari-cream">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-wangari-green-800 border-t-transparent" />
      </div>
    );
  }

  if (state === "gate") return null;

  return <>{children}</>;
}

export default OnboardingGate;
