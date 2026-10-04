import { Request, Response, NextFunction } from "express";

/**
 * Blocks worker tokens from owner-only endpoints, and rejects farm-owner
 * sessions that have no farm attached (fresh registrations before onboarding
 * completes). Without this, every farm-scoped route crashes with
 * PrismaClientValidationError (`id: null`) instead of one clear message.
 */
/**
 * Blocks any session with no farm attached, WITHOUT blocking workers.
 *
 * `req.user.farmId` comes from the token, and it is null for an owner who has
 * not finished onboarding. A route that filters `where: { farmId:
 * req.user!.farmId! }` with a null value does not return nothing - Prisma
 * drops an undefined filter entirely and returns EVERY farm's rows. Proved
 * live: a token without farmId read 6 flocks across farms where the same
 * token with farmId=3 read 1.
 *
 * requireOwner also blocks workers, which several read routes legitimately
 * serve, so those routes use this instead: a farmId-less session is refused
 * outright rather than quietly shown another tenant's data.
 */
export function requireFarm(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (user?.farmId === null || user?.farmId === undefined) {
    return res.status(403).json({
      error: "No farm found for this account. Create a farm or accept a farm invite first.",
      needsFarm: true,
    });
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (user?.workerId || user?.role === "worker") {
    return res.status(403).json({ error: "Workers do not have access to this resource" });
  }
  if (user?.userId && (user.farmId === null || user.farmId === undefined)) {
    return res.status(403).json({
      error: "No farm found for this account. Create a farm or accept a farm invite first.",
      needsFarm: true,
    });
  }
  next();
}
