import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireAdmin, auditAdminAction } from "../lib/admin-auth.js";
import { isValidPattern, matches, clientIp, invalidateIpRules } from "../lib/ip-rules.js";

/**
 * IP access control, from the System Health page.
 *
 * Mounted at /api/admin/ip. Super-admin only: an allow rule is a hole punched
 * in the rules, so a support agent who can read a customer's farm must not be
 * able to write one.
 *
 * ── the one rule this module enforces beyond matching ─────────────────────
 * You cannot block your own address. Every other failure here is recoverable
 * from the panel; locking the operator out of the panel is not, because the
 * panel is where you would go to undo it. That refusal is the whole reason
 * this is server-side rather than a confirmation dialog.
 */
const router = Router();
const superOnly = requireAdmin(["super_admin"]);

interface RuleRow {
  id: number;
  pattern: string;
  action: string;
  note: string | null;
  addedBy: string | null;
  hitCount: number;
  lastHitAt: Date | null;
  createdAt: Date;
}

const SAFE_SELECT = {
  id: true, pattern: true, action: true, note: true, addedBy: true,
  hitCount: true, lastHitAt: true, createdAt: true,
} as const;

/** Only these two. Anything else reaching the matcher would match nothing. */
function normaliseAction(v: unknown): "block" | "allow" | null {
  const s = String(v ?? "").toLowerCase();
  return s === "block" || s === "allow" ? s : null;
}

// ─── GET /api/admin/ip ────────────────────────────────────────────────────
/**
 * The rules, plus the number the operator will actually act on.
 *
 * `youAre` is returned because the first thing anyone does here is try to ban
 * the address they are banned by, and the second thing they do is ban
 * themselves. Showing the caller's own address turns both mistakes into a
 * read-only glance.
 */
router.get("/", superOnly, async (req: Request, res: Response) => {
  try {
    const rows = await prisma.ipRule.findMany({
      select: SAFE_SELECT,
      orderBy: [{ hitCount: "desc" }, { createdAt: "desc" }],
    });

    const blocks = rows.filter((r) => r.action === "block");
    const totalHits = rows.reduce((n, r) => n + r.hitCount, 0);

    res.json({
      rules: rows,
      summary: {
        total: rows.length,
        blocks: blocks.length,
        allows: rows.length - blocks.length,
        // A rule with zero hits is either recent or wrong. The panel says which
        // it cannot, so it shows the number and lets the operator decide.
        totalBlockedRequests: totalHits,
        neverHit: rows.filter((r) => r.action === "block" && r.hitCount === 0).length,
      },
      youAre: clientIp(req),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin IP list error:", error);
    res.status(500).json({ error: "Failed to load IP rules" });
  }
});

// ─── POST /api/admin/ip/preview ───────────────────────────────────────────
/**
 * Dry run: "would this pattern catch this address, and what wins?"
 *
 * Added because the alternative is saving a rule and discovering it was wrong
 * from a farmer's support ticket. Evaluated against the CURRENT table, so an
 * allow rule that already covers the address is reported as the reason the
 * block would not take effect — which is the single most surprising thing
 * about the precedence rule and the one most likely to waste an afternoon.
 */
router.post("/preview", superOnly, async (req: Request, res: Response) => {
  try {
    const pattern = String(req.body?.pattern ?? "");
    const ip = String(req.body?.ip ?? "");
    if (!isValidPattern(pattern)) return res.status(400).json({ error: "Not a valid address, CIDR block or wildcard" });
    if (!matches(pattern, ip)) {
      return res.json({ pattern, ip, matchesPattern: false, effective: "allow", note: "This rule would not match that address." });
    }

    const existing = await prisma.ipRule.findMany({ select: SAFE_SELECT });
    const winner = existing.find((r) => r.action === "allow" && matches(r.pattern, ip));
    res.json({
      pattern,
      ip,
      matchesPattern: true,
      // A block loses to an allow that already covers the address.
      effective: winner ? "allow" : "block",
      overriddenBy: winner ? winner.pattern : null,
      note: winner
        ? `An existing allow rule (${winner.pattern}) wins, so this block would have no effect.`
        : null,
    });
  } catch (error) {
    console.error("Admin IP preview error:", error);
    res.status(500).json({ error: "Preview failed" });
  }
});

// ─── POST /api/admin/ip ───────────────────────────────────────────────────
router.post("/", superOnly, async (req: Request, res: Response) => {
  try {
    const pattern = String(req.body?.pattern ?? "").trim();
    const action = normaliseAction(req.body?.action);
    const note = req.body?.note ? String(req.body.note).slice(0, 280) : null;

    if (!isValidPattern(pattern)) {
      // Refused rather than stored-and-ignored. A rule that silently matches
      // nothing is the worst outcome: the panel would show it as active.
      return res.status(400).json({
        error: "Not a valid address, CIDR block or wildcard (for example 203.0.113.7, 203.0.113.0/24 or 203.0.113.*)",
      });
    }
    if (!action) return res.status(400).json({ error: "action must be block or allow" });

    // Self-lockout protection. An operator's own address is by definition not
    // hostile, and the failure is unrecoverable from inside the app.
    const self = clientIp(req);
    if (action === "block" && self && matches(pattern, self)) {
      return res.status(400).json({
        error: `That range includes your own address (${self}). Blocking it would lock you out of this panel.`,
      });
    }

    const row = await prisma.ipRule.create({
      data: { pattern, action, note, addedBy: (req as any).admin?.email ?? null },
      select: SAFE_SELECT,
    });
    invalidateIpRules();
    auditAdminAction((req as any).admin, `ip.${action}_added`, "ip_rule", row.id, { pattern, note });
    res.status(201).json(row);
  } catch (error) {
    console.error("Admin IP create error:", error);
    res.status(500).json({ error: "Failed to save the rule" });
  }
});

// ─── PATCH /api/admin/ip/:id ─────────────────────────────────────────────
router.patch("/:id", superOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.ipRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Rule not found" });

    const data: Record<string, unknown> = {};
    if (req.body?.action !== undefined) {
      const action = normaliseAction(req.body.action);
      if (!action) return res.status(400).json({ error: "action must be block or allow" });
      data.action = action;
      // Re-check on the way in: flipping an allow to a block is exactly how an
      // operator locks themselves out by accident.
      const self = clientIp(req);
      if (action === "block" && self && matches(existing.pattern, self)) {
        return res.status(400).json({ error: `That range includes your own address (${self}).` });
      }
    }
    if (req.body?.note !== undefined) data.note = req.body.note ? String(req.body.note).slice(0, 280) : null;
    if (req.body?.pattern !== undefined) {
      const pattern = String(req.body.pattern).trim();
      if (!isValidPattern(pattern)) return res.status(400).json({ error: "Not a valid address, CIDR block or wildcard" });
      data.pattern = pattern;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: "Nothing to change" });

    const row = await prisma.ipRule.update({ where: { id }, data, select: SAFE_SELECT });
    invalidateIpRules();
    auditAdminAction((req as any).admin, "ip.rule_updated", "ip_rule", id, data);
    res.json(row);
  } catch (error) {
    console.error("Admin IP update error:", error);
    res.status(500).json({ error: "Failed to update the rule" });
  }
});

// ─── DELETE /api/admin/ip/:id ────────────────────────────────────────────
router.delete("/:id", superOnly, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.ipRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Rule not found" });
    await prisma.ipRule.delete({ where: { id } });
    invalidateIpRules();
    auditAdminAction((req as any).admin, "ip.rule_deleted", "ip_rule", id, { pattern: existing.pattern, action: existing.action, hits: existing.hitCount });
    res.json({ ok: true });
  } catch (error) {
    console.error("Admin IP delete error:", error);
    res.status(500).json({ error: "Failed to delete the rule" });
  }
});

export default router;