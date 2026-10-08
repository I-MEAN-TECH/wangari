import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { generateWorkerPin } from "../lib/farm-code.js";
import { hashPin } from "../lib/pin.js";

// Normalize a 4-digit PIN: strip non-digits, pad/trim to exactly 4.
function normalizePin(pin: any): string | null {
  if (pin === undefined || pin === null || pin === "") return null;
  const digits = String(pin).replace(/\D/g, "");
  return digits.slice(0, 4).padStart(4, "0");
}

const router = Router();
router.use(authMiddleware, requireFarm);

// GET /api/workers
router.get("/", async (req: Request, res: Response) => {
  try {
    const data = await prisma.worker.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { name: "asc" },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/workers
router.post("/", async (req: Request, res: Response) => {
  try {
    const pin = normalizePin(req.body.pin) || generateWorkerPin();
    // Return the plaintext PIN exactly once — the owner needs it to hand to
    // the worker. The DB stores only the bcrypt hash.
    const result = await prisma.worker.create({
      data: {
        farmId: req.user!.farmId!,
        name: req.body.name,
        phone: req.body.phone || null,
        role: req.body.role || null,
        dailyWage: req.body.dailyWage ? Number(req.body.dailyWage) : null,
        pin: await hashPin(pin),
        createdBy: req.user!.userId,
      },
    });
    res.status(201).json({ ...result, pin });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// PATCH /api/workers/:id — update worker
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    // Whitelist fields (no mass assignment of farmId/createdBy) + scope to this farm.
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.role !== undefined) data.role = req.body.role;
    if (req.body.phone !== undefined) data.phone = req.body.phone;
    if (req.body.status !== undefined) data.status = req.body.status;
    if (req.body.dailyWage !== undefined) data.dailyWage = Number(req.body.dailyWage);
    let newPlainPin: string | null = null;
    if (req.body.pin !== undefined) {
      newPlainPin = normalizePin(req.body.pin) || generateWorkerPin();
      data.pin = await hashPin(newPlainPin);
      data.tokenVersion = { increment: 1 }; // old PIN's sessions die
    }

    const updated = await prisma.worker.updateMany({ where: { id, farmId: req.user!.farmId! }, data });
    if (updated.count === 0) return res.status(404).json({ error: "Worker not found" });
    const result = await prisma.worker.findFirst({ where: { id, farmId: req.user!.farmId! } });
    // Hand the new plaintext PIN back once when it was (re)generated.
    res.json(newPlainPin ? { ...result, pin: newPlainPin } : result);
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/workers/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.worker.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
