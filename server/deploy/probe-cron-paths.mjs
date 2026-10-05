import fs from "node:fs";
const src = fs.readFileSync("dist/routes/cron.js", "utf8");
const routes = [];
let m;
let cursor = src;
while ((m = /\.(get|post|patch|delete|all)\("([^"]+)"/.exec(cursor))) {
  routes.push(m[2]);
  cursor = cursor.slice(m.index + m[0].length);
}
console.log(routes.join("\n"));
console.log("\ncount:", routes.length);
