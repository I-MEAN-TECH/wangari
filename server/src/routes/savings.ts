import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { groupLedger, memberStatement, ENTRY_TYPES, type SavingsEntryRecord } from "../lib/savings-ledger.js";

/**
 * Chama / table-banking ledger (gap report §3 C7).
 *
 * `CoopGroup` covers membership and join codes, not money — and most chamas are
 * not in the app at all, so entries carry a plain `groupName` with an optional
 * `coopGroupId` link. That is what makes this usable the week after a farmer
 * joins, instead of after their whole group does.
 *
 * `requireOwner`: a member's balance is a money record, and the same reasoning as
 * the delivery ledger applies — whoever can edit it can make a dispute look
 * settled.
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

function toRecord(r: {
  id: number; groupName: string; memberName: string; entryType: string;
  amount: unknown; occurredOn: Date; counterparty: string | null;
}): SavingsEntryRecord {
  return {
    id: r.id,
    groupName: r.groupName,
    memberName: r.memberName,
    entryType: r.entryType,
    amount: num(r.amount),
    occurredOn: new Date(r.occurredOn),
    counterparty: r.counterparty,
  };
}

/**
 * GET /api/savings — every group's book, and the member statements inside it.
 *
 * `groupName` filters to one group, which is what the group page opens with.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const groupName = typeof req.query.group === "string" && req.query.group.trim() ? req.query.group.trim() : null;

    const rows = await prisma.savingsEntry.findMany({
      where: { farmId, ...(groupName ? { groupName } : {}) },
      orderBy: { occurredOn: "desc" },
      take: 500,
    });

    const records = rows.map(toRecord);
    return res.json({
      ledgers: groupLedger(records),
      entries: rows.map((r) => toRecord(r)),
      entryTypes: ENTRY_TYPES,
      counts: {
        groups: [...new Set(records.map((r) => r.groupName))].length,
        members: [...new Set(records.map((r) => `${r.groupName}::${r.memberName}`))].length,
        entries: records.length,
      },
      // The line that keeps the pot from being read as "the money you have".
      basis:
        "This is what the book says: contributions in, withdrawals out, loans taken and repaid. A group that also holds a tank, a goat or a bank balance has assets this cannot see.",
    });
  } catch (error) {
    console.error("Savings list error:", error);
    return res.status(500).json({ error: "Failed to load the savings book" });
  }
});

/**
 * GET /api/savings/member?name=Grace — one member's position, across every group.
 *
 * Registered before nothing that would shadow it: this router has no `/:id`
 * GET, so the literal path is safe wherever it sits.
 */
router.get("/member", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Which member?" });

    const rows = await prisma.savingsEntry.findMany({ where: { farmId }, orderBy: { occurredOn: "desc" } });
    const records = rows.map(toRecord);
    return res.json({
      memberName: name,
      statements: memberStatement(name, records),
      entries: records.filter((r) => r.memberName === name),
    });
  } catch (error) {
    console.error("Savings member error:", error);
    return res.status(500).json({ error: "Failed to load the member statement" });
  }
});

// POST /api/savings — one line in the book.
router.post("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const groupName = typeof req.body?.groupName === "string" ? req.body.groupName.trim() : "";
    const memberName = typeof req.body?.memberName === "string" ? req.body.memberName.trim() : "";
    const entryType = typeof req.body?.entryType === "string" ? req.body.entryType : "";
    const amount = num(req.body?.amount);

    if (!groupName) return res.status(400).json({ error: "Which group?", field: "groupName" });
    if (!memberName) return res.status(400).json({ error: "Which member?", field: "memberName" });
    if (!ENTRY_TYPES.includes(entryType as (typeof ENTRY_TYPES)[number])) {
      return res.status(400).json({ error: "Pick what happened: contribution, withdrawal, loan or repayment", field: "entryType" });
    }
    if (amount <= 0) return res.status(400).json({ error: "Enter the amount", field: "amount" });

    // A coopGroupId is accepted but only when it is this farm's group, so an entry
    // cannot be filed against a stranger's chama.
    let coopGroupId: number | null = req.body?.coopGroupId ? Number(req.body.coopGroupId) : null;
    if (coopGroupId != null) {
      const group = await prisma.coopGroup.findFirst({
        where: { id: coopGroupId, memberships: { some: { farmId } } },
        select: { id: true },
      });
      if (!group) coopGroupId = null;
    }

    const entry = await prisma.savingsEntry.create({
      data: {
        farmId,
        coopGroupId,
        groupName,
        memberName,
        entryType,
        amount,
        occurredOn: dateOrNull(req.body?.occurredOn) ?? new Date(),
        counterparty: req.body?.counterparty?.trim() || null,
        notes: req.body?.notes?.trim() || null,
        createdBy: req.user!.userId ?? null,
      },
    });

    const rows = await prisma.savingsEntry.findMany({ where: { farmId, groupName }, orderBy: { occurredOn: "desc" } });
    const ledgers = groupLedger(rows.map(toRecord));
    return res.status(201).json({
      entry,
      // The updated position, so the form can show the effect immediately rather
      // than making the farmer reload to find out what they just did.
      ledger: ledgers[0] ?? null,
    });
  } catch (error) {
    console.error("Savings create error:", error);
    return res.status(500).json({ error: "Failed to record the entry" });
  }
});

// DELETE /api/savings/:id — remove a line entered wrongly.
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const removed = await prisma.savingsEntry.deleteMany({
      where: { id: Number(req.params.id), farmId: req.user!.farmId! },
    });
    if (!removed.count) return res.status(404).json({ error: "Entry not found" });
    return res.json({ success: true });
  } catch (error) {
    console.error("Savings delete error:", error);
    return res.status(500).json({ error: "Failed to delete the entry" });
  }
});

export default router;
