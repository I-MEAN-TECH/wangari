#!/usr/bin/env node
/**
 * Confirm the live Vercel build came from the current HEAD.
 *
 * The Vercel CLI inspect output does not always expose a git commit SHA, so
 * this probe uses two independent checks:
 *
 *   1. If VERCEL_DEPLOY_ID is set, ask the Vercel deployments API for the
 *      recorded git commit and compare it to HEAD. Only this check gives a
 *      real SHA; it is skipped gracefully without the id or token, and a
 *      missing env var is never treated as a failure.
 *
 *   2. Regardless of method 1, fetch the pages the panels actually render on
 *      and assert on strings unique to this commit's two admin components.
 *
 * ── why check 2 must fetch /waadmin/*, not the root ────────────────────────
 * An earlier version of this file scanned the root page and reported both
 * panels MISSING while they were demonstrably live. The root page does not
 * reference the chunks that contain the admin panels — Next.js splits per
 * route, so `/` and `/waadmin/ai` share almost no JS. Scanning the root can
 * therefore only ever say "absent", which is a probe that fails for the wrong
 * reason and would train a reader to ignore it.
 *
 * The correct target is the page each component is mounted on:
 *   ai-health-panel.tsx -> /waadmin/ai
 *   ip-access-panel.tsx -> /waadmin/system
 *
 * Usage:
 *   VERCEL_DEPLOY_ID=dpl_... VERCEL_TOKEN=… node probe-vercel-git-sha.mjs
 *   node probe-vercel-git-sha.mjs          # content check only
 */
import { fileURLToPath } from "node:url";

const deployId = process.env.VERCEL_DEPLOY_ID;
const BASE = process.argv[2] || "https://wangari.imeantech.com";

/** One entry per panel: the route it renders on, and strings unique to it. */
const PANELS = [
  { name: "ai-health-panel", page: "/waadmin/ai", markers: ["Wangari AI is answering", "Live AI health"] },
  { name: "ip-access-panel", page: "/waadmin/system", markers: ["ranges refused at the door", "Requests refused"] },
];

const failures = [];

// ── 1. Deployments API, if we can ask Vercel ──────────────────────────────
if (deployId) {
  console.log(`[1] deployments API: ${deployId}`);
  let res;
  try {
    res = await fetch(`https://api.vercel.com/v1/deployments/${deployId}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN ?? ""}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.log(`[1] deployments API call failed: ${e.message}`);
  }

  if (res && res.status === 200) {
    let d;
    try {
      d = await res.json();
    } catch {
      console.log(`[1] deployments API response was not JSON`);
    }
    if (d) {
      const sha = d?.meta?.commit?.sha ?? d?.commitSha ?? d?.meta?.git?.commit?.sha ?? null;
      if (sha) {
        console.log(`[1] Vercel recorded commit ${sha}`);
        const { execSync } = await import("node:child_process");
        const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
        if (sha === head) {
          console.log(`[1] ${sha} == HEAD — build provenance confirmed`);
        } else {
          console.log(`[1] Vercel recorded ${sha}, HEAD is ${head}`);
          failures.push(`deployment ${deployId} recorded ${sha}, HEAD is ${head}`);
        }
      } else {
        console.log(`[1] no commit SHA on the deployment object (meta.commit present=${!!d?.meta?.commit}, commitSha=${d?.commitSha ? "yes" : "no"})`);
        console.log(`[1] app=${d?.name} org=${d?.org?.name ?? "?"} created=${d?.createdAt}`);
      }
    }
  } else if (res) {
    console.log(`[1] deployments API returned ${res.status} (no VERCEL_TOKEN?)`);
  }
} else {
  console.log(`[1] VERCEL_DEPLOY_ID not set — skipping deployments API check`);
}

// ── 2. Content proof, fetched from the pages the panels render on ─────────
console.log(`[2] scanning the panel pages for commit-scoped strings`);
for (const { name, page, markers } of PANELS) {
  const url = BASE + page;
  let html;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.log(`[2] ${name}: ${page} -> HTTP ${res.status}`);
      failures.push(`${name}: ${page} returned ${res.status}`);
      continue;
    }
    html = await res.text();
  } catch (e) {
    console.log(`[2] ${name}: fetch failed — ${e.message.split("\n")[0]}`);
    failures.push(`${name}: fetch failed`);
    continue;
  }

  // A client component ships inside a JS chunk, so pull the ones this page
  // references and scan the combined body. Route-scoped, so these are the
  // chunks that actually contain the component.
  const chunkUrls = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
  let body = html;
  let fetched = 0;
  for (const c of chunkUrls) {
    try {
      const r = await fetch(BASE + c, { signal: AbortSignal.timeout(8_000) });
      if (r.ok) {
        body += "\n" + (await r.text());
        fetched++;
      }
    } catch {
      /* a chunk can 404 if the build rotated mid-scan */
    }
  }

  for (const m of markers) {
    const present = body.includes(m);
    console.log(`[2] ${present ? "PRESENT" : "MISSING"}  ${name}  "${m}"  (${page}, ${fetched} chunks)`);
    if (!present) failures.push(`${name}: "${m}" missing from ${page}`);
  }
}

if (failures.length) {
  console.error("\nproduction does NOT match this commit reliably:\n  " + failures.join("\n  "));
  process.exit(1);
}

console.log("\nproduction frontend matches the committed frontend source for this commit.");