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
const ALLOWED = ["/dashboard", "/subscription"];

function isAllowed(pathname: string) {
  return ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AccessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = React.useState(false);
  const lockedRef = React.useRef(false);

  const check = React.useCallback(async () => {
    try {
      const { default: api } = await import("@/lib/api-client");
      const d = await api.get("/api/trial/status");
      lockedRef.current = !!d?.locked;
    } catch {
      // Network/API failure must never lock a paying user out of the UI —
      // the server still enforces real access on every API call.
      lockedRef.current = false;
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
    if (checked && lockedRef.current && !isAllowed(pathname)) {
      router.replace("/subscription");
    }
  }, [checked, pathname, router]);

  return <>{children}</>;
}
