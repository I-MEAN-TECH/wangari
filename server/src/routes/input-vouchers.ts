import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { inputCostLine, subsidySplit, voucherTotals, type VoucherRecord } from "../lib/input-subsidy.js";

/**
 * Fertiliser e-voucher redemption (gap report §2 B5).
 *
 * The KIAMIS export proves eligibility. This records what happened after it, and
 * the ONE money rule it enforces is the reason it exists: **the voucher is never
 * income, and the farmer's cash contribution is the input cost.**
 *
 * So posting a redemption:
 *  - books an EXPENSE for `farmerContribution` only, when it is above zero, so
 *    the crop's real cost stays visible in the ledger;
 *  - books NOTHING for the voucher value, and returns it as `nonCashValue` for
 *    the screen. A subsidy written into the ledger as income would inflate the
 *    farm's revenue with money that never arrived.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toRecord(v: {
  id: number; program: string; dealer: string | null; voucherValue: unknown;
  farmerContribution: unknown; quantityKg: unknown; inputName: string | null;
  redeemedOn: Date; cropId: number | null; plotId: number | null;
}): VoucherRecord {
  return {
    id: v.id,
    program: v.program,
    dealer: v.dealer,
    voucherValue: num(v.voucherValue),
    farmerContribution: num(v.farmerContribution),
    quantityKg: v.quantityKg != null ? num(v.quantityKg) : null,
    inputName: v.inputName,
    redeemedOn: new Date(v.redeemedOn),
    cropId: v.cropId,
    plotId: v.plotId,
  };
}

/**
 * GET /api/input-vouchers — redemptions, what they covered, and what they cost.
 *
 * Crop and plot names are resolved here rather than through a relation, because
 * the voucher rows carry plain ids on purpose (see the schema comment): a
 * redemption has to survive the crop being deleted.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const rows = await prisma.inputVoucher.findMany({
      where: { farmId },
      orderBy: { redeemedOn: "desc" },
      take: 200,
    });

    const cropIds = [...new Set(rows.map((r) => r.cropId).filter((id): id is number => id != null))];
    const plotIds = [...new Set(rows.map((r) => r.plotId).filter((id): id is number => id != null))];
    const [crops, plots] = await Promise.all([
      cropIds.length
        ? prisma.crop.findMany({ where: { id: { in: cropIds }, farmId }, select: { id: true, name: true, cropType: true } })
        : Promise.resolve([]),
      plotIds.length
        ? prisma.plot.findMany({ where: { id: { in: plotIds }, farmId }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    // Explicit tuple casts: the conditional promises above leave the element type
    // widened, and an inferred `any[][]` does not satisfy Map's constructor.
    const cropName = new Map<number, string>(
      (crops as { id: number; name: string }[]).map((c) => [c.id, c.name] as [number, string])
    );
    const plotName = new Map<number, string>(
      (plots as { id: number; name: string }[]).map((p) => [p.id, p.name] as [number, string])
    );

    const records = rows.map(toRecord);
    res.json({
      vouchers: rows.map((r, i) => ({
        ...r,
        split: subsidySplit(records[i]),
        costLine: inputCostLine(records[i]),
        cropName: r.cropId != null ? cropName.get(r.cropId) ?? null : null,
        plotName: r.plotId != null ? plotName.get(r.plotId) ?? null : null,
      })),
      totals: voucherTotals(records),
      // Printed beside the totals so the distinction is impossible to miss.
      basis:
        "A voucher is not income. The cash you paid is the cost of the input; the value the programme covered is shown separately.",
    });
  } catch (error) {
    console.error("Voucher list error:", error);
    res.status(500).json({ error: "Failed to load vouchers" });
  }
});

// POST /api/input-vouchers — record a redemption, and book only the cash paid.
router.post("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const redeemedOn = dateOrNull(req.body?.redeemedOn) ?? new Date();
    const voucherValue = num(req.body?.voucherValue);
    const farmerContribution = num(req.body?.farmerContribution);

    if (voucherValue <= 0 && farmerContribution <= 0) {
      return res.status(400).json({
        error: "Enter the voucher value, what you paid, or both",
        field: "voucherValue",
      });
    }

    const record = await prisma.inputVoucher.create({
      data: {
        farmId,
        program: typeof req.body?.program === "string" && req.body.program.trim() ? req.body.program.trim() : "nfsp",
        dealer: req.body?.dealer?.trim() || null,
        voucherValue,
        farmerContribution,
        quantityKg: req.body?.quantityKg != null && req.body.quantityKg !== "" ? num(req.body.quantityKg) : null,
        inputName: req.body?.inputName?.trim() || null,
        redeemedOn,
        cropId: req.body?.cropId ? Number(req.body.cropId) : null,
        plotId: req.body?.plotId ? Number(req.body.plotId) : null,
        notes: req.body?.notes?.trim() || null,
        createdBy: req.user!.userId ?? null,
      },
    });

    const lib = toRecord(record);
    const line = inputCostLine(lib);

    // The input-cost line. Only the CASH becomes an expense; the subsidy does not,
    // which is the whole point of recording them apart.
    let transactionId: number | null = null;
    if (farmerContribution > 0) {
      const txn = await prisma.transaction.create({
        data: {
          farmId,
          type: "expense",
          category: "inputs",
          description: line.description,
          amount: farmerContribution,
          date: redeemedOn,
          paymentMethod: "cash",
          cropId: lib.cropId ?? null,
          createdBy: req.user!.userId ?? null,
        },
        select: { id: true },
      });
      transactionId = txn.id;
    }

    return res.status(201).json({
      voucher: { ...record, split: subsidySplit(lib), costLine: line },
      // Null when the farmer paid nothing: no money moved, so nothing is booked.
      expenseTransactionId: transactionId,
      bookedAsExpense: farmerContribution > 0,
      nonCashValue: line.nonCashValue,
    });
  } catch (error) {
    console.error("Voucher create error:", error);
    return res.status(500).json({ error: "Failed to record the voucher" });
  }
});

// DELETE /api/input-vouchers/:id
// The expense it booked is left alone: the farmer may have edited it since, and
// silently deleting a ledger line from a delete button on another screen is how a
// set of books stops being trustworthy.
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const removed = await prisma.inputVoucher.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!removed.count) return res.status(404).json({ error: "Voucher not found" });
    return res.json({ success: true, note: "The expense this booked was left in your records." });
  } catch (error) {
    console.error("Voucher delete error:", error);
    return res.status(500).json({ error: "Failed to delete the voucher" });
  }
});

export default router;
