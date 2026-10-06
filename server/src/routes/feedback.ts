import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { JWT_SECRET } from "../middleware/auth.js";
import {
  validateFeedback,
  BEST_TAGS,
  IMPROVE_TAGS,
  SPECIES_OPTIONS,
  RATING_SCALE,
  FEEDBACK_SOURCES,
  type FeedbackSource,
} from "../lib/feedback.js";

/**
 * The feedback endpoint.
 *
 * Mounted at `/api/feedback` and deliberately **unauthenticated**. There is one
 * endpoint for two audiences, because they are asking the same question:
 *
 *   - the in-app prompt, where a valid token lets us attach the farm and user
 *   - the public shareable link, where there is no token at all
 *
 * A second, separate public router would have meant two copies of the
 * validation, and the copy that drifts is always the one nobody tests.
 *
 * ## Why an invalid token is not an error
 *
 * A farmer whose session expired should still be able to say what he thinks.
 * A bad token is treated as "no token" — the submission is stored anonymously
 * rather than rejected. Rejecting it would lose the opinion we asked for in
 * order to protect nothing.
 */

const router = Router();

/**
 * Hash the address rather than store it.
 *
 * Enough to throttle one responder on an open form; not enough to become a
 * record of who said what. Salted with the server secret so the hashes are not
 * reversible by brute force over the IPv4 space.
 */
function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return crypto
    .createHash("sha256")
    .update(`${ip}|${JWT_SECRET}`)
    .digest("hex")
    .slice(0, 32);
}

/** Best-effort identity. Anything invalid simply yields no identity. */
function optionalIdentity(req: Request): { userId: number | null; farmId: number | null } {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return { userId: null, farmId: null };
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId?: number;
      farmId?: number | null;
    };
    return {
      userId: typeof decoded.userId === "number" ? decoded.userId : null,
      farmId: typeof decoded.farmId === "number" ? decoded.farmId : null,
    };
  } catch {
    return { userId: null, farmId: null };
  }
}

/**
 * GET /api/feedback/instrument
 *
 * The questions themselves, so the client never hardcodes the tags. If the
 * vocabulary lives in two places it drifts, and the failure mode of a drifted
 * vocabulary is a farmer tapping an icon whose key the server then discards —
 * he answers, and nothing is recorded.
 */
router.get("/instrument", (_req: Request, res: Response) => {
  res.json({
    ratingScale: RATING_SCALE,
    bestTags: Object.entries(BEST_TAGS).map(([key, v]) => ({ key, ...v })),
    improveTags: Object.entries(IMPROVE_TAGS).map(([key, v]) => ({ key, ...v })),
    species: SPECIES_OPTIONS,
    sources: FEEDBACK_SOURCES,
  });
});

// POST /api/feedback
router.post("/", async (req: Request, res: Response) => {
  try {
    const identity = optionalIdentity(req);

    // An in-app submission is marked as such even if the client forgets, so
    // the source counts stay honest.
    const bodySource =
      typeof req.body?.source === "string" ? req.body.source : undefined;
    const allowedSource: FeedbackSource =
      bodySource && (FEEDBACK_SOURCES as readonly string[]).includes(bodySource)
        ? (bodySource as FeedbackSource)
        : identity.userId
          ? "in_app"
          : "public_link";

    const result = validateFeedback({
      source: allowedSource,
      rating: req.body?.rating,
      best: req.body?.best,
      improve: req.body?.improve,
      species: req.body?.species,
      comment: req.body?.comment,
      phone: req.body?.phone,
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    const saved = await prisma.feedback.create({
      data: {
        farmId: identity.farmId,
        userId: identity.userId,
        source: result.value.source,
        rating: result.value.rating,
        best: result.value.best,
        improve: result.value.improve,
        species: result.value.species,
        comment: result.value.comment,
        phone: result.value.phone,
        ipHash: hashIp(req.ip ?? req.socket?.remoteAddress),
      },
      select: { id: true },
    });

    res.status(201).json({ ok: true, id: saved.id });
  } catch (error) {
    console.error("Feedback error:", error);
    res.status(500).json({ error: "Could not save your feedback" });
  }
});

export default router;
