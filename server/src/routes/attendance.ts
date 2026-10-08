import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireFarm, requireOwner } from "../middleware/requireOwner.js";
import { farmDayStart, farmTime, isFarmToday } from "../lib/farm-day.js";

const router = Router();
router.use(authMiddleware, requireFarm);

// GET /api/attendance
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.attendance.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { date: "desc" },
      take: 100,
      include: { worker: { select: { name: true, role: true, dailyWage: true } } },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/attendance — clock in or create record (owner action — workers clock themselves via /api/worker/clock)
router.post("/", requireOwner, async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const workerId = Number(req.body.workerId);
    // Kenya's day, not the server's. The server runs UTC and Kenya is UTC+3, so
    // `toISOString()` filed a 00:30 clock-in under yesterday and
    // `toTimeString()` recorded the time three hours early — every hour of every
    // day. See lib/farm-day.ts.
    const today = farmDayStart();
    const now = farmTime();

    const allToday = await prisma.attendance.findMany({
      where: { workerId, farmId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const existing = allToday.find((r) => isFarmToday(r.date));

    if (existing) {
      // Already clocked in today — this is a clock out
      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: { checkOut: now, status: "present" },
      });
      return res.json(updated);
    }

    // New clock in
    const result = await prisma.attendance.create({
      data: {
        workerId,
        farmId,
        date: today,
        checkIn: now,
        status: "present",
        notes: req.body.notes || null,
      },
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PATCH /api/attendance/:id — update status or notes (owner only)
router.patch("/:id", requireOwner, async (req: Request, res: Response) => {
  try {
    const result = await prisma.attendance.update({
      where: { id: Number(req.params.id) },
      data: { ...req.body },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/attendance/:id (owner only)
router.delete("/:id", requireOwner, async (req: Request, res: Response) => {
  try {
    await prisma.attendance.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
