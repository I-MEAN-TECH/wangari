import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireFarm);

// GET /api/vaccinations
router.get("/", async (req: Request, res: Response) => {
  try {
    const flocks = await prisma.flock.findMany({ where: { farmId: req.user!.farmId! }, select: { id: true } });
    const flockIds = flocks.map((f) => f.id);
    const data = await prisma.vaccination.findMany({
      where: { flockId: { in: flockIds } },
      orderBy: { scheduledDate: "desc" },
      include: { flock: { select: { name: true } } },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/vaccinations
router.post("/", async (req: Request, res: Response) => {
  try {
    const result = await prisma.vaccination.create({
      data: {
        flockId: Number(req.body.flockId),
        vaccineName: req.body.vaccineName,
        scheduledDate: new Date(req.body.scheduledDate),
        notes: req.body.notes || null,
      },
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PATCH /api/vaccinations/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const result = await prisma.vaccination.update({
      where: { id: Number(req.params.id) },
      data: {
        status: req.body.status,
        completedDate: req.body.completedDate ? new Date(req.body.completedDate) : undefined,
        notes: req.body.notes,
      },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/vaccinations/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.vaccination.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
