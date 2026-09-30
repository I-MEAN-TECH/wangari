import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireOwner);

const COMMODITIES = ["milk", "coffee_cherry", "maize", "other"];

/**
 * Species → delivery commodity mapping. Each entry knows:
 *  - the delivery commodity value it maps to
 *  - the natural selling unit for that product
 *  - an optional tray conversion for eggs (30 eggs = 1 tray in Kenya)
 *  - an icon id the frontend renders
 */
const SPECIES_COMMODITY: Record<string, { commodity: string; unit: string; icon: string; productLabel: string }> = {
  layers:      { commodity: "eggs", unit: "trays", icon: "egg", productLabel: "Eggs" },
  kienyeji:    { commodity: "eggs", unit: "trays", icon: "egg", productLabel: "Eggs" },
  broilers:    { commodity: "live_birds", unit: "birds", icon: "bird", productLabel: "Live birds" },
  cattle_dairy:{ commodity: "milk", unit: "litres", icon: "milk", productLabel: "Milk" },
  cattle_beef: { commodity: "beef", unit: "kg", icon: "beef", productLabel: "Beef (dressed)" },
  goats:       { commodity: "goat_meat", unit: "kg", icon: "beef", productLabel: "Goat meat (dressed)" },
  sheep:       { commodity: "mutton", unit: "kg", icon: "beef", productLabel: "Mutton (dressed)" },
  pigs:        { commodity: "pork", unit: "kg", icon: "beef", productLabel: "Pork (dressed)" },
  rabbits:     { commodity: "rabbit_meat", unit: "kg", icon: "beef", productLabel: "Rabbit meat" },
  fish:        { commodity: "fish", unit: "kg", icon: "droplets", productLabel: "Fish" },
  bees:        { commodity: "honey", unit: "kg", icon: "flower", productLabel: "Honey" },
};

// Crops → delivery commodity by cropType keyword (substring match on lowercase).
const CROP_COMMODITY: { match: string[]; commodity: string; unit: string; icon: string; productLabel: string }[] = [
  { match: ["maize"], commodity: "maize", unit: "kg", icon: "wheat", productLabel: "Maize" },
  { match: ["coffee"], commodity: "coffee_cherry", unit: "kg", icon: "leaf", productLabel: "Coffee cherry" },
  { match: ["bean"], commodity: "beans", unit: "kg", icon: "leaf", productLabel: "Beans" },
  { match: ["tomato"], commodity: "tomatoes", unit: "kg", icon: "leaf", productLabel: "Tomatoes" },
  { match: ["kale", "sukuma"], commodity: "kale", unit: "kg", icon: "leaf", productLabel: "Sukuma wiki" },
  { match: ["onion"], commodity: "onions", unit: "kg", icon: "leaf", productLabel: "Onions" },
  { match: ["potato", "irish"], commodity: "potatoes", unit: "kg", icon: "leaf", productLabel: "Irish potatoes" },
  { match: ["cabbage"], commodity: "cabbage", unit: "heads", icon: "leaf", productLabel: "Cabbage" },
  { match: ["watermelon", "melon"], commodity: "watermelon", unit: "kg", icon: "leaf", productLabel: "Watermelon" },
  { match: ["avocado"], commodity: "avocado", unit: "kg", icon: "leaf", productLabel: "Avocado" },
  { match: ["mango"], commodity: "mango", unit: "kg", icon: "leaf", productLabel: "Mango" },
];

export const EGGS_PER_TRAY = 30;

// Canonical unit per commodity — used to default the unit when the client
// doesn't send one, so "eggs" always lands as trays and milk as litres.
const UNIT_BY_COMMODITY: Record<string, string> = {
  milk: "litres",
  eggs: "trays",
  live_birds: "birds",
  beef: "kg",
  goat_meat: "kg",
  mutton: "kg",
  pork: "kg",
  rabbit_meat: "kg",
  fish: "kg",
  honey: "kg",
  maize: "kg",
  coffee_cherry: "kg",
  beans: "kg",
  tomatoes: "kg",
  kale: "kg",
  onions: "kg",
  potatoes: "kg",
  cabbage: "heads",
  watermelon: "kg",
  avocado: "kg",
  mango: "kg",
  other: "kg",
};

// GET /api/deliveries/suggestions — what THIS farm actually produces, ranked
// animals first then crops, each with the right selling unit. The form uses
// this instead of the hard-coded 4-commodity list.
router.get("/suggestions", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const [flocks, crops] = await Promise.all([
      prisma.flock.findMany({ where: { farmId, status: "active" }, select: { name: true, type: true, category: true, currentCount: true } }),
      prisma.crop.findMany({ where: { farmId, status: "active" }, select: { name: true, cropType: true } }),
    ]);

    const seen = new Set<string>();
    const suggestions: { commodity: string; label: string; unit: string; icon: string; source: string }[] = [];

    // Animals first
    for (const f of flocks) {
      const map = SPECIES_COMMODITY[f.type || ""];
      if (!map || seen.has(map.commodity)) continue;
      seen.add(map.commodity);
      suggestions.push({ commodity: map.commodity, label: map.productLabel, unit: map.unit, icon: map.icon, source: f.name });
    }
    // Then crops
    for (const c of crops) {
      const ct = (c.cropType || "").toLowerCase();
      const map = CROP_COMMODITY.find((m) => m.match.some((k) => ct.includes(k)));
      if (!map || seen.has(map.commodity)) continue;
      seen.add(map.commodity);
      suggestions.push({ commodity: map.commodity, label: map.productLabel, unit: map.unit, icon: map.icon, source: c.name });
    }
    // Always allow custom/free-text + the classics as fallback
    const fallbacks = [
      { commodity: "milk", label: "Milk", unit: "litres", icon: "milk", source: null },
      { commodity: "eggs", label: "Eggs", unit: "trays", icon: "egg", source: null },
      { commodity: "maize", label: "Maize", unit: "kg", icon: "wheat", source: null },
      { commodity: "other", label: "Other produce", unit: "kg", icon: "truck", source: null },
    ];
    for (const fb of fallbacks) {
      if (!suggestions.some((s) => s.commodity === fb.commodity)) suggestions.push(fb as any);
    }

    res.json({ suggestions, eggsPerTray: EGGS_PER_TRAY });
  } catch (error) {
    console.error("Delivery suggestions error:", error);
    res.status(500).json({ error: "Failed to load suggestions" });
  }
});

// GET /api/deliveries?commodity=milk — recent deliveries
router.get("/", async (req: Request, res: Response) => {
  try {
    const commodity = req.query.commodity as string | undefined;
    const data = await prisma.delivery.findMany({
      where: { farmId: req.user!.farmId!, ...(commodity ? { commodity } : {}) },
      orderBy: { date: "desc" },
      take: 60,
      include: { deductions: true },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch deliveries" });
  }
});

// POST /api/deliveries — log a delivery (the daily 30-second action)
router.post("/", async (req: Request, res: Response) => {
  try {
    const { date, commodity, quantity, unit, buyer, receiptRef, unitPrice, notes, deductions } = req.body;
    // Accept any commodity — the list is now dynamic (driven by the farm's
    // real flocks/crops via /suggestions). Validate shape instead of a
    // hard-coded list, and default the unit by commodity family.
    if (!quantity || !buyer || typeof commodity !== "string" || !commodity.trim()) {
      return res.status(400).json({ error: "quantity, buyer and a commodity are required" });
    }
    const qty = Number(quantity);
    const price = unitPrice != null ? Number(unitPrice) : null;
    const expectedPay = price != null ? qty * price : null;

    const { nextDocCode } = await import("../lib/doc-codes.js");
    const docCode = await prisma.$transaction((tx: any) => nextDocCode(tx, req.user!.farmId!, "delivery"));

    const delivery = await prisma.delivery.create({
      data: {
        farmId: req.user!.farmId!,
        docCode,
        date: date ? new Date(date) : new Date(),
        commodity,
        quantity: qty,
        unit: unit || (UNIT_BY_COMMODITY[commodity] ?? "kg"),
        buyer,
        receiptRef: receiptRef || null,
        unitPrice: price,
        expectedPay,
        createdBy: req.user!.userId,
        deductions: {
          create: (Array.isArray(deductions) ? deductions : [])
            .filter((d: any) => d && d.label && Number(d.amount) > 0)
            .map((d: any) => ({ label: String(d.label), amount: Number(d.amount) })),
        },
      },
      include: { deductions: true },
    });
    res.status(201).json(delivery);
  } catch (error) {
    console.error("Create delivery error:", error);
    res.status(500).json({ error: "Failed to record delivery" });
  }
});

// PATCH /api/deliveries/:id — mark paid / disputed / edit price
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.delivery.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const data: Record<string, any> = {};
    if (req.body.status && ["pending", "paid", "disputed"].includes(req.body.status)) data.status = req.body.status;
    if (req.body.paidAmount !== undefined) data.paidAmount = Number(req.body.paidAmount);
    if (req.body.unitPrice !== undefined) {
      const price = Number(req.body.unitPrice);
      data.unitPrice = price;
      data.expectedPay = Number(existing.quantity) * price;
    }
    if (req.body.notes !== undefined) data.notes = req.body.notes || null;

    const updated = await prisma.delivery.update({ where: { id: existing.id }, data, include: { deductions: true } });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update delivery" });
  }
});

// DELETE /api/deliveries/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.delivery.deleteMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete delivery" });
  }
});

// GET /api/deliveries/statement?month=2026-09 — the payout statement
// Gross deliveries − deductions − input expenses (from farm finance records)
// = the net the farmer should expect. This is the dispute-proof number.
router.get("/statement", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month as string)
      ? req.query.month as string
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const farmId = req.user!.farmId!;

    const [deliveries, transactions] = await Promise.all([
      prisma.delivery.findMany({
        where: { farmId, date: { gte: start, lt: end } },
        include: { deductions: true },
        orderBy: { date: "asc" },
      }),
      prisma.transaction.findMany({
        where: { farmId, type: "expense", date: { gte: start, lt: end } },
        select: { category: true, amount: true, description: true, date: true },
      }),
    ]);

    const gross = deliveries.reduce((s, d) => s + Number(d.expectedPay ?? 0), 0);
    const deductionTotal = deliveries.reduce((s, d) => s + d.deductions.reduce((x, dd) => x + Number(dd.amount), 0), 0);
    const inputExpenses = transactions.reduce((s, t) => s + Number(t.amount), 0);
    const paid = deliveries.reduce((s, d) => s + Number(d.paidAmount ?? 0), 0);

    // Per-commodity breakdown so mixed farms see each line
    const byCommodity: Record<string, { quantity: number; gross: number; deliveries: number }> = {};
    for (const d of deliveries) {
      const c = (byCommodity[d.commodity] ??= { quantity: 0, gross: 0, deliveries: 0 });
      c.quantity += Number(d.quantity);
      c.gross += Number(d.expectedPay ?? 0);
      c.deliveries += 1;
    }

    res.json({
      month,
      deliveries: deliveries.length,
      gross,
      deductions: deductionTotal,
      inputExpenses,
      net: gross - deductionTotal - inputExpenses,
      paid,
      outstanding: gross - deductionTotal - paid,
      byCommodity,
      deliveryList: deliveries.map((d) => ({
        id: d.id, date: d.date, commodity: d.commodity, quantity: Number(d.quantity),
        unit: d.unit, buyer: d.buyer, expectedPay: d.expectedPay ? Number(d.expectedPay) : null,
        status: d.status,
        deductions: d.deductions.map((dd) => ({ label: dd.label, amount: Number(dd.amount) })),
      })),
      expenseList: transactions.map((t) => ({ category: t.category, amount: Number(t.amount), description: t.description, date: t.date })),
    });
  } catch (error) {
    console.error("Statement error:", error);
    res.status(500).json({ error: "Failed to build statement" });
  }
});

export default router;
