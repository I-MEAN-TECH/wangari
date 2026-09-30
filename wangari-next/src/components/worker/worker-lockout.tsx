"use client";

import * as React from "react";
import { Lock, LogOut, RefreshCw } from "lucide-react";

/**
 * Full-screen lockout for workers whose farm owner's trial/subscription has
 * expired. The api-client dispatches `wangari:trial_expired` whenever the
 * server answers 403 with `trialExpired: true` — including the worker-side
 * 403 ("Your farm's free trial has expired…") — so any locked API call in
 * any worker page flips this on within one request.
 */
export function WorkerLockout() {
  const [locked, setLocked] = React.useState(false);

  React.useEffect(() => {
    const onLock = () => setLocked(true);
    window.addEventListener("wangari:trial_expired", onLock);
    return () => window.removeEventListener("wangari:trial_expired", onLock);
  }, []);

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-[#0F172A] via-[#14532D] to-[#166534] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="text-xl font-black text-[#0F172A]">
          Farm Access Paused
        </h1>
        <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
          Your farm&apos;s subscription has expired, so the Worker Portal is
          temporarily unavailable. Your records are safe — nothing was lost.
          Ask the farm owner to renew the subscription, then check back.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#166534] text-white text-sm font-extrabold hover:bg-[#14532D] transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <button
            onClick={() => {
              try {
                // Lazy import avoids a circular dependency with auth-client.
                import("@/lib/auth-client").then(({ logout }) => logout());
              } catch {}
            }}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-100 text-[#64748B] text-sm font-extrabold hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
