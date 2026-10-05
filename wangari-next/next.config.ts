import type { NextConfig } from "next";

const allowedOrigins = [
  "https://wangari.imeantech.com",
  "https://api.wangari.imeantech.com",
  "http://localhost:3000",
  "http://localhost:3099",
];

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
