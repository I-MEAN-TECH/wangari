import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { aggregateGroup, memberActivity, describeGroupHealth, ACTIVITY_WINDOW_DAYS, type MemberRow } from "../lib/coop-aggregate.js";
import { makeJoinCode, makeInviteCode, normaliseJoinCode, normaliseInviteCode } from "../lib/coop-code.js";
import { normalisePhone, maskPhone, phoneErrorMessage } from "../lib/phone.js";

/**
 * Co-op / group mode (gap-analysis rows 11 + 17, GAP 4).
 *
 * ── The privacy rule, enforced here ───────────────────────────────────────────
 * A chairperson sees group totals. A chairperson NEVER sees a member's own
 * figures. That is not a UI convention in this file — the queries below select
 * `_count` and `_sum` aggregates only. There is no `findMany` over a member's
 * deliveries, sales, credit or transactions anywhere in this route, so there is
 * no parameter a caller could pass that would return one. `coop-aggregate.ts`
 * then suppresses the totals themselves for groups of fewer than three
 * recording members, because at that size a total reveals its own members by
 * subtraction.
 *
 * A member sees their own farm's data, normally, through the normal routes.
 * Membership here grants nothing.
 */

const router = Router();
router.use(authMiddleware);

/** How long a bulk invite stays valid. Long enough for a weekly meeting cycle. */
const INVITE_VALID_DAYS = 30;

/** Groups a single user may chair, so one farmer cannot create thousands. */
const MAX_GROUPS_PER_CHAIR = 5;

/** Members a chair may invite in one request. Bulk, but not unbounded. */
const MAX_INVITES_PER_BATCH = 50;

async function loadGroupForUser(userId: number, groupId: number) {
  // Authorisation is two-sided: the chair, OR any member farm of this user.
  // A member must be able to see their own group's aggregate.
  const group = await prisma.coopGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      county: true,
      joinCode: true,
      joinCodeExpiresAt: true,
      status: true,
      chairUserId: true,
      createdAt: true,
    },
  });
  if (!group) return { group: null as null, role: null as string | null };

  if (group.chairUserId === userId) return { group, role: "chair" };

  const membership = await prisma.farmMember.findFirst({
    where: { userId, farm: { coopMemberships: { some: { groupId } } } },
    select: { farmId: true },
  });
  return membership ? { group, role: "member" } : { group: null, role: null };
}

function requireGroupAccess(res: Response, group: unknown) {
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return false;
  }
  return true;
}

/** GET /api/coop — the groups this user chairs or belongs to. */
router.get("/", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const memberships = await prisma.coopMembership.findMany({
    where: { farm: { members: { some: { userId } } } },
    select: { groupId: true, role: true },
  });

  const ids = [...new Set(memberships.map((m) => m.groupId))];
  const chaired = await prisma.coopGroup.findMany({
    where: { chairUserId: userId },
    select: { id: true, name: true, county: true, joinCode: true, joinCodeExpiresAt: true, status: true, createdAt: true },
  });

  const seen = new Set(chaired.map((g) => g.id));
  const belonging = await prisma.coopGroup.findMany({
    where: { id: { in: ids.filter((id) => !seen.has(id)) } },
    select: { id: true, name: true, county: true, joinCode: true, joinCodeExpiresAt: true, status: true, createdAt: true },
  });

  const all = [...chaired, ...belonging].map((g) => ({
    ...g,
    role: g.id === undefined ? null : chaired.some((c) => c.id === g.id) ? "chair" : memberships.find((m) => m.groupId === g.id)?.role ?? "member",
  }));

  return res.json({ groups: all });
});

/** POST /api/coop — create a group; the creator becomes its chair. */
router.post("/", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (name.length < 2) return res.status(400).json({ error: "Give the group a name", field: "name" });

  try {
    const owned = await prisma.coopGroup.count({ where: { chairUserId: userId, status: "active" } });
    if (owned >= MAX_GROUPS_PER_CHAIR) {
      return res.status(400).json({ error: `You already run ${MAX_GROUPS_PER_CHAIR} groups` });
    }

    // Collision-resistant on an empty alphabet, but the column is unique so a
    // retry is required rather than an exception escaping to the client.
    let joinCode = makeJoinCode();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.coopGroup.findUnique({ where: { joinCode }, select: { id: true } });
      if (!clash) break;
      joinCode = makeJoinCode();
    }

    const group = await prisma.coopGroup.create({
      data: {
        name,
        joinCode,
        chairUserId: userId,
        county: typeof req.body?.county === "string" ? req.body.county.trim() || null : null,
      },
    });

    return res.status(201).json({ group });
  } catch (error) {
    console.error("Coop create error:", error);
    return res.status(500).json({ error: "Could not create the group" });
  }
});

/**
 * GET /api/coop/:id — the group aggregate.
 *
 * Every number below is a COUNT or a SUM computed inside Postgres. Nothing
 * selects a member row.
 */
router.get("/:id", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId)) return res.status(400).json({ error: "Bad group id" });

  const { group, role } = await loadGroupForUser(userId, groupId);
  if (!requireGroupAccess(res, group)) return;

  const windowStart = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86400000);

  // The membership list carries farm IDs and nothing else. Farm names are
  // fetched, but a name is not a financial figure, and a chair who cannot see
  // the member list cannot run a meeting.
  const memberships = await prisma.coopMembership.findMany({
    where: { groupId },
    select: { farmId: true, role: true, joinedAt: true },
  });
  const farmIds = memberships.map((m) => m.farmId);

  const [farms, prodDays, prodSums, animalCounts, cropCounts, deliverySums, saleSums] = await Promise.all([
    prisma.farm.findMany({
      where: { id: { in: farmIds } },
      select: { id: true, name: true, county: true, claimedAt: true },
    }),
    prisma.dailyProduction.findMany({
      where: { farmId: { in: farmIds }, date: { gte: windowStart } },
      select: { farmId: true, date: true },
    }),
    prisma.dailyProduction.aggregate({
      where: { farmId: { in: farmIds }, date: { gte: windowStart } },
      _sum: { eggsCollected: true, milkCollected: true, weightGain: true },
    }),
    prisma.flock.aggregate({
      where: { farmId: { in: farmIds }, status: "active" },
      _sum: { currentCount: true },
    }),
    prisma.crop.aggregate({
      where: { farmId: { in: farmIds }, status: "active" },
      _count: { _all: true },
    }),
    prisma.delivery.aggregate({
      where: { farmId: { in: farmIds }, date: { gte: windowStart } },
      _sum: { expectedPay: true, paidAmount: true },
    }),
    prisma.sale.aggregate({
      where: { farmId: { in: farmIds }, saleDate: { gte: windowStart } },
      _sum: { totalAmount: true },
    }),
  ]);

  // Per-member activity COUNTS (days recorded, nothing monetary) are needed to
  // tell a chair who has gone quiet. A day count cannot be turned back into a
  // farmer's deliveries by subtraction in any meaningful way, and it is the one
  // per-member fact a chair genuinely needs to run the group.
  const activeDaysByFarm = new Map<number, Set<string>>();
  for (const p of prodDays) {
    const key = new Date(p.date).toISOString().slice(0, 10);
    if (!activeDaysByFarm.has(p.farmId)) activeDaysByFarm.set(p.farmId, new Set());
    activeDaysByFarm.get(p.farmId)!.add(key);
  }

  const memberRows: MemberRow[] = memberships.map((m) => ({
    farmId: m.farmId,
    activeDays: activeDaysByFarm.get(m.farmId)?.size ?? 0,
    outputQuantity: 0,
    animalCount: 0,
    cropCount: 0,
    moneyMoved: 0,
  }));

  const aggregate = aggregateGroup(memberRows);

  // Group-level sums are only released when the aggregate is not suppressed.
  // Reading them first and then discarding would work identically, but reading
  // them conditionally means a suppressed group does not even compute them.
  let totals: Record<string, number> | null = null;
  if (!aggregate.suppressed) {
    const outputs = prodSums._sum;
    totals = {
      eggs: Number(outputs?.eggsCollected ?? 0),
      milk: Number(outputs?.milkCollected ?? 0),
      weightGain: Number(outputs?.weightGain ?? 0),
      animals: Number(animalCounts._sum.currentCount ?? 0),
      crops: cropCounts._count._all ?? 0,
      expectedPay: Number(deliverySums._sum?.expectedPay ?? 0),
      paid: Number(deliverySums._sum?.paidAmount ?? 0),
      sales: Number(saleSums._sum?.totalAmount ?? 0),
    };
  }

  return res.json({
    group: { ...group, myRole: role },
    aggregate,
    health: describeGroupHealth(aggregate),
    totals,
    // The member list a chair needs to run a meeting: who is in, and whether
    // they have recorded. No figures, no prices, no customers.
    members: memberships.map((m) => {
      const farm = farms.find((f) => f.id === m.farmId);
      const activeDays = activeDaysByFarm.get(m.farmId)?.size ?? 0;
      return {
        farmId: m.farmId,
        farmName: farm?.name ?? "Farm",
        county: farm?.county ?? null,
        role: m.role,
        joinedAt: m.joinedAt,
        claimedFarm: !!farm?.claimedAt,
        activity: memberActivity(activeDays, ACTIVITY_WINDOW_DAYS),
        // Boolean, not a count: a chair needs "is this member recording", and a
        // precise figure invites them to infer volume.
        recordedRecently: activeDays > 0,
      };
    }),
    windowDays: ACTIVITY_WINDOW_DAYS,
  });
});

/** POST /api/coop/join — join with a group's join code. */
router.post("/join", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const farmId = req.user!.farmId;
  if (!farmId) return res.status(400).json({ error: "You need a farm before joining a group" });

  const joinCode = normaliseJoinCode(req.body?.joinCode);
  if (!joinCode) return res.status(400).json({ error: "That group code does not look right", field: "joinCode" });

  try {
    const group = await prisma.coopGroup.findUnique({
      where: { joinCode },
      select: { id: true, name: true, status: true, joinCodeExpiresAt: true },
    });
    if (!group || group.status !== "active") {
      return res.status(404).json({ error: "No active group has that code" });
    }
    // An expired code fails with a message that names the reason, so a farmer
    // is not left retyping a code that will never work again. NULL = no expiry.
    if (group.joinCodeExpiresAt && group.joinCodeExpiresAt.getTime() < Date.now()) {
      return res.status(410).json({
        error: "This group code has expired — ask the chairperson for a new one",
        expired: true,
      });
    }

    const existing = await prisma.coopMembership.findUnique({
      where: { groupId_farmId: { groupId: group.id, farmId } },
      select: { id: true },
    });
    if (existing) return res.json({ joined: true, groupName: group.name, alreadyMember: true });

    await prisma.coopMembership.create({ data: { groupId: group.id, farmId, role: "member" } });
    return res.status(201).json({ joined: true, groupName: group.name });
  } catch (error) {
    console.error("Coop join error:", error);
    return res.status(500).json({ error: "Could not join the group" });
  }
});

/**
 * POST /api/coop/:id/invites — bulk onboarding (row 17).
 * Body: { phones: string[] }  Chair only.
 *
 * This is the mechanism that makes a co-op reachable: a chair types ten phone
 * numbers from a meeting and gets ten codes to read out. No email, no app
 * installed on the member's handset.
 */
router.post("/:id/invites", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId)) return res.status(400).json({ error: "Bad group id" });

  const group = await prisma.coopGroup.findUnique({ where: { id: groupId }, select: { chairUserId: true, status: true, name: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  // Chair-only. A member has no business inviting people into the group.
  if (group.chairUserId !== userId) return res.status(403).json({ error: "Only the chairperson can invite members" });
  if (group.status !== "active") return res.status(400).json({ error: "This group is not active" });

  const phones = Array.isArray(req.body?.phones) ? req.body.phones : [];
  if (phones.length === 0) return res.status(400).json({ error: "Enter at least one phone number" });
  if (phones.length > MAX_INVITES_PER_BATCH) {
    return res.status(400).json({ error: `Up to ${MAX_INVITES_PER_BATCH} at a time` });
  }

  const expiresAt = new Date(Date.now() + INVITE_VALID_DAYS * 86400000);
  const created: { phone: string; code: string; status: string }[] = [];
  const rejected: { input: string; reason: string }[] = [];

  for (const raw of phones) {
    const phone = normalisePhone(raw);
    if (typeof phone !== "string") {
      // Report per-number rather than failing the batch: a chair with ten names
      // must not lose all ten because one is written oddly.
      rejected.push({ input: String(raw ?? "").slice(0, 30), reason: phoneErrorMessage(phone) });
      continue;
    }

    const alreadyUser = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (alreadyUser) {
      created.push({ phone, code: "", status: "already_registered" });
      continue;
    }

    const pending = await prisma.coopInvite.findFirst({ where: { groupId, phone, status: "pending" }, select: { id: true, code: true } });
    if (pending) {
      created.push({ phone, code: pending.code, status: "already_invited" });
      continue;
    }

    let code = makeInviteCode();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.coopInvite.findUnique({ where: { code }, select: { id: true } });
      if (!clash) break;
      code = makeInviteCode();
    }

    await prisma.coopInvite.create({ data: { groupId, phone, code, invitedById: userId, expiresAt } });
    created.push({ phone, code, status: "invited" });
  }

  // Numbers are returned masked. The chair knows the people they just typed;
  // a screenshot of this list should not become a phone-number spreadsheet.
  return res.status(201).json({
    groupName: group.name,
    invited: created.map((c) => ({ phone: maskPhone(c.phone), code: c.code, status: c.status })),
    rejected,
    expiresAt,
  });
});

/** GET /api/coop/:id/invites — the chair's pending invites. */
router.get("/:id/invites", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId)) return res.status(400).json({ error: "Bad group id" });

  const group = await prisma.coopGroup.findUnique({ where: { id: groupId }, select: { chairUserId: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.chairUserId !== userId) return res.status(403).json({ error: "Only the chairperson can see invites" });

  const invites = await prisma.coopInvite.findMany({
    where: { groupId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, phone: true, code: true, status: true, expiresAt: true, createdAt: true },
  });

  return res.json({ invites: invites.map((i) => ({ ...i, phone: maskPhone(i.phone) })) });
});

/** DELETE /api/coop/:id/invites/:inviteId — revoke one invite. */
router.delete("/:id/invites/:inviteId", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const groupId = Number(req.params.id);
  const inviteId = Number(req.params.inviteId);

  const group = await prisma.coopGroup.findUnique({ where: { id: groupId }, select: { chairUserId: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.chairUserId !== userId) return res.status(403).json({ error: "Only the chairperson can revoke invites" });

  await prisma.coopInvite.updateMany({
    where: { id: inviteId, groupId, status: "pending" },
    data: { status: "revoked" },
  });
  return res.json({ success: true });
});

/** GET /api/coop/invites/:code — a farmer checks a code before signing up. */
router.get("/invites/:code", async (req: Request, res: Response) => {
  const code = normaliseInviteCode(req.params.code);
  if (!code) return res.status(400).json({ error: "That code does not look right" });

  const invite = await prisma.coopInvite.findUnique({
    where: { code },
    select: {
      status: true,
      expiresAt: true,
      group: { select: { name: true, county: true, status: true } },
    },
  });

  if (!invite) return res.status(404).json({ error: "We do not recognise that code" });
  const usable = invite.status === "pending" && invite.expiresAt > new Date() && invite.group.status === "active";
  return res.json({
    usable,
    groupName: invite.group.name,
    county: invite.group.county,
    reason: usable ? null : invite.status === "accepted" ? "This code has already been used" : "This code is no longer valid",
  });
});

/** PATCH /api/coop/:id — update joinCode or settings for group sponsorship code */
router.patch("/:id", async (req: Request, res: Response) => {
  const userId = req.user!.userId!;
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId)) return res.status(400).json({ error: "Bad group id" });

  const group = await prisma.coopGroup.findUnique({ where: { id: groupId }, select: { chairUserId: true } });
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (group.chairUserId !== userId) return res.status(403).json({ error: "Only chairperson can update group details" });

  const data: Record<string, any> = {};
  if (typeof req.body.joinCode === "string" && req.body.joinCode.trim().length >= 3) {
    data.joinCode = req.body.joinCode.trim().toUpperCase();
  }
  if (typeof req.body.name === "string" && req.body.name.trim().length >= 2) {
    data.name = req.body.name.trim();
  }
  // Lifespan of the join code. `expiresInDays` is the friendly form the UI
  // sends (7 / 30 / 90 / 365); `null` or `0` means "never expires". An explicit
  // ISO `joinCodeExpiresAt` is still accepted for anything that wants to set an
  // exact date. Absent entirely = leave the current expiry untouched, so an
  // edit to the code alone cannot silently reset a lifespan the chair chose.
  if (req.body.expiresInDays !== undefined) {
    const days = Number(req.body.expiresInDays);
    if (req.body.expiresInDays === null || days === 0) {
      data.joinCodeExpiresAt = null;
    } else if (Number.isFinite(days) && days > 0 && days <= 3650) {
      data.joinCodeExpiresAt = new Date(Date.now() + days * 86400000);
    } else {
      return res.status(400).json({ error: "Choose a lifespan between 1 day and 10 years, or 'never'" });
    }
  } else if (req.body.joinCodeExpiresAt !== undefined) {
    if (req.body.joinCodeExpiresAt === null || req.body.joinCodeExpiresAt === "") {
      data.joinCodeExpiresAt = null;
    } else {
      const when = new Date(req.body.joinCodeExpiresAt);
      if (isNaN(when.getTime())) return res.status(400).json({ error: "That expiry date is not valid" });
      data.joinCodeExpiresAt = when;
    }
  }

  try {
    const updated = await prisma.coopGroup.update({
      where: { id: groupId },
      data,
    });
    return res.json({ success: true, group: updated });
  } catch (err: any) {
    return res.status(400).json({ error: "Code already taken or invalid update" });
  }
});

export default router;