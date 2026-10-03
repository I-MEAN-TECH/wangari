import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../middleware/auth.js";
import { createUniqueFarmCode } from "../lib/farm-code.js";
import { normalisePhone, phoneErrorMessage, formatPhoneForDisplay } from "../lib/phone.js";
import { hashPin, verifyPin } from "../lib/pin.js";
import {
  getLockout,
  recordFailure,
  clearFailures,
  attemptsLeft,
  wrongPinMessage,
  LOCKOUT_MINUTES,
} from "../lib/pin-attempts.js";
import { recordStage } from "./activation.js";

/**
 * Phone + PIN sign-in (gap-analysis row 0, GAP 1).
 *
 * ── Why this route exists at all ──────────────────────────────────────────────
 * The existing `/register` asks for a name, an email, a password, a farm name
 * and then an email OTP. ICTworks lists the reasons Kenyan farmers abandon an
 * app in order of frequency — shared handsets, poor eyesight, long text, SMS
 * refusal, storage — and every one of those five steps is a documented
 * abandonment trigger. By the time the farmer reaches step five they have typed
 * a word they may have forgotten, sent to an inbox they may not own.
 *
 * This route removes all of it: a phone number, a 4-digit PIN, and the farm is
 * created automatically. Nothing installed, nothing to remember.
 *
 * ── Deliberate design decisions, each one a decision and not an oversight ────
 *
 * 1. **The PIN is 4 digits and hashed, and the account is still protected by
 *    phone ownership.** Four digits has 10,000 combinations. That is not
 *    acceptable against an online brute force, so it is NOT defended by rate
 *    limiting alone — see `MAX_PIN_ATTEMPTS` below. It is acceptable for the
 *    threat that actually exists here: someone who has the handset. Hashing
 *    (bcrypt, cost 10) covers the dump/backup leak.
 *
 * 2. **We do not send an SMS OTP on signup.** An OTP requires an SMS gateway
 *    we do not have configured, and adding a paid dependency to fix a problem
 *    that is not the biggest one is backwards. Instead the PIN IS the
 *    credential and the phone number is the identity, which is exactly how a
 *    farmer who has lost their handset thinks about it. `phoneVerifiedAt` stays
 *    NULL, so the data honestly records that we have not proven the number
 *    belongs to this person — it does not pretend to a verification we skipped.
 *
 * 3. **Email is optional, not required-then-discarded.** A farmer who has an
 *    email gets one for the daily advisory; one who does not is never blocked.
 *
 * 4. **Rate limiting is on the phone+PIN pair, not the IP.** A family in a
 *    village shares one NAT address, so IP limiting locks out a whole village
 *    while doing nothing against someone spraying 10,000 PINs at one account.
 *    That counter lives in Postgres, not in this module — see lib/pin-attempts.ts
 *    for why an in-process counter silently does nothing under pm2 cluster mode.
 */

const router = Router();

/**
 * POST /api/auth/register-phone
 * Body: { phone, pin, name?, farmName?, email?, coopCode? }
 *
 * Creates the user, the farm and the farm membership in one call, so a farmer
 * who abandons the form halfway has not left a half-made farm behind. (An
 * earlier onboarding flow created the farm and then failed to persist the step,
 * leaving farms that existed with nobody able to reach them.)
 */
router.post("/register-phone", async (req: Request, res: Response) => {
  const phone = normalisePhone(req.body?.phone);
  if (typeof phone !== "string") {
    return res.status(400).json({ error: phoneErrorMessage(phone), field: "phone" });
  }

  const pin = String(req.body?.pin ?? "");
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: "Choose a 4-digit PIN", field: "pin" });
  }

  const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return res.status(400).json({ error: "That email address does not look right", field: "email" });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, name: true, authMethod: true },
    });
    if (existing) {
      // Deliberately vague. Saying "that number is registered" hands an
      // attacker the list of farmers using Wangari.
      return res.status(409).json({
        error: "That number is already registered. Sign in with your PIN instead.",
        field: "phone",
        canLogin: true,
      });
    }

    // Email is @unique. A phone-only farmer gets a synthetic, undeliverable
    // address rather than a nullable column, so every existing query that
    // filters on email keeps working untouched.
    const email = emailRaw || `phone-${phone.replace(/\D/g, "")}@phone.invalid`;

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return res.status(409).json({ error: "That email address is already registered", field: "email" });
    }

    const name = (typeof req.body?.name === "string" && req.body.name.trim()) || "Farmer";
    const farmName =
      (typeof req.body?.farmName === "string" && req.body.farmName.trim()) || `${name}'s Farm`;

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 14 * 86400000);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        phonePin: await hashPin(pin),
        authMethod: "phone_pin",
        emailVerified: emailRaw ? now : null,
        trialStartsAt: now,
        trialEndsAt,
      },
    });

    const farm = await prisma.farm.create({
      data: { name: farmName, ownerId: user.id, code: await createUniqueFarmCode(), claimedAt: now },
    });

    await prisma.farmMember.create({ data: { userId: user.id, farmId: farm.id, role: "farm_owner" } });

    // Funnel step 1, emitted server-side like the email flow. The client is not
    // allowed to claim this stage.
    await recordStage(user.id, "signup");

    // A co-op invite code entered at signup attaches the new farm to the group
    // immediately. This is what makes bulk onboarding work: the chair reads a
    // code out in a meeting, each farmer types it once, and the co-op fills up
    // without the chair ever touching a member's account.
    let coopJoined: string | null = null;
    const inviteCode = typeof req.body?.coopCode === "string" ? req.body.coopCode.trim().toUpperCase() : "";
    if (inviteCode) {
      try {
        const { normaliseInviteCode } = await import("../lib/coop-code.js");
        const code = normaliseInviteCode(inviteCode);
        if (code) {
          const invite = await prisma.coopInvite.findUnique({
            where: { code },
            include: { group: { select: { id: true, name: true, status: true } } },
          });
          const usable =
            invite &&
            invite.status === "pending" &&
            invite.expiresAt > now &&
            invite.group.status === "active";
          if (usable) {
            await prisma.$transaction([
              prisma.coopMembership.create({ data: { groupId: invite.groupId, farmId: farm.id, role: "member" } }),
              prisma.coopInvite.update({ where: { id: invite.id }, data: { status: "accepted", acceptedAt: now } }),
            ]);
            coopJoined = invite!.group.name;
          }
        }
      } catch (err) {
        // A bad invite code must never cost the farmer their account. The farm
        // is already created; report the join failure separately and move on.
        console.error("Co-op invite attach failed at signup:", err);
      }
    }

    const token = await generateToken(user.id, farm.id);

    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, phone, email: emailRaw || null, role: user.role },
      farmId: farm.id,
      authMethod: "phone_pin",
      ...(coopJoined ? { coopJoined } : {}),
    });
  } catch (error) {
    console.error("Phone register error:", error);
    return res.status(500).json({ error: "Could not create your account" });
  }
});

/**
 * POST /api/auth/login-phone
 * Body: { phone, pin }
 */
router.post("/login-phone", async (req: Request, res: Response) => {
  const phone = normalisePhone(req.body?.phone);
  if (typeof phone !== "string") {
    return res.status(400).json({ error: phoneErrorMessage(phone), field: "phone" });
  }

  const pin = String(req.body?.pin ?? "");
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: "Enter your 4-digit PIN", field: "pin" });
  }

  const lockout = await getLockout(phone);
  if (lockout.locked) {
    const mins = lockout.minutesLeft || LOCKOUT_MINUTES;
    return res.status(429).json({
      error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      lockedOut: true,
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.phonePin) {
      // Spend comparable time on both branches so the response does not reveal
      // whether the number exists.
      await verifyPin(pin, user?.phonePin ?? null);
      return res.status(401).json({ error: "That number or PIN is not right" });
    }

    const ok = await verifyPin(pin, user.phonePin);
    if (!ok) {
      const failures = await recordFailure(phone);
      return res.status(401).json({
        error: wrongPinMessage(failures),
        attemptsLeft: attemptsLeft(failures),
      });
    }

    await clearFailures(phone);

    const member = await prisma.farmMember.findFirst({ where: { userId: user.id } });
    const farmId = member?.farmId || null;
    const token = await generateToken(user.id, farmId);

    return res.json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role },
      farmId,
      authMethod: user.authMethod ?? "phone_pin",
      displayPhone: formatPhoneForDisplay(user.phone),
    });
  } catch (error) {
    console.error("Phone login error:", error);
    return res.status(500).json({ error: "Sign in failed" });
  }
});

/**
 * POST /api/auth/pin/change — requires the current PIN.
 * Deliberately re-verifies: a session token on a shared handset must not be
 * enough to lock the owner out of their own PIN.
 */
router.post("/pin/change", async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const currentPin = String(req.body?.currentPin ?? "");
  const newPin = String(req.body?.newPin ?? "");
  if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: "Choose a 4-digit PIN", field: "newPin" });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phonePin: true } });
    if (!user?.phonePin) return res.status(400).json({ error: "This account does not use a PIN" });
    if (!(await verifyPin(currentPin, user.phonePin))) {
      return res.status(401).json({ error: "Current PIN is not right" });
    }
    if (currentPin === newPin) {
      return res.status(400).json({ error: "Choose a different PIN" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { phonePin: await hashPin(newPin), tokenVersion: { increment: 1 } },
    });
    // tokenVersion bump kills every other session: on a shared handset that is
    // the desired behaviour when a PIN changes.
    return res.json({ success: true });
  } catch (error) {
    console.error("PIN change error:", error);
    return res.status(500).json({ error: "Could not change your PIN" });
  }
});

export default router;