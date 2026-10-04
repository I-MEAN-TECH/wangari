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
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
