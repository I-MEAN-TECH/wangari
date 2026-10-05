import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
let probeOrigin = process.env.PROBE_ORIGIN_DIR || path.dirname(here);
let idxPath = path.resolve(probeOrigin, "..", "..", "server", "dist", "index.js");
console.log("resolve from script dir:", idxPath);
if (!fs.existsSync(idxPath)) {
  const altPath = path.resolve("/home/saasapp/app/server/dist/index.js");
  if (fs.existsSync(altPath)) {
    probeOrigin = path.dirname(altPath);
    idxPath = altPath;
    console.log("using alt:", idxPath);
  } else {
    console.log("index.js missing at", idxPath, "and alt");
    console.log("cwd:", process.cwd());
    console.log("ls dist:", fs.existsSync(path.resolve(process.cwd(), "server", "dist")) ? fs.readdirSync(path.resolve(process.cwd(), "server", "dist")).join(", ") : "no dist");
    process.exit(1);
  }
}
console.log("reading", idxPath);

const idx = fs.readFileSync(idxPath, "utf8");

// Print each app.use / app.METHOD / router.METHOD mount, with a 3-line context
// window so the prefix (including "/api/cron") is visible.
const lines = idx.split("\n");
const mounts = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^(app|router)\.(use|get|post|patch|delete|all|put|options|head)\b/.test(line.trimStart())) {
    mounts.push({ i, line: line.trim() });
  }
}

console.log("\n=== mount points (" + mounts.length + ") ===\n");
for (const m of mounts) {
  const ctx = lines.slice(Math.max(0, m.i - 2), m.i + 3).join("\n").trim();
  console.log(`L${m.i} ${m.line}`);
  if (ctx.length > 200) {
    console.log("   " + ctx.slice(0, 200).replace(/\n/g, "\n   "));
    console.log("   ...");
  } else {
    console.log("   " + ctx.replace(/\n/g, "\n   "));
  }
  console.log();
}

// Also: which route files are imported, in import order.
console.log("=== imports of route modules (by line) ===");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/^import\s+([\w{}\s,]+)\s+from\s+"([^"]+\.js)"/);
  if (m && m[2].includes("/routes/")) {
    console.log(`L${i} import ${m[1].trim()} from ${m[2]}`);
  }
}
