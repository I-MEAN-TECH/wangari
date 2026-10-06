import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware, generateToken } from "../middleware/auth.js";
import { ensureFarmCode } from "../lib/farm-code.js";
import { maskNationalId, parseNationalId, parseGps, parsePremisesRegNo } from "../lib/kiamis.js";
import bcrypt from "bcryptjs";

const router = Router();
router.use(authMiddleware, requireOwner);

// GET /api/settings — get all farm settings
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const settings = await prisma.farmSetting.findMany({ where: { farmId } });
    const map: Record<string, string> = {};
    settings.forEach((s: any) => { map[s.settingKey] = s.settingValue || ""; });

    // Also get farm info and user info
    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true, email: true, phone: true, nationalId: true },
    });

    // The full national ID never rides an ordinary profile read — only a
    // masked hint. The one full-value exit is the owner's own KIAMIS export.
    const safeUser = user
      ? {
          name: user.name,
          email: user.email,
          phone: user.phone,
          nationalIdMasked: maskNationalId(user.nationalId),
          nationalIdSet: user.nationalId != null,
        }
      : user;

    // Backfill farm connection code for older farms
    const code = await ensureFarmCode(farmId);

    res.json({ settings: map, farm: { ...farm, code }, user: safeUser });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PUT /api/settings — update settings (bulk)
router.put("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const { settings } = req.body;

    if (typeof settings === "object" && settings !== null) {
      for (const [key, value] of Object.entries(settings)) {
        await prisma.farmSetting.upsert({
          where: { farmId_settingKey: { farmId, settingKey: key } },
          create: { farmId, settingKey: key, settingValue: String(value) },
          update: { settingValue: String(value) },
        });
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PUT /api/settings/profile — update farm + user profile
router.put("/profile", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const userId = req.user!.userId;

    // Update farm
    if (req.body.farmName || req.body.location || req.body.county || req.body.farmType) {
      await prisma.farm.update({ where: { id: farmId }, data: {
        name: req.body.farmName || undefined,
        location: req.body.location || undefined,
        county: req.body.county || undefined,
        farmType: req.body.farmType || undefined,
      }});
    }

    // ── M2 compliance fields (premises number, plot GPS, national ID) ──
    // Only keys PRESENT in the body are touched: absent = unchanged, blank =
    // cleared. Every value is parsed by lib/kiamis.ts first — a bad ID or a
    // half GPS pair is a 400 with the reason, never a silent bad save.
    const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);

    if (has("premisesRegNo") || has("latitude") || has("longitude")) {
      const premises = has("premisesRegNo")
        ? parsePremisesRegNo(req.body.premisesRegNo)
        : ({ ok: true, value: undefined } as const);
      if (!premises.ok) return res.status(400).json({ error: premises.error, field: "premisesRegNo" });

      const gps =
        has("latitude") || has("longitude")
          ? parseGps(req.body.latitude, req.body.longitude)
          : ({ ok: true, value: undefined } as const);
      if (!gps.ok) return res.status(400).json({ error: gps.error, field: "gps" });

      await prisma.farm.update({
        where: { id: farmId },
        data: {
          ...(has("premisesRegNo") ? { premisesRegNo: premises.value } : {}),
          ...(gps.value !== undefined
            ? { latitude: gps.value?.latitude ?? null, longitude: gps.value?.longitude ?? null }
            : {}),
        },
      });
    }

    if (has("nationalId")) {
      const nationalId = parseNationalId(req.body.nationalId);
      if (!nationalId.ok) return res.status(400).json({ error: nationalId.error, field: "nationalId" });
      await prisma.user.update({ where: { id: userId }, data: { nationalId: nationalId.value } });
    }

    // Update user
    if (req.body.name || req.body.email || req.body.phone) {
      const existing = await prisma.user.findUnique({ where: { id: userId } });
      const finalName = req.body.name || existing?.name;
      const finalPhone = req.body.phone || existing?.phone;
      await prisma.user.update({ where: { id: userId }, data: {
        name: req.body.name || undefined,
        email: req.body.email || undefined,
        phone: req.body.phone || undefined,
        // Profile is complete once the essentials are filled — this clears the
        // dashboard "Complete your farm profile" banner.
        profileComplete: Boolean(finalName && finalPhone) || undefined,
      }});
    } else if (req.body.markProfileComplete) {
      await prisma.user.update({ where: { id: userId }, data: { profileComplete: true } });
    }

    const updated = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, avatar: true, profileComplete: true } });
    res.json({ success: true, user: updated });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PUT /api/settings/password — change password
router.put("/password", async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords required" });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.password) {
      return res.status(400).json({ error: "This account uses Google sign-in. Password cannot be changed here." });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 12);
    // Bump tokenVersion: every other session for this user is revoked.
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, tokenVersion: { increment: 1 } } });
    res.json({ success: true, tokenRevoked: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
