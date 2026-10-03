import { readdirSync, statSync, readFileSync } from "node:fs";

/**
 * Verify .vercelignore actually excludes what it claims, using gitignore
 * semantics: a pattern with no slash matches at ANY depth. That trap is exactly
 * what deployed a live site with 404 logos, so it gets checked, not assumed.
 */
const pats = readFileSync(".vercelignore", "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("#"));

const SPECIAL = new Set(".$^+{}()|\\".split(""));

function toRegex(pattern) {
  const anchored = pattern.startsWith("/");
  // A trailing slash means "this directory and everything under it", so it has
  // to match the directory's CONTENTS too. Without the "/.*" arm a pattern like
  // "server/" fails to exclude server/src/index.ts, which is a false negative in
  // the checker rather than a problem with the file — worth getting right, since
  // a checker that always passes is worse than no checker.
  const dirOnly = pattern.endsWith("/");
  const body = (anchored ? pattern.slice(1) : pattern).replace(/\/$/, "");
  let re = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "*") {
      if (body[i + 1] === "*") {
        re += ".*";
        i++;
        if (body[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const j = body.indexOf("]", i);
      re += body.slice(i, j + 1);
      i = j;
    } else if (SPECIAL.has(c)) re += "\\" + c;
    else re += c;
  }
  const tail = dirOnly ? "(?:/.*)?" : "(?:/.*)?$";
  return new RegExp("^" + (anchored ? "" : "(?:.*/)?") + re + tail);
}

const compiled = pats.map((p) => ({ p, re: toRegex(p) }));
const matchers = (f) => compiled.filter((c) => c.re.test(f)).map((c) => c.p);

// Paths are stored WITHOUT the leading "./". Anchored patterns like
// "/server/" only match at the repo root, and a "./" prefix would silently make
// every one of them miss — which is exactly the false negative this run caught.
const SKIP = new Set(["node_modules", ".git", ".next", ".vercel"]);
const all = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const f = (d === "." ? "" : d + "/") + e.name;
    all.push(f);
    if (e.isDirectory()) walk(f);
  }
};
walk(".");

const images = all.filter(
  (f) => f.startsWith("wangari-next/public/") && /\.(png|jpe?g|svg|ico|webp)$/i.test(f)
);
const excludedImages = images.filter((f) => matchers(f).length > 0);

console.log("app artwork files:", images.length);
console.log("WRONGLY EXCLUDED (must be 0):", excludedImages.length);
excludedImages.forEach((f) => console.log("   BAD", f, "via", matchers(f).join(",")));

console.log("\n--- scratch that must be excluded ---");
for (const f of [
  ".freebuff/desktop-v2.db",
  ".freebuff/image-candidates.html",
  "login-attempt.png",
  "waadmin-overview-desktop.png",
  "audit-shots/a.png",
  "agent/notes.md",
  "server/src/index.ts",
  "skills/api-security-testing/SKILL.md",
  "docs/partnership-prospects.md",
  "docs/wangari-architecture.visual-check.json",
  "skills-lock.json",
  "wangari-next/.env.local",
]) {
  const m = matchers(f);
  console.log((m.length ? "excluded  " : "INCLUDED !").padEnd(11), f, m.join(", "));
}

console.log("\n--- app files that must stay included ---");
for (const f of [
  "wangari-next/src/app/(dashboard)/coop/page.tsx",
  "wangari-next/src/lib/api-client.ts",
  "wangari-next/package.json",
  "wangari-next/next.config.ts",
  "wangari-next/vercel.json",
  "wangari-next/public/sw.js",
  "wangari-next/public/manifest.webmanifest",
]) {
  const m = matchers(f);
  console.log((m.length ? "EXCLUDED !" : "included  ").padEnd(11), f, m.join(", "));
}

const uploaded = all.filter((f) => matchers(f).length === 0);
const big = uploaded
  .map((f) => [statSync(f).size, f])
  .filter(([s]) => s > 3e6)
  .sort((a, b) => b[0] - a[0]);
console.log("\n--- files >3MB still uploaded ---");
big.forEach(([s, f]) => console.log("  ", (s / 1e6).toFixed(1) + "MB", f));

const total = uploaded.reduce((a, f) => a + statSync(f).size, 0);
console.log("\nupload now ~" + (total / 1e6).toFixed(1) + "MB (Vercel limit 100MB)");
console.log("files uploaded:", uploaded.length, "of", all.length, "on disk");