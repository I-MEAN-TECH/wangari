import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireAdmin, auditAdminAction } from "../lib/admin-auth.js";
import { sendEmail, emailTemplates } from "../lib/email.js";
import { findPlan, requireActivePlan } from "../lib/plan-tier.js";

/**
 * Admin modules — farms/users management, promo codes, tickets, announcements.
 * Mounted under /api/admin alongside routes/admin.ts. Every mutation audited.
 */
const router = Router();

// ─── M1: Farms (tenants) ──────────────────────────────────
router.get("/farms", requireAdmin(["support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const status = String(req.query.status || "all");
    const pageSize = 20;
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const where: any = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { owner: { email: { contains: q, mode: "insensitive" } } },
            { owner: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {};

    const [rows, total, allFarms] = await Promise.all([
      prisma.farm.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { workers: true, flocks: true } },
        },
        orderBy: { id: "desc" },
      }),
      prisma.farm.count({ where }),
      prisma.farm.findMany({
        select: { ownerId: true, owner: { select: { subscriptions: { where: { status: "active" }, select: { expiresAt: true } } } } },
      }) as unknown as Promise<{ ownerId: number; owner: { subscriptions: { expiresAt: Date }[] } }[]>,
    ]);

    // Latest subscription per farm (via owner) for the plan column.
    const ownerIds = rows.map((r) => r.ownerId);
    const subs = await prisma.subscription.findMany({
      where: { userId: { in: ownerIds }, status: "active" },
      orderBy: { expiresAt: "desc" },
    });
    const subByUser = new Map(subs.map((s) => [s.userId, s]));

    const enrich = (f: (typeof rows)[number]) => {
      const sub = subByUser.get(f.ownerId);
      return {
        id: f.id,
        name: f.name,
        code: f.code,
        location: f.location,
        county: f.county,
        owner: f.owner,
        workers: f._count.workers,
        flocks: f._count.flocks,
        plan: sub ? { name: sub.planName, status: sub.status, expiresAt: sub.expiresAt } : null,
        createdAt: f.createdAt,
      };
    };

    // Platform-wide summary (independent of search/filter)
    const summary = {
      total: allFarms.length,
      active: allFarms.filter((f) => (f.owner?.subscriptions ?? []).some((s) => s.expiresAt > now)).length,
      expiring: allFarms.filter((f) => (f.owner?.subscriptions ?? []).some((s) => s.expiresAt > now && s.expiresAt <= weekAhead)).length,
      trial: allFarms.filter((f) => !(f.owner?.subscriptions ?? []).some((s) => s.expiresAt > now)).length,
    };

    // Status filter applied after enrichment
    const statusOf = (f: (typeof rows)[number]) => {
      const sub = subByUser.get(f.ownerId);
      if (!sub) return "trial";
      if (sub.expiresAt <= weekAhead) return "expiring";
      return "active";
    };
    const filtered = status === "all" ? rows : rows.filter((f) => statusOf(f) === status);
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      rows: paged.map(enrich),
      total: filtered.length,
      page,
      pageSize,
      summary,
    });
  } catch (error) {
    console.error("Admin farms list error:", error);
    res.status(500).json({ error: "Failed to load farms" });
  }
});

// Farm detail: one screen with plan, workforce, flocks, subscription history, tickets.
router.get("/farms/:id", requireAdmin(["support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const farm = await prisma.farm.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, phone: true, createdAt: true, emailVerified: true } },
        _count: { select: { workers: true, flocks: true } },
      },
    });
    if (!farm) return res.status(404).json({ error: "Farm not found" });

    const anyPrisma = prisma as any;
    const [workers, flocks, subs, tickets] = await Promise.all([
      anyPrisma.worker.findMany({
        where: { farmId: id },
        select: { id: true, name: true, role: true, status: true, createdAt: true },
        orderBy: { id: "desc" },
        take: 20,
      }).catch(() => []),
      anyPrisma.flock.findMany({
        where: { farmId: id },
        select: { id: true, name: true, species: true, birdCount: true, status: true },
        orderBy: { id: "desc" },
        take: 20,
      }).catch(() => []),
      prisma.subscription.findMany({
        where: { userId: farm.ownerId },
        orderBy: { startsAt: "desc" },
        take: 10,
        select: { id: true, planName: true, amount: true, status: true, reference: true, startsAt: true, expiresAt: true },
      }),
      anyPrisma.ticket.findMany({
        where: { userId: farm.ownerId },
        select: { id: true, subject: true, status: true, createdAt: true },
        orderBy: { id: "desc" },
        take: 5,
      }).catch(() => []),
    ]);

    res.json({
      farm: {
        id: farm.id, name: farm.name, code: farm.code, location: farm.location, county: farm.county, createdAt: farm.createdAt,
      },
      owner: farm.owner,
      workers: farm._count.workers,
      flocks: farm._count.flocks,
      workerList: workers,
      flockList: flocks,
      subscriptions: subs,
      tickets,
    });
  } catch (error) {
    console.error("Admin farm detail error:", error);
    res.status(500).json({ error: "Failed to load farm" });
  }
});

// Controlled farm action: extend the owner's subscription (audited).
router.post("/farms/:id/extend", requireAdmin(["support", "billing"]), async (req: Request, res: Response) => {
  try {
    const days = Number(req.body?.days);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      return res.status(400).json({ error: "days must be 1-365" });
    }
    const farm = await prisma.farm.findUnique({ where: { id: Number(req.params.id) }, select: { ownerId: true, name: true } });
    if (!farm) return res.status(404).json({ error: "Farm not found" });

    const current = await prisma.subscription.findFirst({
      where: { userId: farm.ownerId, status: "active", expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "desc" },
    });
    const base = current ? current.expiresAt : new Date();
    const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    const sub = current
      ? await prisma.subscription.update({ where: { id: current.id }, data: { expiresAt } })
      : await prisma.subscription.create({
          data: {
            userId: farm.ownerId,
            plan: "starter_monthly",
            planName: "Goodwill extension",
            amount: 0,
            status: "active",
            reference: `admin_extend_${Date.now()}`,
            startsAt: new Date(),
            expiresAt,
          },
        });
    // Guard: the hardcoded starter_monthly above must exist in the plans table.
    // If a future admin ever deletes/renames it, fail loudly instead of
    // creating a subscription on a ghost plan.
    const usedPlan = await findPlan(sub.plan);
    if (!usedPlan) {
      console.error(`admin farm extend produced subscription on unknown plan "${sub.plan}" — cancelling`);
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: "cancelled" } });
      return res.status(500).json({ error: "Plan configuration error — extension not applied" });
    }

    auditAdminAction((req as any).admin, "admin.farm.extend", "farm", farm.name ? Number(req.params.id) : null, {
      farm: farm.name, days, newExpiresAt: expiresAt,
    });
    res.json(sub);
  } catch (error) {
    console.error("Admin farm extend error:", error);
    res.status(500).json({ error: "Failed to extend" });
  }
});

// ─── M1: Users (accounts) ─────────────────────────────────
router.get("/users", requireAdmin(["support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const role = String(req.query.role || "all");
    const verified = String(req.query.verified || "all");
    const pageSize = 20;

    const where: any = q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
      : {};
    if (role !== "all") where.role = role;
    if (verified === "yes") where.emailVerified = { not: null };
    if (verified === "no") where.emailVerified = null;

    const [rows, total, allUsers] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          emailVerified: true, createdAt: true, tokenVersion: true,
          ownedFarms: { select: { id: true, name: true } },
          googleId: true,
        },
        orderBy: { id: "desc" },
      }),
      prisma.user.count({ where }),
      prisma.user.findMany({
        select: { role: true, emailVerified: true, googleId: true, createdAt: true },
      }),
    ]);

    // Platform-wide summary (independent of filters)
    const now = Date.now();
    const summary = {
      total: allUsers.length,
      owners: allUsers.filter((u) => u.role === "farm_owner").length,
      verified: allUsers.filter((u) => u.emailVerified).length,
      unverified: allUsers.filter((u) => !u.emailVerified).length,
      googleAccounts: allUsers.filter((u) => u.googleId).length,
      newThisWeek: allUsers.filter((u) => now - new Date(u.createdAt).getTime() < 7 * 86_400_000).length,
    };

    const paged = rows.slice((page - 1) * pageSize, page * pageSize);
    res.json({ rows: paged, total, page, pageSize, summary });
  } catch (error) {
    console.error("Admin users list error:", error);
    res.status(500).json({ error: "Failed to load users" });
  }
});

// User detail: one screen — farms, subscription history, tickets, recent activity.
router.get("/users/:id", requireAdmin(["support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, avatar: true,
        emailVerified: true, trialStartsAt: true, trialEndsAt: true, googleId: true,
        createdAt: true, tokenVersion: true,
        ownedFarms: { select: { id: true, name: true, code: true, _count: { select: { workers: true, flocks: true } } } },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const anyPrisma = prisma as any;
    const [subs, tickets, recentActions] = await Promise.all([
      prisma.subscription.findMany({
        where: { userId: id },
        orderBy: { startsAt: "desc" },
        take: 10,
        select: { id: true, planName: true, amount: true, status: true, reference: true, startsAt: true, expiresAt: true },
      }),
      anyPrisma.ticket.findMany({
        where: { userId: id },
        select: { id: true, subject: true, status: true, createdAt: true },
        orderBy: { id: "desc" },
        take: 5,
      }).catch(() => []),
      anyPrisma.auditLog.findMany({
        where: { userId: id },
        select: { id: true, action: true, createdAt: true },
        orderBy: { id: "desc" },
        take: 6,
      }).catch(() => []),
    ]);

    res.json({ user, subscriptions: subs, tickets, recentActions });
  } catch (error) {
    console.error("Admin user detail error:", error);
    res.status(500).json({ error: "Failed to load user" });
  }
});

// Force-logout a user (bump tokenVersion) — the "suspend session" control.
router.post("/users/:id/force-logout", requireAdmin(["support"]), async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data: { tokenVersion: { increment: 1 } },
      select: { id: true, email: true },
    });
    auditAdminAction((req as any).admin, "admin.user.force-logout", "user", user.id, { email: user.email });
    res.json({ success: true });
  } catch (error) {
    console.error("Admin force-logout error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

// Manually verify a user's email (support control).
router.post("/users/:id/verify-email", requireAdmin(["support"]), async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data: { emailVerified: new Date() },
      select: { id: true, email: true },
    });
    auditAdminAction((req as any).admin, "admin.user.verify-email", "user", user.id, { email: user.email });
    res.json({ success: true });
  } catch (error) {
    console.error("Admin verify-email error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── M4: Promo codes ──────────────────────────────────────
router.get("/promos", requireAdmin(["billing", "support", "support_read"]), async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const rows = await prisma.promoCode.findMany({
      include: {
        plan: { select: { id: true, name: true } },
        _count: { select: { redemptions: true } },
        redemptions: {
          orderBy: { id: "desc" },
          take: 5,
          select: { id: true, reference: true, discountKes: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Summary: usage and discount cost across all codes
    const allRedemptions = await prisma.promoRedemption.aggregate({
      _count: true,
      _sum: { discountKes: true },
    });
    const summary = {
      totalCodes: rows.length,
      active: rows.filter((p) => p.active && (!p.expiresAt || p.expiresAt > now)).length,
      totalRedemptions: allRedemptions._count,
      totalDiscountKes: Math.round(Number(allRedemptions._sum.discountKes ?? 0)),
      partnerCodes: rows.filter((p) => p.type === "partnership").length,
    };

    res.json(rows.map((p) => ({
      ...p,
      redemptions: p._count.redemptions,
      recentRedemptions: p.redemptions,
      _count: undefined,
      summary, // attached to each row; the client reads it from the first
    })));
  } catch (error) {
    console.error("Admin promos list error:", error);
    res.status(500).json({ error: "Failed to load promo codes" });
  }
});

router.post("/promos", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const { code, type, discountType, value, maxRedemptions, partnerName, expiresAt } = req.body || {};
    const clean = String(code || "").trim().toUpperCase();
    if (!clean || !/^[A-Z0-9_-]{3,24}$/.test(clean)) {
      return res.status(400).json({ error: "Code must be 3-24 chars (A-Z, 0-9, dash, underscore)" });
    }
    if (!["discount", "partnership", "credit", "sponsorship"].includes(type)) {
      return res.status(400).json({ error: "type must be discount, partnership, credit or sponsorship" });
    }
    // Optional plan restriction: a promo tied to a plan only works on that plan.
    // Validated against the live plans table (must exist AND be active) so a
    // typo'd or disabled plan can never be attached to a code.
    const planId = req.body?.planId ? String(req.body.planId) : null;
    if (planId) {
      try {
        await requireActivePlan(planId);
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }
    }
    // Sponsorship codes grant free months instead of a payment discount.
    const freeMonths = req.body?.freeMonths ? Number(req.body.freeMonths) : null;
    if (type === "sponsorship") {
      if (!freeMonths || !Number.isFinite(freeMonths) || freeMonths < 1 || freeMonths > 36) {
        return res.status(400).json({ error: "sponsorship codes need freeMonths (1-36)" });
      }
    }
    const val = Number(value);
    if (type !== "sponsorship" && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: "value must be a positive number" });
    }
    if (discountType === "percent" && val > 100) {
      return res.status(400).json({ error: "percent discount cannot exceed 100" });
    }
    const promo = await prisma.promoCode.create({
      data: {
        code: clean,
        type,
        discountType: discountType === "percent" ? "percent" : "fixed",
        value: type === "sponsorship" ? null : Math.round(val),
        freeMonths: type === "sponsorship" ? Math.round(freeMonths!) : null,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        partnerName: partnerName || null,
        planId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: (req as any).admin?.adminId,
      },
    });
    auditAdminAction((req as any).admin, "admin.promo.create", "promo", promo.id, { code: promo.code, type, value: promo.value });
    res.status(201).json(promo);
  } catch (error: any) {
    if (error?.code === "P2002") return res.status(409).json({ error: "That code already exists" });
    console.error("Admin promo create error:", error);
    res.status(500).json({ error: "Failed to create promo code" });
  }
});

// POST /api/admin/promos/batch — generate N unique codes in one go.
// Used for sponsor batches ("100 single-use codes for the Nakuru co-op").
// Returns the created rows so the admin can export them as CSV.
router.post("/promos/batch", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const { count, type, freeMonths, discountType, value, partnerName, expiresAt } = req.body || {};
    const n = Math.min(Math.max(Number(count) || 0, 1), 500);
    if (!n) return res.status(400).json({ error: "count must be 1-500" });
    if (!["discount", "partnership", "credit", "sponsorship"].includes(type)) {
      return res.status(400).json({ error: "type must be discount, partnership, credit or sponsorship" });
    }
    const fm = freeMonths ? Number(freeMonths) : null;
    if (["sponsorship", "partnership"].includes(type) && (!fm || fm < 1 || fm > 36)) {
      return res.status(400).json({ error: "freeMonths (1-36) required for sponsorship/partnership" });
    }
    const val = Number(value);
    if (!["sponsorship", "partnership"].includes(type) && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: "value must be a positive number" });
    }
    // Optional plan restriction on the whole batch — validated like single codes.
    const batchPlanId = req.body?.planId ? String(req.body.planId) : null;
    if (batchPlanId) {
      try {
        await requireActivePlan(batchPlanId);
      } catch (e: any) {
        return res.status(400).json({ error: e.message });
      }
    }

    // Human-friendly unique codes: PREFIX-XXXX-XXXX (unambiguous alphabet).
    const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const genCode = () => {
      const seg = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
      return `${String(req.body?.prefix || "WANGARI").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "WANGARI"}-${seg()}-${seg()}`;
    };

    const created: string[] = [];
    for (let i = 0; i < n; i++) {
      // Retry on the (rare) unique collision.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = genCode();
        try {
          await prisma.promoCode.create({
            data: {
              code,
              type,
              discountType: ["sponsorship", "partnership"].includes(type) ? null : discountType === "percent" ? "percent" : "fixed",
              value: ["sponsorship", "partnership"].includes(type) ? null : Math.round(val),
              freeMonths: ["sponsorship", "partnership"].includes(type) ? Math.round(fm!) : null,
              maxRedemptions: 1, // batch codes are single-use by design
              partnerName: partnerName || null,
              planId: batchPlanId,
              expiresAt: expiresAt ? new Date(expiresAt) : null,
              createdBy: (req as any).admin?.adminId,
            },
          });
          created.push(code);
          break;
        } catch (e: any) {
          if (attempt === 4) throw e;
        }
      }
    }

    auditAdminAction((req as any).admin, "admin.promo.batch_create", "promo", 0, { count: created.length, type, partnerName });
    res.status(201).json({ ok: true, created });
  } catch (error) {
    console.error("Admin promo batch error:", error);
    res.status(500).json({ error: "Batch generation failed" });
  }
});

router.patch("/promos/:id", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const {
      code, type, discountType, value, freeMonths, maxRedemptions,
      partnerName, planId, expiresAt, active,
    } = req.body || {};

    const data: any = {};

    // Code rename (validated + uniqueness handled by Prisma P2002 below).
    if (code !== undefined) {
      const clean = String(code || "").trim().toUpperCase();
      if (!clean || !/^[A-Z0-9_-]{3,24}$/.test(clean)) {
        return res.status(400).json({ error: "Code must be 3-24 chars (A-Z, 0-9, dash, underscore)" });
      }
      data.code = clean;
    }
    if (type !== undefined) {
      if (!["discount", "partnership", "credit", "sponsorship"].includes(type)) {
        return res.status(400).json({ error: "type must be discount, partnership, credit or sponsorship" });
      }
      data.type = type;
    }
    if (discountType !== undefined) {
      if (discountType !== null && !["percent", "fixed"].includes(discountType)) {
        return res.status(400).json({ error: "discountType must be percent or fixed" });
      }
      data.discountType = discountType;
    }
    if (value !== undefined) {
      if (value === null) {
        data.value = null;
      } else {
        const val = Number(value);
        if (!Number.isFinite(val) || val <= 0) return res.status(400).json({ error: "value must be a positive number" });
        if ((data.discountType ?? discountType) === "percent" && val > 100) {
          return res.status(400).json({ error: "percent discount cannot exceed 100" });
        }
        data.value = Math.round(val);
      }
    }
    if (freeMonths !== undefined) {
      if (freeMonths === null) {
        data.freeMonths = null;
      } else {
        const fm = Number(freeMonths);
        if (!Number.isFinite(fm) || fm < 1 || fm > 36) return res.status(400).json({ error: "freeMonths must be 1-36" });
        data.freeMonths = Math.round(fm);
      }
    }
    if (maxRedemptions !== undefined) data.maxRedemptions = maxRedemptions ? Number(maxRedemptions) : null;
    if (partnerName !== undefined) data.partnerName = partnerName ? String(partnerName).trim() : null;
    if (active !== undefined) data.active = Boolean(active);
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    // Plan restriction: null clears it (usable on any plan), a valid plan id
    // locks the promo to that plan.
    if (planId !== undefined) {
      if (planId === null || planId === "") {
        data.planId = null;
      } else {
        try {
          await requireActivePlan(String(planId));
        } catch (e: any) {
          return res.status(400).json({ error: e.message });
        }
        data.planId = String(planId);
      }
    }

    const promo = await prisma.promoCode.update({ where: { id: String(req.params.id) }, data });
    auditAdminAction((req as any).admin, "admin.promo.update", "promo", promo.id, data);
    res.json(promo);
  } catch (error: any) {
    if (error?.code === "P2002") return res.status(409).json({ error: "That code already exists" });
    console.error("Admin promo update error:", error);
    res.status(500).json({ error: "Failed to update promo code" });
  }
});

// GET /api/admin/promos/:id/redemptions — full redeemer list for one code
// (the list endpoint only embeds the 5 most recent; this returns everything,
// with the user attached so support can see WHO used the code).
router.get("/promos/:id/redemptions", requireAdmin(["billing", "support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const rows = await prisma.promoRedemption.findMany({
      where: { promoCodeId: String(req.params.id) },
      orderBy: { id: "desc" },
      include: {
        // user relation isn't declared on PromoRedemption (userId is a plain
        // int column), so resolve users separately.
      },
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activeSubs = await prisma.subscription.findMany({
      where: { userId: { in: userIds }, status: "active", expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "desc" },
    });
    const subMap = new Map<string, any>();
    for (const s of activeSubs) if (!subMap.has(`${s.userId}`)) subMap.set(`${s.userId}`, s);

    res.json(rows.map((r) => {
      const u = userMap.get(r.userId);
      const sub = subMap.get(`${r.userId}`);
      return {
        id: r.id,
        userId: r.userId,
        userName: u?.name || null,
        userEmail: u?.email || null,
        reference: r.reference,
        discountKes: r.discountKes,
        createdAt: r.createdAt,
        subscription: sub ? { id: sub.id, plan: sub.plan, planName: sub.planName, expiresAt: sub.expiresAt } : null,
      };
    }));
  } catch (error) {
    console.error("Admin promo redemptions error:", error);
    res.status(500).json({ error: "Failed to load redemptions" });
  }
});

// DELETE /api/admin/promos/:id/redemptions/:redemptionId — revoke one user's
// redemption. Also cancels the subscription the redemption created (PROMO-
// references) so the code slot frees up and the sponsored access actually
// ends. Payments made through Paystack are never touched.
router.delete("/promos/:id/redemptions/:redemptionId", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const redemptionId = Number(req.params.redemptionId);
    const promoCodeId = String(req.params.id);
    const redemption = await prisma.promoRedemption.findFirst({
      where: { id: redemptionId, promoCodeId },
    });
    if (!redemption) return res.status(404).json({ error: "Redemption not found" });

    await prisma.$transaction([
      prisma.promoRedemption.delete({ where: { id: redemptionId } }),
      prisma.promoCode.update({
        where: { id: promoCodeId },
        data: { timesRedeemed: { decrement: 1 } },
      }),
    ]);

    // If this redemption granted sponsored time, end that subscription.
    let cancelledSub = false;
    if (String(redemption.reference || "").startsWith("PROMO-")) {
      const sub = await prisma.subscription.findFirst({
        where: { userId: redemption.userId, reference: { startsWith: "PROMO-" } },
        orderBy: { id: "desc" },
      });
      if (sub) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: "cancelled" } });
        cancelledSub = true;
      }
    }

    auditAdminAction((req as any).admin, "admin.promo.revoke-redemption", "promo", promoCodeId, {
      redemptionId, userId: redemption.userId, cancelledSub,
    });
    res.json({ ok: true, cancelledSub });
  } catch (error) {
    console.error("Admin promo revoke error:", error);
    res.status(500).json({ error: "Failed to revoke redemption" });
  }
});

// ─── M6: Tickets ──────────────────────────────────────────
router.get("/tickets", requireAdmin(["support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || "all");
    const priority = String(req.query.priority || "all");
    const where: any = status === "all" ? {} : { status };
    if (["low", "normal", "high"].includes(priority)) where.priority = priority;
    const rows = await prisma.ticket.findMany({
      where,
      include: { user: { select: { name: true, email: true } }, _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    // Support-desk summary across ALL tickets
    const all = await prisma.ticket.findMany({
      select: { status: true, priority: true, createdAt: true, updatedAt: true },
    });
    const now = Date.now();
    const solvedOrClosed = all.filter((t) => t.status === "solved" || t.status === "closed");
    const avgResolutionH = solvedOrClosed.length
      ? Math.round(solvedOrClosed.reduce((s, t) => s + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()), 0) / solvedOrClosed.length / 3_600_000)
      : 0;
    const summary = {
      total: all.length,
      open: all.filter((t) => t.status === "open").length,
      pending: all.filter((t) => t.status === "pending").length,
      solved: all.filter((t) => t.status === "solved").length,
      closed: all.filter((t) => t.status === "closed").length,
      high: all.filter((t) => t.priority === "high" && t.status !== "solved" && t.status !== "closed").length,
      avgResolutionH,
      unresolvedOver24h: all.filter((t) =>
        t.status !== "solved" && t.status !== "closed" &&
        now - new Date(t.createdAt).getTime() > 24 * 3_600_000
      ).length,
    };

    res.json(rows.map((t) => ({ ...t, messageCount: t._count.messages, _count: undefined, summary })));
  } catch (error) {
    console.error("Admin tickets list error:", error);
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

router.get("/tickets/:id", requireAdmin(["support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  } catch (error) {
    console.error("Admin ticket detail error:", error);
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

// Admin reply + status change in one call.
router.post("/tickets/:id/reply", requireAdmin(["support"]), async (req: Request, res: Response) => {
  try {
    const { body, status } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: "Reply body required" });
    const admin = (req as any).admin;
    const ticket = await prisma.ticket.findUnique({ where: { id: Number(req.params.id) }, select: { id: true, status: true } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const message = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorType: "admin", authorId: admin?.adminId, body: String(body).trim() },
    });
    const nextStatus = ["open", "pending", "solved", "closed"].includes(status) ? status : "pending";
    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: nextStatus } });
    auditAdminAction(admin, "admin.ticket.reply", "ticket", ticket.id, { status: nextStatus });

    // Notify the ticket owner by email (if they have an address).
    const fullTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: { subject: true, user: { select: { id: true, email: true } } },
    });
    const userEmail = fullTicket?.user?.email;
    if (userEmail) {
      const tpl = emailTemplates.ticketReply(ticket.id, fullTicket.subject, String(body).trim());
      await sendEmail({ to: userEmail, subject: tpl.subject, html: tpl.html, template: "ticket_reply", userId: fullTicket.user?.id });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("Admin ticket reply error:", error);
    res.status(500).json({ error: "Failed to reply" });
  }
});

// ─── M8: Announcements ────────────────────────────────────
router.get("/announcements", requireAdmin(["support", "support_read"]), async (_req: Request, res: Response) => {
  try {
    const [rows, farmCount, userCount] = await Promise.all([
      prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.farm.count(),
      prisma.user.count({ where: { role: "farm_owner" } }),
    ]);
    const now = Date.now();
    const summary = {
      total: rows.length,
      live: rows.filter((a) => a.active).length ? 1 : 0,
      liveMessage: rows.find((a) => a.active)?.message || null,
      farmReach: farmCount,
      ownerReach: userCount,
      lastPublishedAt: rows[0]?.createdAt ?? null,
      retiredLast7d: rows.filter((a) => !a.active && now - new Date(a.createdAt).getTime() < 7 * 86_400_000).length,
    };
    res.json({ rows, summary });
  } catch (error) {
    console.error("Admin announcements list error:", error);
    res.status(500).json({ error: "Failed to load announcements" });
  }
});

router.post("/announcements", requireAdmin(["support"]), async (req: Request, res: Response) => {
  try {
    const { message, link } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ error: "Message required" });
    // One active banner at a time — creating a new one retires the old.
    await prisma.announcement.updateMany({ where: { active: true }, data: { active: false } });
    const ann = await prisma.announcement.create({
      data: { message: String(message).trim(), link: link || null },
    });
    auditAdminAction((req as any).admin, "admin.announcement.create", "announcement", ann.id, { message: ann.message });
    res.status(201).json(ann);
  } catch (error) {
    console.error("Admin announcement create error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/announcements/:id/deactivate", requireAdmin(["support"]), async (req: Request, res: Response) => {
  try {
    const ann = await prisma.announcement.update({ where: { id: Number(req.params.id) }, data: { active: false } });
    auditAdminAction((req as any).admin, "admin.announcement.deactivate", "announcement", ann.id, {});
    res.json(ann);
  } catch (error) {
    console.error("Admin announcement deactivate error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Quotes funnel (analytics) ────────────────────────────
// Draft → sent → accepted (+converted) across ALL farms, for the waadmin
// analytics dashboard. Real database truth, not just PostHog events.

router.get("/quotes-funnel", requireAdmin(["support", "support_read", "billing"]), async (req: Request, res: Response) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400000);

    const quotes = await prisma.quote.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true, totalAmount: true, farmId: true },
    });

    const counts = { draft: 0, sent: 0, accepted: 0, declined: 0, converted: 0, expired: 0 };
    let acceptedValue = 0;
    const farmIds = new Set<number>();
    for (const q of quotes) {
      if (counts[q.status as keyof typeof counts] !== undefined) counts[q.status as keyof typeof counts] += 1;
      if (q.status === "accepted" || q.status === "converted") acceptedValue += Number(q.totalAmount);
      farmIds.add(q.farmId);
    }

    const won = counts.accepted + counts.converted;
    const decided = won + counts.declined;

    res.json({
      windowDays: days,
      farms: farmIds.size,
      steps: [
        { stage: "Draft", count: counts.draft + counts.sent + counts.accepted + counts.declined + counts.converted + counts.expired, note: "all quotes created" },
        { stage: "Sent", count: counts.sent + counts.accepted + counts.declined + counts.converted + counts.expired, note: "shared with customers" },
        { stage: "Accepted", count: won, note: "customer said yes" },
        { stage: "Invoiced", count: counts.converted, note: "converted to invoice" },
      ],
      totals: {
        ...counts,
        acceptedValue,
        conversionRate: decided ? Math.round((won / decided) * 100) : 0,
        sendRate: counts.draft + counts.sent + won + counts.declined + counts.expired
          ? Math.round(((counts.sent + won + counts.declined + counts.expired) / (counts.draft + counts.sent + won + counts.declined + counts.expired)) * 100)
          : 0,
      },
    });
  } catch (error) {
    console.error("Quotes funnel error:", error);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
