"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { WifiOff, RefreshCw } from "lucide-react";

/**
 * Tells a farmer the truth when the backend is unreachable.
 *
 * When api.wangari.imeantech.com stops answering, every screen silently stops
 * updating: lists look empty, totals look zero, a failed "save" looks exactly
 * like a successful one. That is the worst possible failure for a farmer —
 * they think their records are gone, or worse, they trust a number that is
 * simply stale.
 *
 * So we probe /health and, when the API is genuinely unreachable, say so in
 * plain language across the whole app.
 *
 * Two deliberate choices:
 *  - This is NOT a maintenance flag in the repo. A hardcoded switch would be
 *    one forgotten edit away from outliving the outage and telling farmers
 *    their farm is broken when it is fine. The banner follows reality.
 *  - It only ever hides itself. It never blocks input, never swallows writes,
 *    and never fabricates data. Farmers can still use the app; they are simply
 *    told the truth about whether what they are seeing is live.
 */

const POLL_MS = 20_000;
// One failed probe is not an outage — mobile signal drops constantly. Only
// speak up after this many consecutive failures.
const FAILURES_BEFORE_SHOWING = 2;

export function MaintenanceNotice() {
  const [unreachable, setUnreachable] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const pathname = usePathname();

  // The subscription page is where a farmer goes ON PURPOSE to pay, and
  // subscription state cannot be read while the API is down — saying "we're
  // down" there would be circular. The admin panel IS included: it is the
  // first thing to break in an outage and the least obvious to diagnose.
  const skip =
    pathname?.startsWith("/subscription") ||
    pathname?.startsWith("/back-");

  const probe = React.useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`${base}/health`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      setUnreachable(!res.ok);
      return res.ok;
    } catch {
      setUnreachable(true);
      return false;
    }
  }, []);

  React.useEffect(() => {
    if (skip) return;
    let failures = 0;
    let cancelled = false;

    const run = async () => {
      const ok = await probe();
      if (cancelled) return;
      failures = ok ? 0 : failures + 1;
      // Recover on the FIRST good probe — the app is live again, so say so
      // immediately rather than keeping the warning up for a full interval.
      if (ok) setUnreachable(false);
      else if (failures >= FAILURES_BEFORE_SHOWING) setUnreachable(true);
    };

    run();
    const id = setInterval(run, POLL_MS);
    // Coming back from a locked phone is the moment it matters most: re-check
    // immediately rather than waiting out the interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", run);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", run);
    };
  }, [probe, skip]);

  const retry = async () => {
    setChecking(true);
    await probe();
    setTimeout(() => setChecking(false), 600);
  };

  if (skip || !unreachable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[100] border-b border-tone-warn-border bg-tone-warn-bg px-4 py-3 text-amber-900"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            We can&rsquo;t reach our servers right now
          </p>
          <p className="text-xs text-amber-800">
            Your records are safe. Anything you see may be out of date, and new
            records will save once we&rsquo;re back. Please try again in a
            moment.
          </p>
        </div>
        <button
          onClick={retry}
          disabled={checking}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} aria-hidden />
          {checking ? "Checking" : "Try again"}
        </button>
      </div>
    </div>
  );
}

export default MaintenanceNotice;