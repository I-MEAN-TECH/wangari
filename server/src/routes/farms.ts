import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { createUniqueFarmCode, ensureFarmCode } from "../lib/farm-code.js";

const router = Router();
router.use(authMiddleware, requireOwner);

// GET /api/farms — list all farms the user is a member of
router.get("/", async (req: Request, res: Response) => {
  try {
    const memberships = await prisma.farmMember.findMany({
      where: { userId: req.user!.userId },
      include: { farm: true },
    });
    const farms = memberships.map((m: any) => m.farm);
    res.json(farms);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/farms/:id — get farm details with stats
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = Number(req.params.id);
    // Verify user is a member
    const member = await prisma.farmMember.findFirst({ where: { userId: req.user!.userId, farmId } });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) return res.status(404).json({ error: "Not found" });

    // Get stats
    const [flockCount, cropCount, workerCount, salesTotal] = await Promise.all([
      prisma.flock.count({ where: { farmId, status: "active" } }),
      prisma.crop.count({ where: { farmId } }),
      prisma.worker.count({ where: { farmId, status: "active" } }),
      prisma.sale.aggregate({ where: { farmId }, _sum: { totalAmount: true } }),
    ]);

    res.json({ ...farm, stats: { flocks: flockCount, crops: cropCount, workers: workerCount, revenue: Number(salesTotal._sum.totalAmount || 0) } });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/farms — create a new farm
router.post("/", async (req: Request, res: Response) => {
  try {
    const ownerId = req.user!.userId!;

    // Enterprise tier restriction: 1 farm included in Starter/Growth/Core.
    // Managing multiple farms requires the Enterprise plan.
    const existingCount = await prisma.farm.count({ where: { ownerId } });
    if (existingCount >= 1) {
      const activeSub = await prisma.subscription.findFirst({
        where: { userId: ownerId, status: "active", expiresAt: { gt: new Date() } },
      });
      const isEnterprise = activeSub && /enterprise/.test((activeSub.plan || "").toLowerCase());
      if (!isEnterprise) {
        return res.status(403).json({
          error: "Multi-farm management is available on the Enterprise plan. Please upgrade to create additional farms.",
          upgradeRequired: true,
        });
      }
    }

    const farm = await prisma.farm.create({
      data: {
        name: req.body.name,
        location: req.body.location || null,
        county: req.body.county || null,
        farmType: req.body.farmType || null,
        ownerId,
        code: await createUniqueFarmCode(),
      },
    });
    // Add user as owner
    await prisma.farmMember.create({
      data: { userId: ownerId, farmId: farm.id, role: "farm_owner" },
    });
    res.status(201).json(farm);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/farms/:id/invite — add member to farm
router.post("/:id/invite", async (req: Request, res: Response) => {
  try {
    const farmId = Number(req.params.id);
    const member = await prisma.farmMember.findFirst({ where: { userId: req.user!.userId, farmId } });
    if (!member || member.role !== "farm_owner") return res.status(403).json({ error: "Only owners can invite" });

    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const existing = await prisma.farmMember.findFirst({ where: { userId: user.id, farmId } });
    if (existing) return res.status(409).json({ error: "Already a member" });

    const newMember = await prisma.farmMember.create({
      data: { userId: user.id, farmId, role: req.body.role || "member" },
    });
    res.status(201).json(newMember);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/farms/:id/members/:memberId — remove member
router.delete("/:id/members/:memberId", async (req: Request, res: Response) => {
  try {
    const farmId = Number(req.params.id);
    const member = await prisma.farmMember.findFirst({ where: { userId: req.user!.userId, farmId } });
    if (!member || member.role !== "farm_owner") return res.status(403).json({ error: "Only owners can remove members" });

    await prisma.farmMember.delete({ where: { id: Number(req.params.memberId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
