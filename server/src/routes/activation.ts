import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { firstRecordAt } from "../lib/first-record.js";
import { FUNNEL_STAGES, type FunnelStage } from "../lib/activation-funnel.js";


const router = Router();

/** UTC calendar day. The unit the whole funnel counts in. */
const today = (): string => new Date().toISOString().slice(0, 10);

const isStage = (s: unknown): s is FunnelStage =>
  typeof s === "string" && (FUNNEL_STAGES as string[]).includes(s);

/**
 * Record one stage event, ignoring duplicates.
 *
 * Never throws. Instrumentation that can fail the farmer's app is worse than no
 * instrumentation at all — a farmer must not lose a milk record because our
 * analytics table was briefly unhappy. Returns false on any error.
 */
export async function recordStage(
  userId: number,
  stage: FunnelStage,
  day = today()
): Promise<boolean> {
  try {
    await prisma.activationEvent.createMany({
      data: [{ userId, stage, day }],
      skipDuplicates: true, // the (user, stage, day) unique index does the work
    });
    return true;
  } catch (error) {
    console.warn(`[activation] could not record ${stage} for user ${userId}:`, error);
    return false;
  }
}

/**
 * POST /api/activation — the client heartbeat.
 *
 * The client pings once per app open with whatever it believes it achieved.
 * Two stages are NOT taken on trust:
 *
 *  - `signup` and `onboarding_completed` are rejected from the client entirely.
 *    They are emitted server-side by register and by POST /api/auth/onboarding,
 *    at the moment they actually happen. If the client could claim these, the
 *    funnel would measure our own optimism rather than farmer behaviour.
 *
 *  - `first_record` is accepted from the client but VERIFIED against the same
 *    rows the dashboard reads. A client that posts `first_record` without
 *    having recorded anything is ignored. This is the one stage the client has
 *    to tell us about, because a write can happen in ten different routes, but
 *    it must still be checked or the metric is worthless.
 *
 * `active` is always honest — opening the app is the act itself.
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const stage = req.body?.stage;
  if (!isStage(stage)) {
    return res.status(400).json({ error: `stage must be one of ${FUNNEL_STAGES.join(", ")}` });
  }

  if (stage === "signup" || stage === "onboarding_completed") {
    // Server-owned. A client sending these is either buggy or probing.
    return res.status(400).json({ error: `${stage} is recorded server-side` });
  }

  if (stage === "first_record") {
    const farmId = req.user!.farmId;
    const recorded = farmId ? await firstRecordAt(farmId) : null;
    if (!recorded) {
      // Honest answer, and a useful one: the client believes the farmer
      // recorded something, but there is no row. Report it as not-yet so the
      // client can retry after its next successful write.
      return res.json({ ok: true, recorded: false });
    }
    await recordStage(userId, "first_record");
  } else {
    await recordStage(userId, "active");
  }

  res.json({ ok: true, recorded: true });
});

/**
 * The funnel REPORT is not here on purpose.
 *
 * It is served from the admin router (GET /api/admin/activation) because
 * admins here are a separate identity system with their own token, and this
 * metric is business measurement rather than a farmer feature — the
 * untracked-user count in particular should never be exposed farm-side.
 */
export default router;
