const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const p = new PrismaClient();

// Mint a real token for the farm owner so we exercise the live endpoints
// end-to-end (auth -> IDOR scoping -> tag validation -> range insert).
(async () => {
  const env = fs.readFileSync(".env", "utf8");
  const secret = (env.match(/^JWT_SECRET=(.*)$/m) || [])[1]?.trim();
  const sub = await p.subscription.findFirst({ where: { status: "active", plan: { startsWith: "growth" } }, orderBy: { id: "desc" } });
  const farm = sub ? await p.farm.findFirst({ where: { ownerId: sub.userId }, include: { owner: true } }) : null;
  if (!farm) return console.log("no farm");

  const token = jwt.sign(
    { userId: farm.ownerId, email: farm.owner.email, role: "farm_owner", farmId: farm.id, tokenVersion: farm.owner.tokenVersion || 0 },
    secret,
    { expiresIn: "10m" }
  );

  const base = "http://localhost:3001";
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const j = async (r) => { try { return await r.json(); } catch { return r.status; } };

  console.log("1. GET /api/animals ->", JSON.stringify(await j(await fetch(`${base}/api/animals`, { headers: H }))).slice(0, 200));

  const created = await fetch(`${base}/api/animals`, {
    method: "POST", headers: H,
    body: JSON.stringify({ tagNumber: "141000100000001", flockId: null, species: "cattle_dairy", sex: "female" }),
  });
  const createdBody = await j(created);
  console.log("2. POST single tag ->", created.status, JSON.stringify(createdBody).slice(0, 220));

  const dupe = await fetch(`${base}/api/animals`, {
    method: "POST", headers: H, body: JSON.stringify({ tagNumber: "141000100000001" }),
  });
  console.log("3. POST duplicate tag (must 409) ->", dupe.status, JSON.stringify(await j(dupe)).slice(0, 140));

  const range = await fetch(`${base}/api/animals`, {
    method: "POST", headers: H,
    body: JSON.stringify({ tagStart: "141000200000001", tagEnd: "141000200000010", species: "goats" }),
  });
  const rangeBody = await j(range);
  console.log("4. POST range 10 tags ->", range.status, JSON.stringify(rangeBody).slice(0, 220));

  const huge = await fetch(`${base}/api/animals`, {
    method: "POST", headers: H,
    body: JSON.stringify({ tagStart: "141000300000001", tagEnd: "141000300009999" }),
  });
  console.log("5. POST oversized range (must 400) ->", huge.status, JSON.stringify(await j(huge)).slice(0, 140));

  const badTag = await fetch(`${base}/api/animals`, {
    method: "POST", headers: H, body: JSON.stringify({ tagNumber: "not-a-tag" }),
  });
  console.log("6. POST invalid tag (must 400) ->", badTag.status, JSON.stringify(await j(badTag)).slice(0, 140));

  const trace = await fetch(`${base}/api/animals/traceability/list`, { headers: H });
  const traceBody = await j(trace);
  console.log("7. GET traceability list ->", trace.status, "count =", traceBody.count, "first =", traceBody.animals?.[0]?.tagNumber);

  const list = await j(await fetch(`${base}/api/animals`, { headers: H }));
  console.log("8. final count =", list.animals?.length, "| taggedByFlock entries =", list.taggedByFlock?.length);

  // cleanup so production data is left clean
  await p.animal.deleteMany({ where: { farmId: farm.id, tagNumber: { startsWith: "1410001" } } });
  await p.animal.deleteMany({ where: { farmId: farm.id, tagNumber: { startsWith: "1410002" } } });
  console.log("9. cleanup done, remaining animals =", await p.animal.count());

  await p.$disconnect();
})();
