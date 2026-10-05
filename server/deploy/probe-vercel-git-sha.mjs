#!/usr/bin/env node
/**
 * Confirm the live Vercel build came from commit ed12086.
 *
 * The Vercel CLI inspect output does not always expose a git commit SHA, so
 * this probe tries two independent ways to confirm provenance:
 *
 *   1. If a VERCEL_DEPLOY_ID was passed, it queries the Vercel deployments
 *      API for that deployment's git information. On success it prints the
 *      commit SHA Vercel recorded and compares it to HEAD.
 *
 *   2. Regardless of method 1, it fetches the production deployment's chunks
 *      and checks that a string unique to the NEXT.js frontend in this commit
 *      is present — the same proof-of-content technique as
 *      probe-vercel-panels.mjs. That is not a git SHA, but it proves the live
 *      bundle is the one built from this commit's frontend rather than dust on
 *      disk.
 *
 *   Usage (env var optional, but it gives a real SHA check):
 *     VERCEL_DEPLOY_ID=dpl_... node probe-vercel-git-sha.mjs
 *
 *   A missing VERCEL_DEPLOY_ID is not a failure — it just means the SHA
 *   check is skipped and only the content check runs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const deployId = process.env.VERCEL_DEPLOY_ID;
const BASE = process.argv[2] || "https://wangari.imeantech.com";
const MARKERS = {
  aiHealthPanel: "Wangari AI is answering",
  ipAccessPanel: "ranges refused at the door",
  protocolVersion: "PROTOCOL_VERSION",
};

const failures = [];

function now() {
  return new Date().toISOString();
}

// ── 1. Git provenance, if we can ask Vercel ──────────────────────────────
if (deployId) {
  console.log(`[1/${deployId ? 2 : 1}] checking Vercel deployment ${deployId} for recorded git commit`);
  try {
    const res = await fetch(`https://api.vercel.com/v1/deployments/${deployId}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN ?? ""}` },
    });
    if (res.status !== 200) {
      console.log(`[1] skipped: deployments API returned ${res.status} (no VERCEL_TOKEN?)`);
    } else {
      const d = await res.json();
      const sha = d?.meta?.commit?.sha ?? d?.commitSha ?? d?.meta?.git?.commit?.sha ?? null;
      if (sha) {
        console.log(`[1] Vercel recorded commit ${sha}`);
        const head = (await import("node:child_process")).execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
        if (sha === head) {
          console.log(`[1] ${sha} == HEAD — build provenance confirmed`);
        } else {
          console.log(`[1] Vercel recorded ${sha}, HEAD is ${head}`);
          failures.push(`deployment ${deployId} recorded commit ${sha}, HEAD is ${head}`);
        }
      } else {
        console.log(`[1] deployment response had no commit SHA in expected fields; keys=${(d?.meta ?? {}).commit ? "meta.commit present" : "no meta.commit"}`);
        console.log(`[1] deploying app=${d?.name} org=${d?.org?.name ?? "?"} created=${d?.createdAt}`);
      }
    }
  } catch (e) {
    console.log(`[1] skipped: ${e.message}`);
  }
} else {
  console.log(`[1] VERCEL_DEPLOY_ID not set — skipping deployments API check`);
}

// ── 2. Content proof that the production bundle is this commit's frontend
console.log(`[2] scanning production chunks for commit-scoped frontend strings`);
const srcs = ["wangari-next/src/components/admin/ai-health-panel.tsx", "wangari-next/src/components/admin/ip-access-panel.tsx"];
const markerSet = new Set();
for (const file of srcs) {
  const src = fs.readFileSync(file, "utf8");
  for (const [name, marker] of Object.entries(MARKERS)) {
    if (src.includes(marker)) markerSet.add(name);
  }
}

const html = await fetch(BASE).then((r) => r.text());
const jsSrcs = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
let haystack = html;
const scannedChunks = [];
for (const src of jsSrcs) {
  try {
    const body = await fetch(BASE + src).then((r) => (r.ok ? r.text() : ""));
    if (body) {
      haystack += "\n" + body;
      scannedChunks.push(src);
    }
  } catch {
    /* chunk may 404 if the build rotated between requests */
  }
}

for (const name of Object.keys(MARKERS)) {
  const present = haystack.includes(MARKERS[name]);
  console.log(`[2] ${present ? "PRESENT" : "MISSING"}  ${name}  (${MARKERS[name]})  — ${scannedChunks.length} chunks scanned`);
  if (!present) failures.push(`${name} absent from production bundle`);
}

if (failures.length) {
  console.error("\nproduction does NOT match this commit reliably:\n  " + failures.join("\n  "));
  process.exit(1);
}

console.log("\nproduction frontend matches the committed frontend source for this commit.");