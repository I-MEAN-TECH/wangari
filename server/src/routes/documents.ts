import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireFarm } from "../middleware/requireOwner.js";

/**
 * GET /api/documents?q=...&type=...  — unified search across every document
 * the farm issues or receives. One box finds anything by its code or content:
 *
 *   INV-202609-0001   → invoice
 *   QTE-…             → quote (invoices with quote status are returned as invoices)
 *   RCP-…             → receipt (sale-linked invoices / sale receipts)
 *   DLV-…             → delivery
 *   PUR-…             → purchase (expense transaction)
 *   …or plain text matched against customer/buyer/description.
 *
 * Returns a flat, newest-first list with a `kind` on every row so the UI can
 * render one unified result list and deep-link to the right page.
 */
const router = Router();
router.use(authMiddleware, requireFarm);

router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const q = String(req.query.q || "").trim();
    const typeFilter = String(req.query.type || "all").toLowerCase();
    const take = Math.min(Number(req.query.limit) || 40, 100);

    const codeMatch = q.match(/^(INV|QTE|RCP|DLV|PUR|RPT)-([0-9]{6})-([0-9]+)$/i);
    const contains = (s: string | null | undefined) => q && s && s.toLowerCase().includes(q.toLowerCase());

    type Row = {
      kind: "invoice" | "receipt" | "quote" | "delivery" | "purchase";
      code: string;
      id: number;
      title: string;
      party: string;
      amount: number;
      status: string;
      date: Date;
      link: string;
    };
    const rows: Row[] = [];

    const wantInvoices = typeFilter === "all" || ["invoice", "receipt"].includes(typeFilter);
    const wantQuotes = typeFilter === "all" || typeFilter === "quote";
    const wantDeliveries = typeFilter === "all" || typeFilter === "delivery";
    const wantPurchases = typeFilter === "all" || typeFilter === "purchase";

    const jobs: Promise<void>[] = [];

    if (wantInvoices) {
      jobs.push(
        prisma.invoice
          .findMany({
            where: {
              farmId,
              ...(codeMatch
                ? { invoiceNumber: { contains: q, mode: "insensitive" } }
                : q
                ? {
                    OR: [
                      { invoiceNumber: { contains: q, mode: "insensitive" } },
                      { customer: { name: { contains: q, mode: "insensitive" } } },
                    ],
                  }
                : {}),
            },
            orderBy: { createdAt: "desc" },
            take,
            include: { customer: { select: { name: true, phone: true } }, sale: { select: { id: true } } },
          })
          .then((list) => {
            for (const inv of list) {
              // A sale-linked, fully-paid invoice doubles as the receipt (RCP namespace
              // is the same document printed as a receipt); quote-status invoices are quotes.
              const kind: Row["kind"] = inv.saleId ? "receipt" : "invoice";
              rows.push({
                kind,
                code: inv.invoiceNumber,
                id: inv.id,
                title: inv.saleId ? "Sale receipt" : "Invoice",
                party: inv.customer?.name || "Walk-in Customer",
                amount: Number(inv.totalAmount),
                status: inv.paymentStatus,
                date: inv.createdAt,
                link: inv.saleId ? "/sales" : `/invoices?open=${inv.id}`,
              });
            }
          })
      );
    }

    if (wantQuotes) {
      jobs.push(
        prisma.quote
          .findMany({
            where: {
              farmId,
              ...(codeMatch
                ? { quoteNumber: { contains: q, mode: "insensitive" } }
                : q
                ? {
                    OR: [
                      { quoteNumber: { contains: q, mode: "insensitive" } },
                      { customer: { name: { contains: q, mode: "insensitive" } } },
                      { notes: { contains: q, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            orderBy: { createdAt: "desc" },
            take,
            include: { customer: { select: { name: true } } },
          })
          .then((list) => {
            for (const qt of list) {
              rows.push({
                kind: "quote",
                code: qt.quoteNumber,
                id: qt.id,
                title: "Quote",
                party: qt.customer?.name || "Walk-in Customer",
                amount: Number(qt.totalAmount),
                status: qt.status,
                date: qt.createdAt,
                link: `/quotes?open=${qt.id}`,
              });
            }
          })
      );
    }

    if (wantDeliveries) {
      jobs.push(
        prisma.delivery
          .findMany({
            where: {
              farmId,
              ...(codeMatch
                ? { docCode: { contains: q, mode: "insensitive" } }
                : q
                ? {
                    OR: [
                      { docCode: { contains: q, mode: "insensitive" } },
                      { buyer: { contains: q, mode: "insensitive" } },
                      { commodity: { contains: q, mode: "insensitive" } },
                      { receiptRef: { contains: q, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            orderBy: { date: "desc" },
            take,
          })
          .then((list) => {
            for (const d of list) {
              rows.push({
                kind: "delivery",
                code: d.docCode || `DLV-${d.id}`,
                id: d.id,
                title: `${d.commodity.charAt(0).toUpperCase() + d.commodity.slice(1)} delivery`,
                party: d.buyer,
                amount: Number(d.expectedPay || d.paidAmount || 0),
                status: d.status,
                date: d.date,
                link: "/deliveries",
              });
            }
          })
      );
    }

    if (wantPurchases) {
      jobs.push(
        prisma.transaction
          .findMany({
            where: {
              farmId,
              type: "expense",
              ...(codeMatch
                ? { docCode: { contains: q, mode: "insensitive" } }
                : q
                ? {
                    OR: [
                      { docCode: { contains: q, mode: "insensitive" } },
                      { description: { contains: q, mode: "insensitive" } },
                      { category: { contains: q, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            orderBy: { date: "desc" },
            take,
          })
          .then((list) => {
            for (const t of list) {
              rows.push({
                kind: "purchase",
                code: t.docCode || `PUR-${t.id}`,
                id: t.id,
                title: t.description || t.category || "Purchase",
                party: t.category || "Expense",
                amount: Number(t.amount),
                status: "recorded",
                date: t.date,
                link: "/transactions",
              });
            }
          })
      );
    }

    await Promise.all(jobs);
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ results: rows.slice(0, take), total: rows.length, q });
  } catch (error) {
    console.error("Documents search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
