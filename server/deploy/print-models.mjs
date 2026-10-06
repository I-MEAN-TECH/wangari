// Dev helper: print named blocks from a Prisma schema.
// Usage: node server/deploy/print-models.mjs Farm Transaction ...
import fs from "node:fs";

const schemaPath = process.argv[2]?.endsWith(".prisma")
  ? process.argv[2]
  : "server/prisma/schema.prisma";
const names = process.argv.slice(schemaPath === process.argv[2] ? 3 : 2);

const lines = fs.readFileSync(schemaPath, "utf8").split(/\r?\n/);

for (const name of names) {
  const start = lines.findIndex(
    (l) => l.startsWith(`model ${name} `) || l.startsWith(`enum ${name} `)
  );
  if (start === -1) {
    console.log(`### ${name}: NOT FOUND`);
    continue;
  }
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("}")) end++;
  console.log(`### ${name}  (lines ${start + 1}-${end + 1})`);
  console.log(lines.slice(start, end + 1).join("\n"));
  console.log("");
}
