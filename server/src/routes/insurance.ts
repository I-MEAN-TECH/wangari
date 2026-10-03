import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { resolveTagRange } from "../lib/tag-range.js";

/**
 * Index-insurance policy register (gap-analysis row 13).
 *
 * A REGISTER, not a product. Wangari stores what the farmer was sold and what
 * they paid. It does not price risk, does not underwrite, and does not estimate
 * a payout — those are insurance business, and doing them here would put a
 * farmer's claim behind our maths instead of behind their contract.
 *
 * The value we add is the ANITRAC linkage: a policy is only evidence if the
 * animals it covers can be identified. So each policy reports how many tagged
 * animals it can actually be evidenced against, and says so plainly when that
 * number is zero.
 */

const router = Router();
router.use(authMiddleware, requireOwner);

const PRODUCT_TYPES = ["index", "livestock", "crop", "comprehensive"];
const STATUSES = ["active", "expired", "claimed", "lapsed"];

/** Policies expiring within this window are surfaced as "ending soon". */
const EXPIRY_WARNING_DAYS = 30;

router.get("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const now = new Date();
    const warningDate = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86400000);

    const policies = await prisma.insurancePolicy.findMany({
      where: { farmId },
      orderBy: { endDate: "desc" },
      include: {
        flock: {
          select: {
            id: true,
            name: true,
            type: true,
            currentCount: true,
            tagFrom: true,
            tagTo: true,
            taggedCount: true,
          },
        },
      },
    });

    // Evidence strength per policy: how many animals could a surveyor actually
    // match to this cover? Derived here, never stored, because it goes stale
    // the moment a tag is added or an animal dies.
    const enriched = policies.map((p) => {
      const tagged = p.flock
        ? resolveTagRange(p.flock.tagFrom, p.flock.tagTo, p.flock.taggedCount).span
        : 0;
      const animalsInFlock = p.flock?.currentCount ?? 0;
      const expiringSoon = p.status === "active" && p.endDate <= warningDate && p.endDate >= now;
      return {
        ...p,
        taggedAnimals: tagged,
        animalsInFlock,
        // Three states, plainly: no flock linked, linked but untagged, or
        // evidenced. A farmer must be able to tell which one they are in.
        evidence: !p.flock
          ? ("no_flock" as const)
          : tagged === 0
            ? ("untagged" as const)
            : ("evidenced" as const),
        expiringSoon,
        expiredNow: p.status === "active" && p.endDate < now,
      };
    });

    return res.json({ policies: enriched, expiryWarningDays: EXPIRY_WARNING_DAYS });
  } catch (error) {
    console.error("Insurance list error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const insurer = typeof req.body?.insurer === "string" ? req.body.insurer.trim() : "";
    const policyNumber = typeof req.body?.policyNumber === "string" ? req.body.policyNumber.trim() : "";

    if (!insurer) return res.status(400).json({ error: "Which insurer is the policy with?", field: "insurer" });
    if (!policyNumber) return res.status(400).json({ error: "Enter the policy number", field: "policyNumber" });

    const startDate = req.body?.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body?.endDate ? new Date(req.body.endDate) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ error: "Enter the start date", field: "startDate" });
    }
    if (!endDate || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: "Enter the end date", field: "endDate" });
    }
    if (endDate <= startDate) {
      // A policy whose cover ends before it starts is a transcription error, and
      // exactly the error an insurer would use to reject a claim.
      return res.status(400).json({ error: "The end date must be after the start date", field: "endDate" });
    }

    const flockId = req.body?.flockId ? Number(req.body.flockId) : null;
    if (flockId) {
      const flock = await prisma.flock.findFirst({ where: { id: flockId, farmId }, select: { id: true } });
      if (!flock) return res.status(400).json({ error: "That flock is not on this farm", field: "flockId" });
    }

    const policy = await prisma.insurancePolicy.create({
      data: {
        farmId,
        flockId,
        insurer,
        policyNumber,
        productType: PRODUCT_TYPES.includes(req.body?.productType) ? req.body.productType : "index",
        unitsCovered: req.body?.unitsCovered != null && req.body.unitsCovered !== "" ? Number(req.body.unitsCovered) : null,
        sumInsured: req.body?.sumInsured != null && req.body.sumInsured !== "" ? Number(req.body.sumInsured) : null,
        premiumPaid: req.body?.premiumPaid != null && req.body.premiumPaid !== "" ? Number(req.body.premiumPaid) : null,
        startDate,
        endDate,
        status: STATUSES.includes(req.body?.status) ? req.body.status : "active",
        triggerMetric: req.body?.triggerMetric?.trim() || null,
        triggerValue: req.body?.triggerValue != null && req.body.triggerValue !== "" ? Number(req.body.triggerValue) : null,
        notes: req.body?.notes?.trim() || null,
      },
    });

    return res.status(201).json(policy);
  } catch (error) {
    console.error("Insurance create error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const id = Number(req.params.id);
    const existing = await prisma.insurancePolicy.findFirst({ where: { id, farmId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Policy not found" });

    const updated = await prisma.insurancePolicy.update({
      where: { id },
      data: {
        ...(req.body?.status && STATUSES.includes(req.body.status) ? { status: req.body.status } : {}),
        ...(req.body?.notes !== undefined ? { notes: req.body.notes?.trim() || null } : {}),
        ...(req.body?.sumInsured !== undefined ? { sumInsured: req.body.sumInsured === "" ? null : Number(req.body.sumInsured) } : {}),
        ...(req.body?.endDate ? { endDate: new Date(req.body.endDate) } : {}),
      },
    });
    return res.json(updated);
  } catch (error) {
    console.error("Insurance update error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const id = Number(req.params.id);
    const existing = await prisma.insurancePolicy.findFirst({ where: { id, farmId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Policy not found" });
    await prisma.insurancePolicy.delete({ where: { id } });
    return res.json({ success: true });
  } catch (error) {
    console.error("Insurance delete error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

/**
 * GET /api/insurance/summary — what cover the farm actually has.
 *
 * Deliberately reports the gap as well as the total: a farmer who thinks they
 * are insured for 40 head and has 40 head with no tags on any of them has a
 * policy and no proof, and that distinction is the whole feature.
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const farmId = req.user!.farmId!;
    const now = new Date();

    const [policies, taggedAnimals, flocks] = await Promise.all([
      prisma.insurancePolicy.findMany({
        where: { farmId, status: "active" },
        select: { id: true, sumInsured: true, premiumPaid: true, endDate: true, flockId: true },
      }),
      prisma.animal.count({ where: { farmId } }),
      prisma.flock.findMany({
        where: { farmId, status: "active" },
        select: { id: true, currentCount: true, tagFrom: true, tagTo: true, taggedCount: true },
      }),
    ]);

    const totalAnimals = flocks.reduce((s, f) => s + (f.currentCount ?? 0), 0);
    const taggedTotal = flocks.reduce(
      (s, f) => s + resolveTagRange(f.tagFrom, f.tagTo, f.taggedCount).span,
      0
    );

    return res.json({
      activePolicies: policies.length,
      totalSumInsured: policies.reduce((s, p) => s + Number(p.sumInsured ?? 0), 0),
      totalPremium: policies.reduce((s, p) => s + Number(p.premiumPaid ?? 0), 0),
      totalAnimals,
      taggedAnimals: taggedAnimals > 0 ? taggedAnimals : taggedTotal,
      // The honest headline: cover is only as good as the tags behind it.
      untaggedAnimals: Math.max(0, totalAnimals - Math.max(taggedAnimals, taggedTotal)),
      expiredCount: policies.filter((p) => p.endDate < now).length,
    });
  } catch (error) {
    console.error("Insurance summary error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;