import { Router, Request, Response } from "express";
import { sendDailyMarketingEmails } from "../lib/marketing-email.js";

/**
 * POST /api/cron/marketing-email
 *
 * Sends a daily farm-story marketing email to all free-plan users.
 * Called by an external cron (e.g. GitHub Actions, cron-job.org) every day
 * at 7:30 AM EAT. Protected by CRON_SECRET Bearer token.
 *
 * curl -X POST https://api.wangari.imeantech.com/api/cron/marketing-email \
 *   -H "Authorization: Bearer $CRON_SECRET"
 */

const router = Router();

const handleMarketingEmail = async (req: Request, res: Response) => {
  const token = (req.headers["authorization"] || req.query.secret || "").toString().replace("Bearer ", "").trim();
  const secret = process.env.CRON_SECRET;
  if (!secret || token !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await sendDailyMarketingEmails();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[cron/marketing-email]", err);
    res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
};

router.post("/marketing-email", handleMarketingEmail);
router.get("/marketing-email", handleMarketingEmail);

export default router;
