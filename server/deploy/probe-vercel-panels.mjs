#!/usr/bin/env node
/**
 * A 200 from /waadmin/ai proves the route exists, not that the new panel
 * shipped. A client component only reaches the browser inside a JS chunk, so
 * assert on a string that appears in exactly one file of the tree.
 *
 *   "Live AI health"     -> components/admin/ai-health-panel.tsx
 *   "Requests refused"   -> components/admin/ip-access-panel.tsx
 */
const BASE = process.argv[2] || "https://wangari.imeantech.com";

const MARKERS = [
  { route: "/waadmin/ai", marker: "Live AI health", file: "ai-health-panel.tsx" },
  { route: "/waadmin/system", marker: "Requests refused", file: "ip-access-panel.tsx" },
];

async function getText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

const haystacks = new Map();
const failures = [];

for (const { route } of MARKERS) {
  const html = await getText(BASE + route);
  const srcs = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
  let all = html;
  for (const src of srcs) {
    try {
      all += "\n" + (await getText(BASE + src));
    } catch {
      /* a chunk can 404 if the build rotated between the two requests */
    }
  }
  haystacks.set(route, { all, count: srcs.length });
}

for (const { route, marker, file } of MARKERS) {
  const { all, count } = haystacks.get(route);
  const found = all.includes(marker);
  console.log(`${found ? "PRESENT" : "MISSING"}  ${marker}  ${file}  (${route}, ${count} chunks)`);
  if (!found) failures.push(`${file} is not in the production bundle`);
}

if (failures.length) {
  console.error("\nProduction frontend is missing this change:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("\nProduction frontend is serving this change.");