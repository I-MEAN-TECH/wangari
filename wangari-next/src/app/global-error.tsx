"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "var(--color-tone-neutral-bg)" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 16,
            textAlign: "center",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 48 }}>🌱</div>
          <h1 style={{ fontSize: 20, color: "var(--color-wangari-heading)", margin: 0 }}>Wangari hit a problem</h1>
          <p style={{ fontSize: 14, color: "var(--color-wangari-muted)", margin: 0 }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              background: "var(--color-wangari-green-800)",
              color: "#fff",
              border: "none",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
