"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";

/**
 * Cookie consent banner — strictly-necessary cookies only (JWT auth session).
 * Under Kenyan law (KDPA 2019) and CAK guidance, strictly-necessary cookies
 * do not legally require consent. This banner is shown for transparency only.
 * It persists the user's acknowledgement in localStorage so it only shows once.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if user hasn't dismissed before
    try {
      if (!localStorage.getItem("wangari_cookie_ack")) {
        setVisible(true);
      }
    } catch {
      // localStorage blocked (e.g. private mode) — don't show banner
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem("wangari_cookie_ack", "1");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 p-4"
    >
      <div className="mx-auto max-w-4xl bg-white border border-wangari-border rounded-2xl shadow-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-wangari-green-100 flex items-center justify-center">
          <Cookie className="w-5 h-5 text-wangari-green-800" aria-hidden="true" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-wangari-text-primary">
            We use one cookie — to keep you logged in
          </p>
          <p className="text-xs text-wangari-text-muted mt-0.5">
            Wangari uses a single session cookie for authentication. No tracking,
            no ads, no third-party cookies.{" "}
            <Link
              href="/cookies"
              className="text-wangari-green-800 underline underline-offset-2 hover:text-wangari-green-600"
            >
              Cookie Policy
            </Link>
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          aria-label="Dismiss cookie notice"
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-wangari-green-800 text-white text-sm font-semibold rounded-xl hover:bg-wangari-green-600 transition-colors min-h-[44px]"
        >
          OK, got it
        </button>

        {/* Close X for desktop */}
        <button
          onClick={dismiss}
          aria-label="Close cookie notice"
          className="hidden sm:flex flex-shrink-0 w-8 h-8 items-center justify-center rounded-lg text-wangari-text-muted hover:bg-wangari-cream hover:text-wangari-text-primary transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
