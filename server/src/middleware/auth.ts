import { trialEndDate } from "../lib/config.js";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";

// Fail hard without a real secret in production (CVE-2026-49352-style bypass)
export const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET must be set in production"); })() : "wangari-dev-secret-change-in-production");

export interface AuthUser {
  userId?: number;
  workerId?: number;
  farmId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser & { role?: string; tv?: number };

    // Token revocation: worker tokens carry the worker's tokenVersion at sign
    // time. If the DB version is higher (PIN change / owner regen / status
    // change), the token is dead. Checked only for worker tokens — cheap.
    if (decoded.role === "worker" || decoded.workerId) {
      const current = await prisma.worker.findUnique({
        where: { id: decoded.workerId! },
        select: { tokenVersion: true, status: true, farmId: true },
      });
      if (!current || current.status !== "active" || (current.tokenVersion || 0) !== (decoded.tv ?? 0)) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
      }
      req.user = decoded;

      // Workers inherit the farm owner's access: if the owner's trial expired
      // and there is no active subscription, workers are locked out too. The
      // owner's own token already passes through the trial/subscription check
      // below; this mirrors it for every worker session on that farm.
      const url = req.originalUrl || req.url || "";
      const isExempt =
        url.includes("/api/auth") ||
        url.includes("/api/trial") ||
        url.includes("/api/paystack") ||
        url.includes("/api/subscriptions");
      if (!isExempt) {
        const farm = await prisma.farm.findUnique({
          where: { id: current.farmId },
          select: { ownerId: true },
        });
        if (farm) {
          const owner = await prisma.user.findUnique({
            where: { id: farm.ownerId },
            select: { trialEndsAt: true, createdAt: true },
          });
          if (owner) {
            const now = new Date();
            let trialActive = false;
            if (owner.trialEndsAt) {
              trialActive = now < owner.trialEndsAt;
            } else if (owner.createdAt) {
              const fourteenDays = trialEndDate(owner.createdAt);
              trialActive = now < fourteenDays;
            }
            if (!trialActive) {
              const ownerSub = await prisma.subscription.findFirst({
                where: { userId: farm.ownerId, status: "active", expiresAt: { gt: now } },
              });
              if (!ownerSub) {
                return res.status(403).json({
                  error: "Your farm's free trial has expired. Ask the farm owner to subscribe to continue.",
                  trialExpired: true,
                });
              }
            }
          }
        }
      }
      return next();
    }

    req.user = decoded;

    // Exempt endpoints: auth, trial status, paystack, subscriptions
    const url = req.originalUrl || req.url || "";
    const isExempt =
      url.includes("/api/auth") ||
      url.includes("/api/trial") ||
      url.includes("/api/paystack") ||
      url.includes("/api/subscriptions");

    if (isExempt) {
      return next();
    }

    const now = new Date();
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId! },
      select: { trialEndsAt: true, createdAt: true, tokenVersion: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Token revocation: user tokens carry tv (tokenVersion). A mismatch means
    // the password changed or the account was reset — token is dead.
    if ((decoded.tv ?? 0) !== (user as any).tokenVersion) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    let trialActive = false;
    if (user.trialEndsAt) {
      trialActive = now < user.trialEndsAt;
    } else if (user.createdAt) {
      const fourteenDays = trialEndDate(user.createdAt);
      trialActive = now < fourteenDays;
    }

    if (trialActive) {
      return next();
    }

    const activeSub = await prisma.subscription.findFirst({
      where: {
        userId: decoded.userId!,
        status: "active",
        expiresAt: { gt: now },
      },
    });

    if (activeSub) {
      return next();
    }

    return res.status(403).json({
      error: "Your 14-day free trial has expired. Please subscribe to continue using Wangari.",
      trialExpired: true,
    });
  } catch (error: any) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

export async function generateToken(userId: number, farmId: number | null): Promise<string> {
  // Embed the user's tokenVersion at sign time; the middleware compares it so
  // password changes / deactivations revoke outstanding tokens.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
  return jwt.sign({ userId, farmId, tv: user?.tokenVersion ?? 0 }, JWT_SECRET, { expiresIn: "7d" });
}
