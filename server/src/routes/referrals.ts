import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { ensureFarmCode } from "../lib/farm-code.js";

const router = Router();

/**
 * GET /api/referrals/my-code
 * Returns the authenticated farmer's referral code, shareable link, WhatsApp message,
 * and current referral stats.
 */
router.get("/my-code", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Look up user's farm
    let farm = await prisma.farm.findFirst({
      where: { ownerId: userId },
      orderBy: { id: "asc" },
    });

    if (!farm) {
      // Fallback: check membership
      const membership = await prisma.farmMember.findFirst({
        where: { userId },
      });
      if (membership) {
        farm = await prisma.farm.findUnique({ where: { id: membership.farmId } });
      }
    }

    if (!farm) {
      return res.status(404).json({ error: "No farm found" });
    }

    const farmCode = await ensureFarmCode(farm.id);
    const appUrl = process.env.FRONTEND_URL || "https://wangari.imeantech.com";
    const refLink = `${appUrl}/register?ref=${farmCode}`;

    const waText = `Habari! Nimekuwa nikitumia Wangari kusimamia shamba langu na mifugo. Inanisaidia kutunza hesabu za maziwa, mayai, na kunitumia ujumbe wa chanjo na mimba ya ng'ombe. Jaribu bure leo hapa: ${refLink}`;
    const waShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

    // Count successful referrals recorded in announcements
    const referralsCount = await prisma.announcement.count({
      where: {
        farmId: farm.id,
        message: { contains: "amejiunga na Wangari" },
      },
    });

    res.json({
      farmCode,
      refLink,
      waText,
      waShareUrl,
      referralsCount,
      farmName: farm.name,
    });
  } catch (error: any) {
    console.error("Referral fetch error:", error);
    res.status(500).json({ error: "Failed to fetch referral code" });
  }
});

export default router;
