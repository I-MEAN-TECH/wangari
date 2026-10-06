"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-5xl">🌱</div>
        <h2 className="text-xl font-bold text-wangari-heading">Something went wrong</h2>
        <p className="text-sm text-wangari-muted">
          This page hit an unexpected error. Your data is safe — nothing was lost.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-wangari-green-800 text-white text-sm font-bold hover:bg-wangari-green-900 cursor-pointer"
          >
            Try again
          </button>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="px-4 py-2 rounded-xl bg-wangari-sunken text-wangari-text text-sm font-bold hover:bg-tone-neutral-border cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
