import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireAdmin } from "../lib/admin-auth.js";
import {
  summariseFeedback,
  BEST_TAGS,
  IMPROVE_TAGS,
  AUDIENCE_TAGS,
  FEEDBACK_AUDIENCES,
  type FeedbackRow,
} from "../lib/feedback.js";

/**
 * What farmers actually told us, from the admin panel.
 *
 * Mounted at `/api/admin/feedback`. Read-only, so `support_read` is enough —
 * unlike the IP rules, there is no hole to punch here.
 *
 * ## Why the raw counts travel with the averages
 *
 * A single average rating of 3.6 is unfalsifiable and invites the reader to
 * believe whatever they already believed. "Seven people chose works-offline,
 * four chose I need training" can be argued with. So the ranked counts, the
 * segment counts, and the number of responses each average is computed from all
 * come back together, and the response count is first.
 *
 * The tags come back with their Swahili labels attached so the panel never has
 * to keep a second copy of the vocabulary.
 */

const router = Router();

// GET /api/admin/feedback
router.get("/", requireAdmin(["super_admin", "support_read", "support"]), async (req: Request, res: Response) => {
  try {
    const days = Math.min(Number(req.query.days) || 90, 365);
    const since = new Date(Date.now() - days * 86400000);
    const source = typeof req.query.source === "string" ? req.query.source : undefined;

    const rows = await prisma.feedback.findMany({
      where: { createdAt: { gte: since }, ...(source ? { source } : {}) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        source: true,
        rating: true,
        best: true,
        improve: true,
        species: true,
        comment: true,
        phone: true,
        audience: true,
        utm: true,
        farmId: true,
        createdAt: true,
      },
    });

    // Json arrays come back as `unknown`; coerce rather than cast, so a row
    // written by an older shape degrades to "no tags" instead of crashing the
    // whole panel with a 500.
    const asKeys = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

    const normalised: FeedbackRow[] = rows.map((r) => ({
      rating: r.rating,
      best: asKeys(r.best),
      improve: asKeys(r.improve),
      species: asKeys(r.species),
      audience: r.audience,
      utm: r.utm,
    }));

    const summary = summariseFeedback(normalised);

    res.json({
      periodDays: days,
      ...summary,
      // Labels, so the panel renders Swahili without duplicating the vocabulary.
      labels: {
        best: BEST_TAGS,
        improve: IMPROVE_TAGS,
        audience: AUDIENCE_TAGS,
        audienceOrder: FEEDBACK_AUDIENCES,
      },
      // The unaggregated rows, newest first. The counts above are the summary;
      // these are what a founder reads when a number surprises him.
      recent: rows.slice(0, 50),
    });
  } catch (error) {
    console.error("Admin feedback error:", error);
    res.status(500).json({ error: "Failed to load feedback" });
  }
});

export default router;
