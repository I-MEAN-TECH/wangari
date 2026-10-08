import type { NextConfig } from "next";

const allowedOrigins = [
  "https://wangari.imeantech.com",
  "https://api.wangari.imeantech.com",
  "http://localhost:3000",
  "http://localhost:3099",
];

// React's development build calls eval() to rebuild call stacks across module
// boundaries and to power Fast Refresh. A CSP without 'unsafe-eval' blocks it,
// so every route logged "eval() is not supported in this environment" and the
// dev overlay showed an error badge on each page. React's production build
// never calls eval(), so the allowance is scoped to `next dev` and the policy
// that actually ships is unchanged.
const isDev = process.env.NODE_ENV !== "production";

const scriptSrc = [
  "'self'",
  // The App Router ships inline bootstrap scripts and no nonce pipeline is
  // wired yet — without this the app renders nothing.
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  "https://accounts.google.com",
  "https://eu.i.posthog.com",
  "https://eu.posthog.com",
].join(" ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        // geolocation=(self) rather than geolocation=(): the weather and
        // dashboard pages both call navigator.geolocation on load, so denying it
        // outright left those calls guaranteed to fail — the browser logged a
        // Permissions Policy violation on every visit and GPS weather could
        // never work. `(self)` permits it for our own pages only, and the user
        // still gets the browser's own permission prompt, so nothing is taken
        // silently. Camera and microphone stay closed: nothing uses them.
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        // Google Sign-In opens a popup and talks to it with window.postMessage
        // from accounts.google.com. `unsafe-none` is nominally "no policy", but
        // the GIS client still refused the message and logged "Cross-Origin-
        // Opener-Policy policy would block the window.postMessage call" on
        // every sign-in attempt, which is exactly the flow we cannot have
        // silently broken. `same-origin-allow-popups` is the value Google
        // documents for OAuth popup flows: our top-level document keeps its
        // isolation, and cross-origin popups stay reachable.
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        // Content-Security-Policy — the header the security audit found
        // missing (5/6 otherwise). Every origin here was enumerated from
        // the code, not guessed:
        //  - accounts.google.com: the GIS script, its button stylesheet
        //    (gsi/style) and the button's iframe on /login and /register.
        //  - fonts.googleapis/gstatic: the <link> stylesheet in layout.tsx
        //    (next/font's Inter is self-hosted, this is the fallback pair).
        //  - api.wangari.imeantech.com: api-client's API_BASE (cross-origin
        //    API; /api/ai/stream and the rest of the proxy are 'self').
        //  - eu.i.posthog.com / eu.posthog.com: posthog-js (bundled from
        //    npm, so script-src 'self' loads it) talks to its api_host, and
        //    may pull recorder assets from the same host.
        //  - img-src 'https:' because next/images remotePatterns is '**'
        //    (news thumbnails, QR images in invoices are remote URLs).
        // script-src keeps 'unsafe-inline' because the App Router ships
        // inline bootstrap scripts and no nonce pipeline is wired yet —
        // without it the app renders nothing. It still stops any script
        // from an origin not on this list. Replacing it with a nonce +
        // 'strict-dynamic' is the known next hardening step.
        //
        // 'unsafe-eval' is added in development only (see `scriptSrc` above).
        // It must never reach production: the whole point of script-src here
        // is to stop an injected string from being evaluated.
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'self'",
            `script-src ${scriptSrc}`,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "connect-src 'self' https://api.wangari.imeantech.com https://eu.i.posthog.com https://eu.posthog.com",
            "frame-src 'self' https://accounts.google.com",
            "media-src 'self' blob: data:",
            "worker-src 'self' blob:",
            "manifest-src 'self'",
            "form-action 'self'",
          ].join("; "),
        },
      ],
    },
    {
      source: "/api/(.*)",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        { key: "Access-Control-Max-Age", value: "86400" },
      ],
    },
  ],
};

export default nextConfig;
