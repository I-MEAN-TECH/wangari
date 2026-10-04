import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware, JWT_SECRET } from "../middleware/auth.js";
import jwt from "jsonwebtoken";
import { hashPin, verifyPin } from "../lib/pin.js";
import { requireFarm } from "../middleware/requireOwner.js";

const router = Router();

const db = prisma as any;

// ─── POST /api/worker/login — Worker PIN & Farm Code login ───
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { farmCode, phone, pin } = req.body;
    if (!pin) {
      return res.status(400).json({ error: "4-digit PIN is required" });
    }

    let targetFarmId: number | null = null;

    // 1. If farmCode provided, lookup farm
    if (farmCode) {
      const cleanCode = String(farmCode).trim().toUpperCase();
      const farm = await db.farm.findFirst({
        where: {
          OR: [
            { code: cleanCode },
            { name: { contains: cleanCode, mode: "insensitive" } },
          ],
        },
      });
      if (farm) {
        targetFarmId = farm.id;
      }
    }

    // 2. Lookup candidate workers, then verify PIN against the (bcrypt) hash.
    // PINs are hashed at rest, so matching happens in code, not SQL.
    const plainPin = String(pin).trim();
    let worker: any = null;
    if (targetFarmId) {
      const candidates = await db.worker.findMany({
        where: { farmId: targetFarmId, status: "active", pin: { not: null } },
        include: { farm: true },
      });
      for (const candidate of candidates) {
        if (await verifyPin(plainPin, candidate.pin)) { worker = candidate; break; }
      }
    }

    // Fallback: search by phone number if farmCode didn't yield result
    if (!worker && phone) {
      const cleanPhone = phone.replace(/[\s\-\+\(\)]/g, "");
      const candidates = await db.worker.findMany({
        where: { status: "active", phone: { contains: cleanPhone.slice(-9) }, pin: { not: null } },
        include: { farm: true },
      });
      for (const candidate of candidates) {
        if (await verifyPin(plainPin, candidate.pin)) { worker = candidate; break; }
      }
    }

    if (!worker) {
      return res.status(401).json({ error: "Incorrect Farm Code, Phone, or 4-digit PIN" });
    }

    // Generate worker JWT token (tokenVersion enables server-side revocation)
    const token = jwt.sign(
      {
        workerId: worker.id,
        farmId: worker.farmId,
        role: "worker",
        name: worker.name,
        tv: worker.tokenVersion || 0,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({
      token,
      worker: {
        id: worker.id,
        name: worker.name,
        phone: worker.phone,
        role: worker.role || "Farm Worker",
        farmId: worker.farmId,
        farmName: worker.farm.name,
        farmCode: worker.farm.code || `WANGARI-${worker.farm.id}`,
      },
    });
  } catch (error) {
    console.error("Worker login error:", error);
    return res.status(500).json({ error: "Worker login failed" });
  }
});

// All routes below require auth token
// /login is public and stays above this. Everything after it is farm-scoped:
// a session with no farmId would turn `where: { farmId }` into an unscoped
// query and read or write every farm's rows.
router.use(authMiddleware, requireFarm);

// ─── GET /api/worker/tasks — Today's tasks ────────────────
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId || (req.user as any).farmId;
    const workerId = (req.user as any).workerId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tasks = await db.workerTask.findMany({
      where: {
        farmId,
        OR: [
          { workerId: workerId || undefined },
          { workerId: null },
        ],
      },
      orderBy: [
        { isCompleted: "asc" },
        { createdAt: "desc" },
      ],
      take: 20,
    });

    return res.json(tasks);
  } catch (error) {
    console.error("Get worker tasks error:", error);
    return res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// ─── POST /api/worker/tasks — Create a task (Farm owner or manager) ───
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const { title, description, category, workerId, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Task title is required" });
    }

    const task = await db.workerTask.create({
      data: {
        farmId,
        workerId: workerId ? Number(workerId) : null,
        title,
        description: description || null,
        category: category || "general",
        dueDate: dueDate ? new Date(dueDate) : new Date(),
      },
    });

    return res.json(task);
  } catch (error) {
    console.error("Create task error:", error);
    return res.status(500).json({ error: "Failed to create task" });
  }
});

// ─── POST /api/worker/tasks/:id/complete — Toggle task done ───
router.post("/tasks/:id/complete", async (req: Request, res: Response) => {
  try {
    const taskId = Number(req.params.id);
    const farmId = req.user!.farmId!;
    const workerId = (req.user as any).workerId || null;

    const task = await db.workerTask.findFirst({
      where: { id: taskId, farmId },
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const updated = await db.workerTask.update({
      where: { id: taskId },
      data: {
        isCompleted: !task.isCompleted,
        completedAt: !task.isCompleted ? new Date() : null,
      },
    });

    // Also record worker log if completing
    if (!task.isCompleted && workerId) {
      await db.workerLog.create({
        data: {
          farmId,
          workerId,
          type: "task_done",
          quantity: 1,
          unit: "task",
          notes: `Completed task: ${task.title}`,
        },
      }).catch(() => {});
    }

    return res.json(updated);
  } catch (error) {
    console.error("Complete task error:", error);
    return res.status(500).json({ error: "Failed to update task" });
  }
});

// ─── POST /api/worker/log-output — Fast numeric logger ─────
router.post("/log-output", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const workerId = (req.user as any).workerId || null;
    const { type, quantity, unit, flockId, notes } = req.body;

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: "Valid positive quantity is required" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Record in WorkerLog
    let logRecord: any = null;
    if (workerId) {
      logRecord = await db.workerLog.create({
        data: {
          farmId,
          workerId,
          type, // 'eggs', 'milk', 'feed', 'mortality'
          quantity: qty,
          unit: unit || "units",
          notes: notes || null,
        },
      });
    }

    // 2. Automatically sync with DailyProduction or Inventory for Farm Owner
    if (flockId) {
      const targetFlock = await db.flock.findFirst({
        where: { id: Number(flockId), farmId },
      });

      if (targetFlock) {
        if (type === "eggs") {
          await db.dailyProduction.upsert({
            where: { flockId_date: { flockId: targetFlock.id, date: today } },
            create: {
              farmId,
              flockId: targetFlock.id,
              date: today,
              eggsCollected: qty,
            },
            update: {
              eggsCollected: { increment: qty },
            },
          });
        } else if (type === "milk") {
          await db.dailyProduction.upsert({
            where: { flockId_date: { flockId: targetFlock.id, date: today } },
            create: {
              farmId,
              flockId: targetFlock.id,
              date: today,
              milkCollected: qty,
            },
            update: {
              milkCollected: { increment: qty },
            },
          });
        } else if (type === "feed") {
          await db.dailyProduction.upsert({
            where: { flockId_date: { flockId: targetFlock.id, date: today } },
            create: {
              farmId,
              flockId: targetFlock.id,
              date: today,
              feedUsed: qty,
            },
            update: {
              feedUsed: { increment: qty },
            },
          });
        } else if (type === "mortality") {
          await db.dailyProduction.upsert({
            where: { flockId_date: { flockId: targetFlock.id, date: today } },
            create: {
              farmId,
              flockId: targetFlock.id,
              date: today,
              mortality: qty,
            },
            update: {
              mortality: { increment: qty },
            },
          });

          // Decrement flock current count
          await db.flock.update({
            where: { id: targetFlock.id },
            data: {
              currentCount: { decrement: qty },
              mortality: { increment: qty },
            },
          });
        }
      }
    }

    return res.json({
      success: true,
      message: "Log saved successfully",
      logRecord,
    });
  } catch (error) {
    console.error("Worker log output error:", error);
    return res.status(500).json({ error: "Failed to record log" });
  }
});

// ─── GET /api/worker/me — own profile ───
router.get("/me", async (req: Request, res: Response) => {
  try {
    const workerId = (req.user as any).workerId;
    if (!workerId) return res.status(403).json({ error: "Worker token required" });

    const worker = await db.worker.findUnique({
      where: { id: workerId },
      select: { id: true, name: true, phone: true, role: true, status: true, farm: { select: { name: true, code: true } } },
    });
    if (!worker || worker.status !== "active") {
      return res.status(401).json({ error: "Worker not found or inactive" });
    }
    return res.json({
      id: worker.id,
      name: worker.name,
      phone: worker.phone,
      role: worker.role || "Farm Worker",
      farmName: worker.farm?.name || null,
      farmCode: worker.farm?.code || null,
    });
  } catch (error) {
    console.error("Get worker profile error:", error);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─── PATCH /api/worker/me — edit own name/phone (NOT role/wage/status) ───
router.patch("/me", async (req: Request, res: Response) => {
  try {
    const workerId = (req.user as any).workerId;
    if (!workerId) return res.status(403).json({ error: "Worker token required" });

    const data: Record<string, string | null> = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 80) return res.status(400).json({ error: "Valid name required" });
      data.name = name;
    }
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).replace(/[\s\-\(\)]/g, "");
      if (phone && !/^\+?\d{9,15}$/.test(phone)) {
        return res.status(400).json({ error: "Phone must be 9–15 digits" });
      }
      data.phone = phone || null;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await db.worker.update({
      where: { id: workerId },
      data,
      select: { id: true, name: true, phone: true, role: true },
    });
    return res.json(updated);
  } catch (error) {
    console.error("Update worker profile error:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// ─── POST /api/worker/change-pin — worker changes own PIN ───
router.post("/change-pin", async (req: Request, res: Response) => {
  try {
    const workerId = (req.user as any).workerId;
    if (!workerId) return res.status(403).json({ error: "Worker token required" });

    const { currentPin, newPin } = req.body;
    const newDigits = String(newPin ?? "").replace(/\D/g, "");
    if (newDigits.length !== 4) {
      return res.status(400).json({ error: "New PIN must be exactly 4 digits" });
    }

    const worker = await db.worker.findUnique({ where: { id: workerId }, select: { pin: true } });
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const current = String(currentPin ?? "").trim();
    if (!(await verifyPin(current, worker.pin))) {
      return res.status(401).json({ error: "Current PIN is incorrect" });
    }

    // Hash the new PIN and bump tokenVersion so all other sessions die.
    await db.worker.update({
      where: { id: workerId },
      data: { pin: await hashPin(newDigits), tokenVersion: { increment: 1 } },
    });
    return res.json({ success: true, message: "PIN changed successfully" });
  } catch (error) {
    console.error("Change PIN error:", error);
    return res.status(500).json({ error: "Failed to change PIN" });
  }
});

// ─── GET /api/worker/my-attendance — Worker's own attendance (this week) ───
router.get("/my-attendance", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const workerId = (req.user as any).workerId;
    if (!workerId) return res.json([]);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const records = await db.attendance.findMany({
      where: { farmId, workerId, date: { gte: weekAgo } },
      orderBy: { date: "desc" },
      take: 30,
    });

    return res.json(records);
  } catch (error) {
    console.error("Get my attendance error:", error);
    return res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

// ─── POST /api/worker/clock — Worker clocks themselves in/out ───
router.post("/clock", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const workerId = (req.user as any).workerId;
    if (!workerId) {
      return res.status(403).json({ error: "Only workers can clock themselves" });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const today = new Date(todayStr + "T00:00:00");
    const now = new Date().toTimeString().slice(0, 5);

    // Reuse the same logic as the owner endpoint: existing record today = clock out
    const allToday = await db.attendance.findMany({
      where: { workerId, farmId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const existing = allToday.find((r: any) => {
      const recDate = new Date(r.date).toISOString().split("T")[0];
      return recDate === todayStr;
    });

    if (existing) {
      if (existing.checkOut) {
        return res.status(400).json({ error: "Already clocked out today" });
      }
      const updated = await db.attendance.update({
        where: { id: existing.id },
        data: { checkOut: now, status: "present" },
      });
      return res.json({ action: "out", record: updated });
    }

    const created = await db.attendance.create({
      data: {
        workerId,
        farmId,
        date: today,
        checkIn: now,
        status: "present",
      },
    });
    return res.status(201).json({ action: "in", record: created });
  } catch (error) {
    console.error("Worker clock error:", error);
    return res.status(500).json({ error: "Failed to record clock in/out" });
  }
});

// ─── GET /api/worker/my-activity — Worker's logs for today ───
router.get("/my-activity", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const workerId = (req.user as any).workerId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await db.workerLog.findMany({
      where: {
        farmId,
        workerId: workerId || undefined,
        createdAt: { gte: today },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(logs);
  } catch (error) {
    console.error("Get worker activity error:", error);
    return res.status(500).json({ error: "Failed to fetch activity" });
  }
});

export default router;
