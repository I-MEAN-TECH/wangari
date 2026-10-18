"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Hard paywall gate. When the server reports the account is fully locked
 * (trial expired + no active subscription), every dashboard route is blocked
 * except the ones in ALLOWED — the user lands on /subscription no matter how
 * they navigate (sidebar, mobile bottom nav, floating action button, stat
 * cards, shortcuts, or a typed URL). Server APIs are already locked down via
 * auth middleware; this is the client-side mirror so no locked page ever
 * renders.
 */
// Pages always accessible, even on free_core (no subscription).
const ALWAYS_ALLOWED = [
  "/dashboard",
  "/subscription",
  "/finances",
  "/inventory",
  "/transactions",
  "/deliveries",
  "/weather",
  "/settings",
  "/learn",
  "/library",
  "/feed-calculator",
  "/ai",
  "/whatsapp",
  "/onboarding",
];


function isAlwaysAllowed(pathname: string) {
  return ALWAYS_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AccessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = React.useState(false);
  const planRef = React.useRef<string>("");
  const tierRef = React.useRef<string>("free_core");
  const lockedRef = React.useRef<boolean>(false);

  const check = React.useCallback(async () => {
    try {
      const { default: api } = await import("@/lib/api-client");
      const d = await api.get("/api/trial/status");
      tierRef.current = d?.tier ?? (d?.locked ? "none" : "free_core");
      lockedRef.current = d?.tier === "none";
      planRef.current = (d?.subscription?.plan || "").toLowerCase();
    } catch {
      // Network/API failure must never lock a paying user out of the UI —
      // the server still enforces real access on every API call.
      lockedRef.current = false;
      tierRef.current = "free_core";
      planRef.current = "";
    }
    setChecked(true);
  }, []);

  React.useEffect(() => {
    check();
  }, [check]);

  // A redeemed promo code or completed payment unlocks instantly, without a
  // reload; a mid-session trial expiry locks instantly.
  React.useEffect(() => {
    const refetch = () => {
      setChecked(false);
      check();
    };
    window.addEventListener("wangari:subscription_updated", refetch);
    window.addEventListener("wangari:trial_expired", refetch);
    return () => {
      window.removeEventListener("wangari:subscription_updated", refetch);
      window.removeEventListener("wangari:trial_expired", refetch);
    };
  }, [check]);

  React.useEffect(() => {
    if (!checked) return;
    const tier = tierRef.current;
    const plan = planRef.current;
    // Hard lock (tier === "none") should never happen now that free_core is the
    // floor, but keep it as a safety net.
    if (tier === "none" && !isAlwaysAllowed(pathname)) {
      router.replace("/subscription");
      return;
    }
    // Free-core: only redirect if user is trying to open a gated page.
    // _always pages (dashboard, finances, inventory, transactions) are open.
    if (tier === "free_core" && !isAlwaysAllowed(pathname)) {
      router.replace("/subscription");
      return;
    }
    // Starter: block team/growth-only routes
    const isStarter = /starter/.test(plan) && !/growth|enterprise/.test(plan);
    const GROWTH_ONLY = ["/workers", "/attendance", "/coop", "/loans", "/reports"];
    if (isStarter && GROWTH_ONLY.some(p => pathname === p || pathname.startsWith(p + "/"))) {
      router.replace("/subscription");
    }
  }, [checked, pathname, router]);

  return <>{children}</>;
}
