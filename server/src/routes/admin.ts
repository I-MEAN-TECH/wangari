import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../db.js";
import { adminLogin, requireAdmin, auditAdminAction, AdminRole, signAdminToken } from "../lib/admin-auth.js";
import { generateSecret, otpauthUri, verifyTotp, generateRecoveryCodes, hashCode } from "../lib/totp.js";
import { requireActivePlan, findPlan, type PlanInfo } from "../lib/plan-tier.js";

/**
 * Super-admin API (Phase 1 of docs/ADMIN-BLUEPRINT.md).
 * Everything here is mounted at /api/admin and requires an admin JWT
 * (type:"admin") — customer and worker tokens are rejected by requireAdmin.
 * Every mutating request is audited with the acting admin identity.
 */
const router = Router();

// ─── Auth ─────────────────────────────────────────────────
// POST /api/admin/login — separate identity system from customer login.
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const result = await adminLogin(email, password, req.body?.totpCode);
    if (!result) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if ("mfaRequired" in result) {
      // Correct password but MFA challenge outstanding — never reveal whether the account exists.
      return res.status(200).json({ mfaRequired: true });
    }
    if ("mfaInvalid" in result) {
      return res.status(401).json({ error: "Invalid authenticator or recovery code" });
    }
    auditAdminAction({ adminId: result.admin.id, role: result.admin.role as AdminRole, name: result.admin.name }, "admin.login", "admin", result.admin.id, { email: result.admin.email });
    res.json(result);
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/admin/me — session check for the admin shell.
router.get("/me", requireAdmin(), (req: Request, res: Response) => {
  res.json({ admin: (req as any).admin });
});

// POST /api/admin/mfa/email-code
//
// Sends (or resends) a 6-digit login code to the admin's email when they
// don't have an authenticator app enrolled. Requires valid email+password
// (same credentials as the login step) so this can't be used to spam
// arbitrary addresses. Sent from noreply@imeantech.com via the shared SMTP.
router.post("/mfa/email-code", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const adminRoles: string[] = ["super_admin", "billing", "support", "support_read"];
    if (!adminRoles.includes(user.role)) return res.status(401).json({ error: "Invalid credentials" });
    if (user.totpEnabledAt && user.totpSecret) {
      // Allowed even with TOTP enrolled — the emailed code is a universal
      // fallback (lost phone scenario). Still requires the correct password.
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.verificationCode.deleteMany({ where: { userId: user.id, purpose: "admin_login_otp" } });
    await prisma.verificationCode.create({ data: { userId: user.id, code, purpose: "admin_login_otp", expiresAt } });

    const { sendEmail } = await import("../lib/email.js");
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:28px;"><h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Wangari Admin sign-in code</h2><p style="margin:0 0 24px;font-size:15px;color:#64748b;">Use this code to finish signing in to the Wangari admin panel. It expires in <strong>10 minutes</strong>.</p><div style="background:#f0fdf4;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;"><span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#166534;font-family:monospace;">${code}</span></div><p style="margin:0;font-size:13px;color:#64748b;">Didn't try to sign in? Someone has your password — change it immediately.</p></div></body></html>`;
    const result = await sendEmail({
      to: user.email,
      subject: "Wangari Admin sign-in code — expires in 10 minutes",
      html,
      text: `Your Wangari Admin sign-in code is ${code}. It expires in 10 minutes. If you didn't try to sign in, change your password immediately.`,
      template: "oneoff",
      userId: user.id,
    });

    res.json({ ok: result.ok, error: result.ok ? undefined : result.error });
  } catch (error: any) {
    console.error("Admin email-code error:", error);
    res.status(500).json({ error: "Could not send the code" });
  }
});

// ─── MFA (TOTP) — Phase 4 ────────────────────────────────
// GET /api/admin/mfa/status — whether MFA is enabled for the current admin.
router.get("/mfa/status", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin.adminId as number;
    const user = await prisma.user.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true } });
    res.json({ enabled: !!user?.totpEnabledAt });
  } catch (error) {
    console.error("Admin MFA status error:", error);
    res.status(500).json({ error: "Failed to check MFA status" });
  }
});

// POST /api/admin/mfa/setup — generate a pending secret + otpauth URI.
// Does NOT enable MFA until /mfa/verify confirms a live code.
router.post("/mfa/setup", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const user = await prisma.user.findUnique({ where: { id: admin.adminId }, select: { email: true, totpEnabledAt: true } });
    if (!user) return res.status(404).json({ error: "Admin not found" });
    if (user.totpEnabledAt) return res.status(409).json({ error: "MFA is already enabled — disable it first to re-enroll" });

    const secret = generateSecret();
    await prisma.user.update({ where: { id: admin.adminId }, data: { totpSecret: secret } });
    auditAdminAction(admin, "admin.mfa.setup", "admin", admin.adminId, {});
    res.json({ secret, otpauthUri: otpauthUri(secret, user.email) });
  } catch (error) {
    console.error("Admin MFA setup error:", error);
    res.status(500).json({ error: "Failed to start MFA setup" });
  }
});

// POST /api/admin/mfa/verify — confirm a live code, enable MFA, return recovery codes ONCE.
router.post("/mfa/verify", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const code = String(req.body?.code || "").trim();
    const user = await prisma.user.findUnique({ where: { id: admin.adminId }, select: { totpSecret: true, totpEnabledAt: true } });
    if (!user?.totpSecret) return res.status(400).json({ error: "Start MFA setup first" });
    if (user.totpEnabledAt) return res.status(409).json({ error: "MFA already enabled" });
    if (!verifyTotp(user.totpSecret, code)) {
      return res.status(401).json({ error: "Invalid code — check your authenticator and try again" });
    }
    const { plain, hashed } = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: admin.adminId },
      data: { totpEnabledAt: new Date(), recoveryCodes: JSON.stringify(hashed) },
    });
    auditAdminAction(admin, "admin.mfa.enable", "admin", admin.adminId, {});
    res.json({ enabled: true, recoveryCodes: plain }); // plaintext shown exactly once
  } catch (error) {
    console.error("Admin MFA verify error:", error);
    res.status(500).json({ error: "Failed to enable MFA" });
  }
});

// POST /api/admin/mfa/disable — requires password + a valid current TOTP code.
router.post("/mfa/disable", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const { password, code } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: admin.adminId }, select: { password: true, totpSecret: true, totpEnabledAt: true } });
    if (!user?.totpEnabledAt) return res.status(400).json({ error: "MFA is not enabled" });
    if (!password || !(await bcrypt.compare(String(password), user.password!))) {
      return res.status(401).json({ error: "Password confirmation failed" });
    }
    if (!user.totpSecret || !verifyTotp(user.totpSecret, String(code || ""))) {
      return res.status(401).json({ error: "Valid authenticator code required to disable MFA" });
    }
    await prisma.user.update({
      where: { id: admin.adminId },
      data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null },
    });
    auditAdminAction(admin, "admin.mfa.disable", "admin", admin.adminId, {});
    res.json({ enabled: false });
  } catch (error) {
    console.error("Admin MFA disable error:", error);
    res.status(500).json({ error: "Failed to disable MFA" });
  }
});

// ─── Security center ─────────────────────────────────────────
// GET /api/admin/security/summary — account security posture + recent events.
router.get("/security/summary", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin.adminId as number;
    const user = await prisma.user.findUnique({
      where: { id: adminId },
      select: { email: true, totpEnabledAt: true, recoveryCodes: true, tokenVersion: true, password: true },
    });
    if (!user) return res.status(404).json({ error: "Admin not found" });
    const events = await prisma.auditLog.findMany({
      where: { userId: adminId, action: { startsWith: "admin." } },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    const lastLogin = await prisma.auditLog.findFirst({
      where: { userId: adminId, action: "admin.login" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, details: true },
    });
    res.json({
      email: user.email,
      mfaEnabled: !!user.totpEnabledAt,
      mfaEnabledAt: user.totpEnabledAt,
      recoveryCodesRemaining: user.recoveryCodes ? (JSON.parse(user.recoveryCodes) as string[]).length : 0,
      lastLogin: lastLogin?.createdAt ?? null,
      events,
      hasGoogleOnly: !user.password,
    });
  } catch (error) {
    console.error("Admin security summary error:", error);
    res.status(500).json({ error: "Failed to load security summary" });
  }
});

// POST /api/admin/security/change-password — requires current password + MFA code when enabled.
router.post("/security/change-password", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current and new password required" });
    if (String(newPassword).length < 12) return res.status(400).json({ error: "New password must be at least 12 characters" });
    const user = await prisma.user.findUnique({ where: { id: admin.adminId }, select: { password: true, totpSecret: true, totpEnabledAt: true } });
    if (!user) return res.status(404).json({ error: "Admin not found" });
    if (!user.password || !(await bcrypt.compare(String(currentPassword), user.password))) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    if (user.totpEnabledAt) {
      if (!user.totpSecret || !verifyTotp(user.totpSecret, String(req.body?.totpCode || ""))) {
        return res.status(401).json({ error: "Valid authenticator code required" });
      }
    }
    const hashed = await bcrypt.hash(String(newPassword), 12);
    // Bump tokenVersion → revokes all admin sessions (incl. current). New
    // password = new credential, old sessions cannot be trusted.
    const updated = await prisma.user.update({ where: { id: admin.adminId }, data: { password: hashed, tokenVersion: { increment: 1 } } });
    auditAdminAction({ ...admin, tv: updated.tokenVersion }, "admin.security.password_change", "admin", admin.adminId, {});
    const token = signAdminToken({ adminId: admin.adminId, role: admin.role, name: admin.name }, updated.tokenVersion);
    res.json({ ok: true, token }); // fresh token so the current tab stays signed in
  } catch (error) {
    console.error("Admin password change error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// POST /api/admin/security/recovery-codes/rotate — password + code required, returns new codes ONCE.
router.post("/security/recovery-codes/rotate", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const { password, code } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: admin.adminId }, select: { password: true, totpSecret: true, totpEnabledAt: true, recoveryCodes: true } });
    if (!user?.totpEnabledAt) return res.status(400).json({ error: "MFA is not enabled" });
    if (!password || !(await bcrypt.compare(String(password), user.password!))) {
      return res.status(401).json({ error: "Password confirmation failed" });
    }
    const validCode = verifyTotp(user.totpSecret!, String(code || "")) ||
      (JSON.parse(user.recoveryCodes || "[]") as string[]).includes(hashCode(String(code || "")));
    if (!validCode) return res.status(401).json({ error: "Valid authenticator code required" });
    const { plain, hashed } = generateRecoveryCodes();
    await prisma.user.update({ where: { id: admin.adminId }, data: { recoveryCodes: JSON.stringify(hashed) } });
    auditAdminAction(admin, "admin.security.recovery_rotate", "admin", admin.adminId, {});
    res.json({ recoveryCodes: plain });
  } catch (error) {
    console.error("Admin recovery rotate error:", error);
    res.status(500).json({ error: "Failed to rotate recovery codes" });
  }
});

// POST /api/admin/security/signout-everywhere — bump tokenVersion, revoke all admin sessions.
router.post("/security/signout-everywhere", requireAdmin(), async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const { password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: admin.adminId }, select: { password: true } });
    if (!user?.password || !password || !(await bcrypt.compare(String(password), user.password))) {
      return res.status(401).json({ error: "Password confirmation failed" });
    }
    await prisma.user.update({ where: { id: admin.adminId }, data: { tokenVersion: { increment: 1 } } });
    auditAdminAction(admin, "admin.security.signout_all", "admin", admin.adminId, {});
    res.json({ ok: true }); // current token is now dead too — client clears session
  } catch (error) {
    console.error("Admin signout-everywhere error:", error);
    res.status(500).json({ error: "Failed to revoke sessions" });
  }
});

// ─── M0: Overview ─────────────────────────────────────────
router.get("/overview", requireAdmin(["billing", "support", "support_read"]), async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalFarms, totalUsers, totalWorkers, activeSubs, promoTotals, promoRedemptionsThisMonth, sponsoredActive, recentUsers, recentPayments, openTickets] =
      await Promise.all([
        prisma.farm.count(),
        prisma.user.count({ where: { role: "farm_owner" } }),
        prisma.worker.count(),
        prisma.subscription.findMany({ where: { status: "active", expiresAt: { gt: now } }, select: { amount: true, planName: true } }),
        prisma.promoCode.count(),
        prisma.promoRedemption.count({ where: { createdAt: { gte: monthStart } } }),
        prisma.subscription.count({
          where: { status: "active", expiresAt: { gt: now }, planName: { contains: "sponsored" } },
        }),
        prisma.user.findMany({
          where: { role: "farm_owner", createdAt: { gte: sevenDaysAgo } },
          select: { id: true, name: true, email: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.subscription.findMany({
          where: { status: "active" },
          select: { id: true, userId: true, planName: true, amount: true, startsAt: true, reference: true, user: { select: { name: true, email: true } } },
          orderBy: { startsAt: "desc" },
          take: 8,
        }),
        // Tickets arrive in Phase 2 (model added then) — tolerate absence now.
        (async () => {
          const anyPrisma = prisma as any;
          if (!anyPrisma.ticket) return 0;
          return await anyPrisma.ticket.count({ where: { status: { in: ["open", "pending"] } } });
        })(),
      ]);

    // MRR: active subscription amounts (Decimal stored in KES major units)
    const mrr = activeSubs.reduce((sum, s) => sum + Number(s.amount), 0);
    const byPlan: Record<string, { count: number; revenue: number }> = {};
    for (const s of activeSubs) {
      const k = s.planName;
      byPlan[k] = byPlan[k] || { count: 0, revenue: 0 };
      byPlan[k].count += 1;
      byPlan[k].revenue += Number(s.amount);
    }

    // 7-day signup trend
    const signups: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const count = await prisma.user.count({ where: { role: "farm_owner", createdAt: { gte: start, lt: end } } });
      signups.push({ date: start.toISOString().slice(0, 10), count });
    }

    // 30-day revenue trend (payments activated per day, KES)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const paidSubs = await prisma.subscription.findMany({
      where: { status: "active", startsAt: { gte: thirtyDaysAgo } },
      select: { amount: true, startsAt: true },
    });
    const revenueTrend: { date: string; revenue: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString().slice(0, 10);
      revenueTrend.push({ date: key, revenue: 0 });
    }
    const revIndex = new Map(revenueTrend.map((r) => [r.date, r]));
    for (const s of paidSubs) {
      const key = new Date(s.startsAt).toISOString().slice(0, 10);
      const row = revIndex.get(key);
      if (row) row.revenue += Number(s.amount);
    }

    // ── Mission-control extras ──
    // 1. KPI deltas: new owners this week vs last week
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const [ownersThisWeek, ownersLastWeek] = await Promise.all([
      prisma.user.count({ where: { role: "farm_owner", createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { role: "farm_owner", createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    ]);

    // 2. Subscriptions expiring within 7 days (churn/conversion window) + farms with no active sub
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const anyPrisma2 = prisma as any;
    let expiringSubs: { id: number; planName: string; expiresAt: Date; user: { name: string; email: string } | null }[] = [];
    let trialFarms = 0;
    if (anyPrisma2.subscription) {
      expiringSubs = await prisma.subscription.findMany({
        where: { status: "active", expiresAt: { gt: now, lte: weekAhead } },
        select: { id: true, planName: true, expiresAt: true, user: { select: { name: true, email: true } } },
        orderBy: { expiresAt: "asc" },
        take: 10,
      });
      trialFarms = await prisma.$queryRawUnsafe<number>(`SELECT COUNT(*)::int FROM farms f WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = f.owner_id AND s.status = 'active')`).then((r: any) => Number(r?.[0]?.count ?? 0)).catch(() => 0);
    }

    // 3. Email ops health (last 24h)
    let emailsLast24h = { sent: 0, failed: 0 };
    if (anyPrisma2.emailLog) {
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [sent, failed] = await Promise.all([
        anyPrisma2.emailLog.count({ where: { status: "sent", createdAt: { gte: dayAgo } } }),
        anyPrisma2.emailLog.count({ where: { status: "failed", createdAt: { gte: dayAgo } } }),
      ]);
      emailsLast24h = { sent, failed };
    }

    // 4. Recent admin actions (audit feed)
    let recentAdminActions: { id: number; action: string; details: unknown; createdAt: Date }[] = [];
    if (anyPrisma2.auditLog) {
      recentAdminActions = await anyPrisma2.auditLog.findMany({
        where: { action: { startsWith: "admin." } },
        select: { id: true, action: true, details: true, createdAt: true },
        orderBy: { id: "desc" },
        take: 6,
      });
    }

    res.json({
      totals: {
        farms: totalFarms,
        users: totalUsers,
        workers: totalWorkers,
        activeSubscriptions: activeSubs.length,
        mrrKes: Math.round(mrr),
        openTickets,
      },
      byPlan,
      signups,
      revenueTrend,
      recentUsers,
      recentPayments,
      deltas: {
        ownersThisWeek,
        ownersLastWeek,
        signupChangePct: ownersLastWeek === 0 ? (ownersThisWeek > 0 ? 100 : 0) : Math.round(((ownersThisWeek - ownersLastWeek) / ownersLastWeek) * 100),
      },
      expiringSubs: expiringSubs.map((s) => ({ ...s, expiresAt: s.expiresAt.toISOString() })),
      trialFarms,
      emailHealth: emailsLast24h,
      recentAdminActions,
      promoStats: {
        totalCodes: promoTotals,
        redemptionsThisMonth: promoRedemptionsThisMonth,
        sponsoredActive,
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

// ─── M3: Plans CRUD ───────────────────────────────────────
router.get("/plans", requireAdmin(["billing", "support", "support_read"]), async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    const [counts, allTime, everPaid] = await Promise.all([
      prisma.subscription.groupBy({
        by: ["plan"],
        where: { status: "active", expiresAt: { gt: now } },
        _count: true,
      }),
      prisma.subscription.groupBy({
        by: ["plan"],
        where: { status: "active" },
        _sum: { amount: true },
      }),
      prisma.subscription.groupBy({
        by: ["plan"],
        where: { amount: { gt: 0 } },
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c.plan, c._count]));
    const mrrMap = Object.fromEntries(allTime.map((c) => [c.plan, Number(c._sum.amount ?? 0)]));
    const lifetimeMap = Object.fromEntries(everPaid.map((c) => [c.plan, { count: c._count, revenue: Number(c._sum.amount ?? 0) }]));

    res.json(plans.map((p) => ({
      ...p,
      activeSubscriptions: countMap[p.id] || 0,
      mrr: mrrMap[p.id] || 0,
      lifetimeSubscribers: lifetimeMap[p.id]?.count || 0,
      lifetimeRevenue: lifetimeMap[p.id]?.revenue || 0,
    })));
  } catch (error) {
    console.error("Admin plans list error:", error);
    res.status(500).json({ error: "Failed to load plans" });
  }
});

// Coerce to a finite number or undefined (rejects NaN from bad input).
function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

router.post("/plans", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const { id, name, description, amount, days, active, sortOrder } = req.body || {};
    const amt = numOrUndef(amount);
    const d = numOrUndef(days);
    if (!id || !name || amt === undefined || d === undefined) {
      return res.status(400).json({ error: "id, name, amount (pesewas) and days are required and must be numbers" });
    }
    const plan = await prisma.plan.create({
      data: { id: String(id).trim().toLowerCase(), name: String(name).trim(), description: description || null, amount: amt, days: d, active: active !== false, sortOrder: numOrUndef(sortOrder) || 0 },
    });
    auditAdminAction((req as any).admin, "admin.plan.create", "plan", plan.id, { name: plan.name, amount: plan.amount, days: plan.days });
    res.json(plan);
  } catch (error: any) {
    if (error?.code === "P2002") return res.status(409).json({ error: "A plan with that id already exists" });
    console.error("Admin plan create error:", error);
    res.status(500).json({ error: "Failed to create plan" });
  }
});

router.patch("/plans/:id", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const planId = String(req.params.id);
    const before = await prisma.plan.findUnique({ where: { id: planId } });
    if (!before) return res.status(404).json({ error: "Plan not found" });
    // The plan id is the tier key the whole gating system runs on — renaming
    // it would orphan every subscription pointing at it.
    if (req.body?.id !== undefined && String(req.body.id).trim().toLowerCase() !== planId) {
      return res.status(400).json({ error: "Plan id cannot be renamed (active subscriptions reference it)" });
    }
    // Disabling a plan that promos or the default grant still reference would
    // break redemption — surface which promos are affected so the admin can
    // fix them first.
    if (req.body?.active === false) {
      const linked = await prisma.promoCode.count({ where: { planId: planId, active: true } });
      if (linked > 0) {
        return res.status(400).json({ error: `${linked} active promo code(s) are restricted to this plan — reassign or remove them before disabling the plan` });
      }
    }
    const { name, description, amount, days, active, sortOrder } = req.body || {};
    const amt = numOrUndef(amount);
    const d = numOrUndef(days);
    if ((amount !== undefined && amt === undefined) || (days !== undefined && d === undefined)) {
      return res.status(400).json({ error: "amount and days must be numbers" });
    }
    const plan = await prisma.plan.update({
      where: { id: planId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(amt !== undefined ? { amount: amt } : {}),
        ...(d !== undefined ? { days: d } : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
        ...(sortOrder !== undefined ? { sortOrder: numOrUndef(sortOrder) || 0 } : {}),
      },
    });
    auditAdminAction((req as any).admin, "admin.plan.update", "plan", plan.id, {
      before: { name: before.name, amount: before.amount, days: before.days, active: before.active },
      after: { name: plan.name, amount: plan.amount, days: plan.days, active: plan.active },
    });
    res.json(plan);
  } catch (error) {
    console.error("Admin plan update error:", error);
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// ─── M2: Billing & Subscriptions ──────────────────────────
router.get("/billing", requireAdmin(["billing", "support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || "all");
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 20;
    const where: any = {};
    if (status !== "all") where.status = status;
    if (q) where.user = { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

    const [rows, total, allSubs] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { startsAt: "desc" },
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        select: { amount: true, status: true, startsAt: true, expiresAt: true, planName: true },
      }),
    ]);

    // Money summary (platform-wide, independent of filters)
    const paid = (s: (typeof allSubs)[number]) => Number(s.amount) > 0;
    const isActive = (s: (typeof allSubs)[number]) => s.status === "active" && s.expiresAt > now;
    const summary = {
      mrr: Math.round(allSubs.filter(isActive).reduce((sum, s) => sum + Number(s.amount), 0)),
      activeCount: allSubs.filter(isActive).length,
      collected30d: Math.round(allSubs.filter((s) => paid(s) && s.startsAt >= thirtyDaysAgo).reduce((sum, s) => sum + Number(s.amount), 0)),
      collectedMtd: Math.round(allSubs.filter((s) => paid(s) && s.startsAt >= monthStart).reduce((sum, s) => sum + Number(s.amount), 0)),
      lifetimeRevenue: Math.round(allSubs.filter(paid).reduce((sum, s) => sum + Number(s.amount), 0)),
      expiringSoon: allSubs.filter((s) => isActive(s) && s.expiresAt <= weekAhead).length,
      comps: allSubs.filter((s) => !paid(s) && s.status === "active").length,
    };
    const aru = summary.activeCount > 0 ? Math.round(summary.mrr / summary.activeCount) : 0;

    const paged = rows.slice((page - 1) * pageSize, page * pageSize);
    res.json({ rows: paged, total, page, pageSize, summary: { ...summary, aru } });
  } catch (error) {
    console.error("Admin billing list error:", error);
    res.status(500).json({ error: "Failed to load billing" });
  }
});

// Manual plan override / comp: create a compensated subscription (amount 0 = free comp).
router.post("/billing/override", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const { userId, plan, planName, days, amount } = req.body || {};
    if (!userId || !plan || !days) {
      return res.status(400).json({ error: "userId, plan and days are required" });
    }
    // Plan must exist in the plans table — no free-text plan ids that silently
    // break module gating.
    let planRow: PlanInfo;
    try {
      planRow = await requireActivePlan(String(plan));
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + Number(days) * 24 * 60 * 60 * 1000);
    const sub = await prisma.subscription.create({
      data: {
        userId: Number(userId),
        plan: planRow.id,
        planName: String(planName || planRow.name),
        amount: amount !== undefined ? Number(amount) : 0,
        status: "active",
        reference: `admin_override_${Date.now()}`,
        startsAt,
        expiresAt,
      },
    });
    auditAdminAction((req as any).admin, "admin.billing.override", "subscription", sub.id, { userId, plan, days, amount: sub.amount });
    res.json(sub);
  } catch (error) {
    console.error("Admin billing override error:", error);
    res.status(500).json({ error: "Failed to apply override" });
  }
});

// Cancel (deactivate) a subscription immediately.
router.post("/billing/:id/cancel", requireAdmin(["billing"]), async (req: Request, res: Response) => {
  try {
    const sub = await prisma.subscription.update({ where: { id: Number(req.params.id) }, data: { status: "cancelled" } });
    auditAdminAction((req as any).admin, "admin.billing.cancel", "subscription", sub.id, { userId: sub.userId, plan: sub.plan });
    res.json(sub);
  } catch (error) {
    console.error("Admin billing cancel error:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// ─── Audit trail ──────────────────────────────────────────
router.get("/audit", requireAdmin(["billing", "support", "support_read"]), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const action = String(req.query.action || "all"); // all | admin | money | auth
    const q = String(req.query.q || "").trim(); // search action / entity / actor name
    const pageSize = 30;

    const where: any = {};
    if (action === "admin") where.action = { startsWith: "admin." };
    if (action === "money") where.action = { contains: "." }; // refined below in JS for money patterns
    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [allRows, total, stats] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        select: { action: true, createdAt: true, userId: true, details: true },
        orderBy: { id: "desc" },
        take: 2000,
      }),
    ]);

    // Activity stats (across the recent 2000 entries)
    const now = Date.now();
    const inLast = (h: number) => now - h * 3_600_000;
    const isMoney = (a: string) => /transaction|payment|subscription|billing|extend|comp|promo/.test(a);
    const adminRows = stats.filter((r) => r.action.startsWith("admin."));
    const actorCounts = new Map<string, number>();
    for (const r of adminRows) {
      const actor = (r.details as any)?._actor || `user#${r.userId ?? "?"}`;
      actorCounts.set(actor, (actorCounts.get(actor) || 0) + 1);
    }
    const topActors = [...actorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, count]) => ({ name, count }));
    const summary = {
      totalAllTime: await prisma.auditLog.count(),
      last24h: stats.filter((r) => new Date(r.createdAt).getTime() > inLast(24)).length,
      admin24h: adminRows.filter((r) => new Date(r.createdAt).getTime() > inLast(24)).length,
      money24h: stats.filter((r) => isMoney(r.action) && new Date(r.createdAt).getTime() > inLast(24)).length,
      adminAll: adminRows.length,
      moneyAll: stats.filter((r) => isMoney(r.action)).length,
      topActors,
    };

    // JS-refine money filter (regex on action)
    const filteredRows = action === "money" ? allRows.filter((r) => isMoney(r.action)) : allRows;
    const totalFiltered = action === "money" ? filteredRows.length : total;
    const paged = action === "money"
      ? filteredRows.slice((page - 1) * pageSize, page * pageSize)
      : allRows;

    res.json({ rows: paged, total: totalFiltered, page, pageSize, summary });
  } catch (error) {
    console.error("Admin audit list error:", error);
    res.status(500).json({ error: "Failed to load audit log" });
  }
});

// ─── M10: System health ───────────────────────────────────
router.get("/system", requireAdmin(["billing", "support", "support_read"]), async (_req: Request, res: Response) => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - start;
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000);

    const anyPrisma = prisma as any;
    const [farms, users, subs, workers, mem, auditCount, emailStats, smtpConfigured, paystackConfigured] = await Promise.all([
      prisma.farm.count(),
      prisma.user.count(),
      prisma.subscription.count(),
      anyPrisma.worker ? anyPrisma.worker.count() : Promise.resolve(0),
      Promise.resolve(process.memoryUsage()),
      anyPrisma.auditLog ? anyPrisma.auditLog.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0) : Promise.resolve(0),
      anyPrisma.emailLog
        ? Promise.all([
            anyPrisma.emailLog.count({ where: { status: "sent", createdAt: { gte: dayAgo } } }),
            anyPrisma.emailLog.count({ where: { status: "failed", createdAt: { gte: dayAgo } } }),
          ]).then(([sent, failed]) => ({ sent, failed })).catch(() => ({ sent: 0, failed: 0 }))
        : Promise.resolve({ sent: 0, failed: 0 }),
      Promise.resolve(!!process.env.SMTP_HOST),
      Promise.resolve(!!process.env.PAYSTACK_SECRET_KEY),
    ]);

    res.json({
      status: "ok",
      dbLatencyMs,
      counts: { farms, users, subs, workers, audit24h: auditCount },
      email: emailStats,
      services: {
        database: dbLatencyMs < 500 ? "ok" : dbLatencyMs < 2000 ? "slow" : "down",
        smtp: smtpConfigured ? "configured" : "not_configured",
        paystack: paystackConfigured ? "configured" : "not_configured",
      },
      memory: {
        heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
        heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
        rssMb: Math.round(mem.rss / 1_048_576),
      },
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      checkedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Admin system error:", error);
    res.status(500).json({ error: "Health check failed" });
  }
});

export default router;
