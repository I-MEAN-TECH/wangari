import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireFarm } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { summarizeFarmLoan } from "../lib/farm-loan-summary.js";

const router = Router();
router.use(authMiddleware, requireFarm);

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dec(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n * 100) / 100;
}

/**
 * The summary the frontend reads: the loan row plus the computed balance,
 * arrears and next instalment. Deductions collected at source by the co-op are
 * folded into `totalPaid` so a loan repaid entirely through co-op deductions
 * still shows the right balance.
 */
function withSummary(loan: any, deductions: any[] = []) {
  const deductionPaid = deductions.reduce((s: number, d: any) => s + Number(d.amount), 0);
  const totalPaid = Number(loan.amountPaid) + deductionPaid;
  const summary = summarizeFarmLoan({
    principal: Number(loan.principal),
    amountPaid: totalPaid,
    firstInstalmentDue: loan.firstInstalmentDue,
    instalmentCount: loan.instalmentCount,
    instalmentAmount: loan.instalmentAmount !== null ? Number(loan.instalmentAmount) : null,
    status: loan.status,
    today: new Date(),
  });
  return { ...loan, totalPaid, deductionPaid, ...summary };
}

// GET /api/farm-loans — list this farm's loans, each with a one-line summary
router.get("/", async (req: Request, res: Response) => {
  try {
    const loans = await prisma.farmLoan.findMany({
      where: { farmId: req.user!.farmId! },
      orderBy: { createdAt: "desc" },
    });
    // Pull deductions tagged to any of these loans in one query.
    const loanIds = loans.map((l) => l.id);
    const deductions = loanIds.length
      ? await prisma.deliveryDeduction.findMany({
          where: { farmLoanId: { in: loanIds } },
          select: { farmLoanId: true, amount: true },
        })
      : [];
    const byLoan: Record<number, any[]> = {};
    for (const d of deductions) {
      (byLoan[d.farmLoanId!] ??= []).push(d);
    }
    res.json(loans.map((l) => withSummary(l, byLoan[l.id] ?? [])));
  } catch (error) {
    console.error("List farm loans error:", error);
    res.status(500).json({ error: "Failed to fetch loans" });
  }
});

// POST /api/farm-loans — record a loan the farmer owes
router.post("/", async (req: Request, res: Response) => {
  try {
    const { lender, loanType, principal, interestRatePct, disbursedAt, firstInstalmentDue, instalmentCount, instalmentAmount, notes } = req.body;
    if (!lender || !String(lender).trim()) {
      return res.status(400).json({ error: "A lender is required (e.g. Githunguri SACCO)" });
    }
    const p = dec(principal);
    if (p === null || p <= 0) {
      return res.status(400).json({ error: "A principal amount is required" });
    }
    const loan = await prisma.farmLoan.create({
      data: {
        farmId: req.user!.farmId!,
        lender: String(lender).trim(),
        loanType: loanType || null,
        principal: p,
        interestRatePct: dec(interestRatePct),
        disbursedAt: disbursedAt ? new Date(disbursedAt) : null,
        firstInstalmentDue: firstInstalmentDue ? new Date(firstInstalmentDue) : null,
        instalmentCount: num(instalmentCount),
        instalmentAmount: dec(instalmentAmount),
        notes: notes || null,
        createdBy: req.user!.userId,
      },
    });
    res.status(201).json(loan);
  } catch (error) {
    console.error("Create farm loan error:", error);
    res.status(500).json({ error: "Failed to create loan" });
  }
});

// PATCH /api/farm-loans/:id — update a loan
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.farmLoan.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!existing) return res.status(404).json({ error: "Loan not found" });

    const data: Record<string, any> = {};
    if (req.body.lender !== undefined) data.lender = String(req.body.lender).trim();
    if (req.body.loanType !== undefined) data.loanType = req.body.loanType || null;
    if (req.body.principal !== undefined) {
      const p = dec(req.body.principal);
      if (p === null || p <= 0) return res.status(400).json({ error: "principal must be a positive amount" });
      data.principal = p;
    }
    if (req.body.interestRatePct !== undefined) data.interestRatePct = dec(req.body.interestRatePct);
    if (req.body.disbursedAt !== undefined) data.disbursedAt = req.body.disbursedAt ? new Date(req.body.disbursedAt) : null;
    if (req.body.firstInstalmentDue !== undefined) data.firstInstalmentDue = req.body.firstInstalmentDue ? new Date(req.body.firstInstalmentDue) : null;
    if (req.body.instalmentCount !== undefined) data.instalmentCount = num(req.body.instalmentCount);
    if (req.body.instalmentAmount !== undefined) data.instalmentAmount = dec(req.body.instalmentAmount);
    if (req.body.status !== undefined) {
      if (["active", "settled", "defaulted"].includes(req.body.status)) data.status = req.body.status;
    }
    if (req.body.notes !== undefined) data.notes = req.body.notes || null;

    const updated = await prisma.farmLoan.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (error) {
    console.error("Update farm loan error:", error);
    res.status(500).json({ error: "Failed to update loan" });
  }
});

// DELETE /api/farm-loans/:id — remove a loan; its repayments cascade away
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.farmLoan.deleteMany({ where: { id: Number(req.params.id), farmId: req.user!.farmId! } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete farm loan error:", error);
    res.status(500).json({ error: "Failed to delete loan" });
  }
});

// GET /api/farm-loans/:id — one loan with its full summary, repayments and
// the co-op deductions that paid it down.
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const loan = await prisma.farmLoan.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      include: {
        repayments: { orderBy: { paidAt: "desc" } },
        deductions: {
          include: { delivery: { select: { date: true, buyer: true, docCode: true } } },
          orderBy: { id: "desc" },
        },
      },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    res.json(withSummary(loan, loan.deductions));
  } catch (error) {
    console.error("Get farm loan error:", error);
    res.status(500).json({ error: "Failed to fetch loan" });
  }
});

// POST /api/farm-loans/:id/repayments — record a cash/M-Pesa/bank repayment.
// Deductions are NOT created here — they come from the deliveries route.
router.post("/:id/repayments", async (req: Request, res: Response) => {
  try {
    const loan = await prisma.farmLoan.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const amount = dec(req.body.amount);
    if (amount === null || amount <= 0) {
      return res.status(400).json({ error: "A positive repayment amount is required" });
    }
    const source = ["cash", "mpesa", "bank", "deduction"].includes(req.body.source) ? req.body.source : "cash";
    const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();

    const repayment = await prisma.loanRepayment.create({
      data: {
        farmLoanId: loan.id,
        farmId: req.user!.farmId!,
        amount,
        paidAt,
        source,
        notes: req.body.notes || null,
        createdBy: req.user!.userId,
      },
    });

    // Keep amountPaid consistent: it is the running sum of direct repayments.
    // (Co-op deductions are added on top in withSummary().)
    await prisma.farmLoan.update({
      where: { id: loan.id },
      data: { amountPaid: { increment: amount } },
    });

    res.status(201).json(repayment);
  } catch (error) {
    console.error("Create loan repayment error:", error);
    res.status(500).json({ error: "Failed to record repayment" });
  }
});

// GET /api/farm-loans/:id/repayments — every repayment against this loan
router.get("/:id/repayments", async (req: Request, res: Response) => {
  try {
    const loan = await prisma.farmLoan.findFirst({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
      select: { id: true },
    });
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const repayments = await prisma.loanRepayment.findMany({
      where: { farmLoanId: loan.id },
      orderBy: { paidAt: "desc" },
    });
    res.json(repayments);
  } catch (error) {
    console.error("List loan repayments error:", error);
    res.status(500).json({ error: "Failed to fetch repayments" });
  }
});

export default router;
