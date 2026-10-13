import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { payoutSummary, type DeliveryRow } from "../lib/delivery-quality.js";
import { byBuyer as realisedByBuyer, byGrade, qualityVsPrice, realisedPrice, type PricedDelivery } from "../lib/price-realised.js";
import { activeWithdrawals, withdrawalAdvice, type WithdrawalRecord } from "../lib/withdrawal.js";

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

/**
 * GET /api/deliveries/withdrawal-check?commodity=milk
 *
 * The one question the delivery form has to ask before it lets a farmer sell
 * milk from a treated cow: is anything still inside its withdrawal window?
 *
 * Deliberately its own tiny endpoint rather than part of the form's load: this is
 * checked when the commodity is chosen, and the answer can change between opening
 * the form and saving it.
 *
 * The lib returns "no advice" for anything that is not milk or eggs — a maize
 * delivery has no withdrawal rule, and a generic warning would train the farmer
 * to ignore the one that matters.
 */
router.get("/withdrawal-check", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const commodity = typeof req.query.commodity === "string" ? req.query.commodity : "milk";
    const now = new Date();

    const rows = await prisma.healthRecord.findMany({
      where: { farmId, observedAt: { gte: new Date(now.getTime() - 60 * 86400000) } },
      orderBy: { observedAt: "desc" },
      select: {
        id: true, animalId: true, flockId: true, condition: true, action: true,
        observedAt: true, withdrawalUntil: true, withdrawalNote: true,
        animal: { select: { tagNumber: true } },
        flock: { select: { name: true } },
      },
    });

    const records: WithdrawalRecord[] = rows.map((r) => ({
      id: r.id,
      animalId: r.animalId,
      flockId: r.flockId,
      condition: r.condition,
      action: r.action,
      observedAt: new Date(r.observedAt),
      withdrawalUntil: r.withdrawalUntil ? new Date(r.withdrawalUntil) : null,
      withdrawalNote: r.withdrawalNote,
    }));
    const label = new Map(rows.map((r) => [r.id, r.animal?.tagNumber ?? r.flock?.name ?? null]));

    const advice = withdrawalAdvice(records, commodity, now);
    res.json({
      commodity,
      advice: {
        ...advice,
        animals: advice.animals.map((a) => {
          const record = records.find((r) => r.animalId === a.animalId);
          return { ...a, label: record ? label.get(record.id) ?? null : null };
        }),
      },
      // Which records the answer was built from, so a farmer can check it rather
      // than take our word for it.
      activeCount: activeWithdrawals(records, now).length,
    });
  } catch (error) {
    console.error("Withdrawal check error:", error);
    res.status(500).json({ error: "Failed to check withdrawal windows" });
  }
});

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

    // Milk-quality parameters arrive exactly as the slip shows them and are
    // stored as given — we never grade, a co-op's bands are its own terms.
    // An added-water percentage is stored even though it lowers the payable
    // volume: the farmer's dispute needs the co-op's own figure recorded.
    const quality = {
      fatPct: req.body.fatPct != null && isFinite(Number(req.body.fatPct)) ? Number(req.body.fatPct) : null,
      snfPct: req.body.snfPct != null && isFinite(Number(req.body.snfPct)) ? Number(req.body.snfPct) : null,
      density: req.body.density != null && isFinite(Number(req.body.density)) ? Number(req.body.density) : null,
      addedWaterPct: req.body.addedWaterPct != null && isFinite(Number(req.body.addedWaterPct)) ? Number(req.body.addedWaterPct) : null,
      tpc: req.body.tpc != null && isFinite(Number(req.body.tpc)) ? Math.round(Number(req.body.tpc)) : null,
      gradedBy: typeof req.body.gradedBy === "string" && req.body.gradedBy.trim() ? req.body.gradedBy.trim() : null,
    };
    // The promised payment date starts the arrears clock. No date, no clock,
    // and we never let the UI paint a delivery "late" on a date never given.
    let payBy: Date | null = null;
    if (typeof req.body.payBy === "string" && req.body.payBy.trim()) {
      payBy = new Date(req.body.payBy);
      if (isNaN(payBy.getTime())) {
        return res.status(400).json({ error: "payBy is not a valid date" });
      }
    }

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
        ...quality,
        payBy,
        createdBy: req.user!.userId,
        deductions: {
          create: (Array.isArray(deductions) ? deductions : [])
            .filter((d: any) => d && d.label && Number(d.amount) > 0)
            .map((d: any) => ({
              label: String(d.label),
              amount: Number(d.amount),
              // Who the deduction is FOR — co-op vs agrovet vs the farmer's
              // own loan. The statement groups on this distinction.
              creditor: typeof d.creditor === "string" && d.creditor.trim() ? d.creditor.trim() : null,
              // When the co-op is collecting a loan repayment at source, this
              // tags the deduction to the FarmLoan it pays down. The farm-loans
              // route reads these to show what was repaid via deductions.
              farmLoanId: d.farmLoanId != null && Number.isFinite(Number(d.farmLoanId)) ? Number(d.farmLoanId) : null,
            })),
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
    // Quality fields are editable — a slip arrives after the delivery often.
    for (const k of ["fatPct", "snfPct", "density", "addedWaterPct"] as const) {
      if (req.body[k] !== undefined) data[k] = req.body[k] != null && isFinite(Number(req.body[k])) ? Number(req.body[k]) : null;
    }
    if (req.body.tpc !== undefined) data.tpc = req.body.tpc != null && isFinite(Number(req.body.tpc)) ? Math.round(Number(req.body.tpc)) : null;
    if (req.body.gradedBy !== undefined) data.gradedBy = typeof req.body.gradedBy === "string" && req.body.gradedBy.trim() ? req.body.gradedBy.trim() : null;
    if (req.body.payBy !== undefined) {
      if (req.body.payBy === null || req.body.payBy === "") data.payBy = null;
      else {
        const d = new Date(req.body.payBy);
        if (isNaN(d.getTime())) return res.status(400).json({ error: "payBy is not a valid date" });
        data.payBy = d;
      }
    }

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

    const [deliveries, transactions, harvests] = await Promise.all([
      prisma.delivery.findMany({
        where: { farmId, date: { gte: start, lt: end } },
        include: { deductions: true },
        orderBy: { date: "asc" },
      }),
      prisma.transaction.findMany({
        where: { farmId, type: "expense", date: { gte: start, lt: end } },
        select: { category: true, amount: true, description: true, date: true },
      }),
      // B7: grade lives on the HARVEST, not on the lorry ticket — coffee is graded
      // on the batch, so a realised price per grade has to come from here.
      prisma.cropHarvest.findMany({
        where: { farmId, date: { gte: start, lt: end } },
        select: { quantityKg: true, salePrice: true, quality: true, crop: { select: { cropType: true } } },
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

    // PER-BUYER: this is the number that actually settles a dispute. A co-op
    // will argue about "you were delivered to", not about a total across three
    // buyers. "Githunguri owes me KES 45,000" is one line and one question.
    const byBuyer: Record<string, { deliveries: number; quantity: number; gross: number; deductions: number; paid: number; outstanding: number }> = {};
    for (const d of deliveries) {
      const key = d.buyer || "Unknown";
      const c = (byBuyer[key] ??= { deliveries: 0, quantity: 0, gross: 0, deductions: 0, paid: 0, outstanding: 0 });
      const ded = d.deductions.reduce((x, dd) => x + Number(dd.amount), 0);
      c.deliveries += 1;
      c.quantity += Number(d.quantity);
      c.gross += Number(d.expectedPay ?? 0);
      c.deductions += ded;
      c.paid += Number(d.paidAmount ?? 0);
      c.outstanding += Number(d.expectedPay ?? 0) - ded - Number(d.paidAmount ?? 0);
    }

    // ALL-TIME outstanding: a farmer owed over several months needs the running
    // total, not a single month. This is the figure they take to the co-op.
    const allTime = await prisma.delivery.findMany({
      where: { farmId },
      // Prisma allows EITHER include OR select, never both.
      select: {
        id: true,
        date: true,
        commodity: true,
        unit: true,
        buyer: true,
        fatPct: true,
        snfPct: true,
        status: true,
        expectedPay: true,
        paidAmount: true,
        payBy: true,
        unitPrice: true,
        quantity: true,
        deductions: { select: { amount: true, creditor: true, label: true } },
      },
    });

    // The realised-price view (B7) and the butterfat comparison (A7) both run on
    // the farmer's whole history, not one month: three paired readings is the
    // minimum that says anything, and a single month of a smallholder's deliveries
    // often has fewer.
    const priced: PricedDelivery[] = allTime.map((d: any) => ({
      id: d.id,
      date: new Date(d.date),
      commodity: d.commodity,
      quantity: Number(d.quantity),
      unit: d.unit,
      unitPrice: d.unitPrice != null ? Number(d.unitPrice) : null,
      buyer: d.buyer || "Unknown",
      fatPct: d.fatPct != null ? Number(d.fatPct) : null,
      snfPct: d.snfPct != null ? Number(d.snfPct) : null,
      expectedPay: d.expectedPay != null ? Number(d.expectedPay) : null,
      paidAmount: d.paidAmount != null ? Number(d.paidAmount) : null,
      status: d.status,
    }));
    // Arrears maths lives in the pure lib, tested without a database —
    // the route's job is only to fetch rows in the shape the lib declares.
    const allRows: DeliveryRow[] = allTime.map((d: any) => ({
      commodity: "any",
      quantity: Number(d.quantity),
      unit: "any",
      unitPrice: d.unitPrice != null ? Number(d.unitPrice) : null,
      expectedPay: d.expectedPay != null ? Number(d.expectedPay) : null,
      paidAmount: d.paidAmount != null ? Number(d.paidAmount) : null,
      date: new Date(),
      payBy: d.payBy ? new Date(d.payBy) : null,
      deductions: d.deductions.map((dd: any) => ({
        label: dd.label,
        amount: Number(dd.amount),
        creditor: dd.creditor ?? null,
      })),
    }));
    const arrearsSummary = payoutSummary(allRows);
    const allTimeOutstanding = arrearsSummary.outstanding;
    const unpaidDeliveries = arrearsSummary.lines.filter((l) => l.outstanding > 0.01).length;

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
      // The dispute surface: who owes what, and the running total across all
      // time. This is what the farmer shows the cooperative.
      byBuyer,
      allTimeOutstanding,
      unpaidDeliveries,
      // Arrears, now with a clock: which deliveries slipped past the date the
      // buyer gave, for how much, and how long the oldest has waited.
      arrears: {
        total: arrearsSummary.arrearsTotal,
        count: arrearsSummary.arrearsCount,
        oldestDays: arrearsSummary.oldestArrearsDays,
      },
      // Deductions grouped by who they were for — "what the co-op kept" vs
      // "what paid my loan" is exactly the distinction a farmer argues with.
      deductionsByCreditor: arrearsSummary.deductionsByCreditor,
      // B7: what each buyer actually paid per unit, worst-paid first. The weighted
      // average excludes deliveries with no price recorded, and reports how much
      // quantity that left out rather than folding it in at zero.
      realised: priced.length ? realisedPrice(priced) : null,
      priceByBuyer: priced.length ? realisedByBuyer(priced).slice(0, 8) : [],
      // A7: butterfat against the price received, using the farmer's OWN median
      // fat as the split — never a co-op's payment bands, which we are not told.
      qualityVsPrice: priced.length ? qualityVsPrice(priced, "milk") : null,
      // B7: realised price per grade, from the harvests recorded this month.
      priceByGrade: byGrade(
        harvests.map((h: any) => ({
          cropType: h.crop?.cropType ?? "other",
          quality: h.quality ?? null,
          quantityKg: Number(h.quantityKg),
          salePrice: h.salePrice != null ? Number(h.salePrice) : null,
        }))
      ),
      farm: await prisma.farm.findUnique({
        where: { id: farmId },
        select: { name: true, county: true, code: true, owner: { select: { name: true } } },
      }),
      // The per-delivery slip, including the quality the co-op measured and the
      // date they promised to pay by. A statement that shows a deduction but
      // not the butterfat it was argued over is not the document that settles
      // the argument.
      deliveryList: deliveries.map((d) => ({
        id: d.id, date: d.date, commodity: d.commodity, quantity: Number(d.quantity),
        unit: d.unit, buyer: d.buyer, expectedPay: d.expectedPay ? Number(d.expectedPay) : null,
        paidAmount: d.paidAmount != null ? Number(d.paidAmount) : null,
        payBy: d.payBy,
        status: d.status,
        fatPct: d.fatPct != null ? Number(d.fatPct) : null,
        snfPct: d.snfPct != null ? Number(d.snfPct) : null,
        density: d.density != null ? Number(d.density) : null,
        addedWaterPct: d.addedWaterPct != null ? Number(d.addedWaterPct) : null,
        tpc: d.tpc,
        gradedBy: d.gradedBy,
        deductions: d.deductions.map((dd) => ({
          label: dd.label,
          amount: Number(dd.amount),
          creditor: dd.creditor ?? null,
        })),
      })),
      expenseList: transactions.map((t) => ({ category: t.category, amount: Number(t.amount), description: t.description, date: t.date })),
    });
  } catch (error) {
    console.error("Statement error:", error);
    res.status(500).json({ error: "Failed to build statement" });
  }
});

export default router;
