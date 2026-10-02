import { TRIAL_DAYS, trialEndDate } from "../lib/config.js";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createUniqueFarmCode } from "../lib/farm-code.js";
import jwt from "jsonwebtoken";
import { generateToken, JWT_SECRET } from "../middleware/auth.js";
import { generateSecret, otpauthUri, verifyTotp, generateRecoveryCodes, hashCode } from "../lib/totp.js";
import { authMiddleware } from "../middleware/auth.js";

// Allowed email domains for manual registration/login
const ALLOWED_DOMAINS = ["gmail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com"];

function isAllowedEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

const router = Router();

// ─── Email verification enforcement ──────────────────────
// Every manual (password) account must verify its email address before a
// session token is issued — at registration AND at login for any legacy
// account that never verified. Google accounts are exempt: Google has already
// verified the email (we check email_verified on the ID token).
async function issueVerificationCode(user: { id: number; email: string }): Promise<{ ok: boolean; devCode?: string }> {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.verificationCode.deleteMany({
    where: { userId: user.id, purpose: "email_verification" },
  });
  await prisma.verificationCode.create({
    data: { userId: user.id, code, purpose: "email_verification", expiresAt },
  });

  const { sendEmail } = await import("../lib/email.js");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:28px;"><h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Your verification code</h2><p style="margin:0 0 24px;font-size:15px;color:#64748b;">Use the code below to verify your email and continue. It expires in <strong>15 minutes</strong>.</p><div style="background:#f0fdf4;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;"><span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#166534;font-family:monospace;">${code}</span></div><p style="margin:0;font-size:13px;color:#64748b;">If you didn't request this, you can safely ignore this email.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" /><p style="margin:0;font-size:12px;color:#94a3b8;">📩 This email landed in Spam? Open it and tap <strong>“Not spam”</strong> — Gmail will then deliver our future emails to your inbox.</p></div></body></html>`;
  const text = `Your Wangari verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\nTip: if this email landed in Spam, tap \"Not spam\" so Gmail delivers our future emails to your inbox.`;
  const result = await sendEmail({
    to: user.email,
    subject: "Verify your email — Wangari",
    html,
    text,
    template: "email_verification",
    userId: user.id,
  });

  // Fallback: when delivery can't be trusted (SMTP down/unconfigured, or
  // EMAIL_FALLBACK_SHOW_CODE=true), return the code so the UI can show it on
  // screen instead of locking the farmer out.
  const showCode = process.env.EMAIL_FALLBACK_SHOW_CODE === "true" || !result.ok;
  return { ok: result.ok, ...(showCode ? { devCode: code } : {}) };
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Basic format sanity only — no domain allowlist. It blocked legitimate
    // business/organization emails while rate limiting handles spam.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    const existing = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: "insensitive" },
      },
    });
    if (existing) {
      return res.status(409).json({ error: "An account with this email address already has a registered farm. Please sign in instead." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date();
    const trialEndsAt = trialEndDate(now);

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone || null,
        trialStartsAt: now,
        trialEndsAt,
      },
    });

    // Create a farm for the user
    const farm = await prisma.farm.create({
      data: {
        name: `${name}'s Farm`,
        ownerId: user.id,
        code: await createUniqueFarmCode(),
      },
    });

    // Add user as farm member
    await prisma.farmMember.create({
      data: {
        userId: user.id,
        farmId: farm.id,
        role: "farm_owner",
      },
    });

    // No session token yet — the farmer must verify their email first.
    // The account + farm exist, so verifying (or logging in later) resumes here.
    const mailResult = await issueVerificationCode(user).catch((err) => {
      console.error("Register verification email failed:", err);
      return { ok: false } as { ok: boolean; devCode?: string };
    });

    res.status(201).json({
      emailVerifyRequired: true,
      email: user.email,
      ...(mailResult.devCode ? { devCode: mailResult.devCode } : {}),
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // NOTE: no domain allowlist here — the allowlist is a registration-time
    // spam control. Existing users (e.g. staff on imeantech.com, or users who
    // registered before/with other domains) must always be able to log in.

    const user = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: "insensitive" },
      },
    });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Google-only users don't have a password
    if (!user.password) {
      return res.status(400).json({ error: "This account uses Google sign-in. Please use the Google button to sign in." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Mandatory email verification — checked BEFORE the MFA challenge so an
    // unverified farmer is never shown a 2FA prompt. Credentials are valid,
    // so send a fresh code to the address they just authenticated with.
    if (!user.emailVerified) {
      const mailResult = await issueVerificationCode(user).catch((err) => {
        console.error("Login verification email failed:", err);
        return { ok: false } as { ok: boolean; devCode?: string };
      });
      return res.status(200).json({
        emailVerifyRequired: true,
        email: user.email,
        ...(mailResult.devCode ? { devCode: mailResult.devCode } : {}),
      });
    }

    // Two-factor (authenticator app) — if enabled, a valid TOTP or recovery
    // code is required before the session token is issued.
    const mfaEnabled = !!(user.totpEnabledAt && user.totpSecret);
    if (mfaEnabled) {
      const code = String(req.body?.totpCode || "").trim();
      if (!code) {
        return res.status(200).json({ mfaRequired: true });
      }
      if (verifyTotp(user.totpSecret!, code)) {
        // TOTP OK — fall through to token issuance.
      } else {
        // Try a single-use recovery code (compared hashed).
        const hashes: string[] = user.recoveryCodes ? JSON.parse(user.recoveryCodes) : [];
        const h = hashCode(code);
        const idx = hashes.indexOf(h);
        if (idx === -1) {
          return res.status(401).json({ error: "Invalid authenticator or recovery code", mfaInvalid: true });
        }
        hashes.splice(idx, 1);
        await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(hashes) } });
      }
    }

    const member = await prisma.farmMember.findFirst({ where: { userId: user.id } });
    const farmId = member?.farmId || null;

    const token = await generateToken(user.id, farmId);

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      farmId,
      emailVerified: user.emailVerified,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/switch-farm — switch active farm, re-issue token
router.post("/switch-farm", async (req: Request, res: Response) => {
  try {
    const { farmId } = req.body;
    if (!farmId) return res.status(400).json({ error: "farmId required" });

    // Verify user is a member of this farm
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

    const member = await prisma.farmMember.findFirst({ where: { userId: decoded.userId, farmId: Number(farmId) } });
    if (!member) return res.status(403).json({ error: "Not a member of this farm" });

    const newToken = await generateToken(decoded.userId, Number(farmId));
    res.json({ token: newToken, farmId: Number(farmId) });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json({ message: "If an account with that email exists, a reset link has been sent." });
    }

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    // Send the reset link via SMTP (the shared email helper logs to email_logs).
    const resetUrl = `${process.env.FRONTEND_URL || "https://wangari.imeantech.com"}/reset-password?token=${resetToken}`;
    const { sendEmail } = await import("../lib/email.js");
    const resetHtml = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:28px;"><h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Reset your password</h2><p style="margin:0 0 24px;font-size:15px;color:#64748b;">We received a request to reset your Wangari password. This link is valid for <strong>1 hour</strong> and can only be used once.</p><div style="text-align:center;margin-bottom:24px;"><a href="${resetUrl}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">Reset my password</a></div><p style="margin:0 0 6px;font-size:13px;color:#64748b;">Or paste this link into your browser:<br/><span style="word-break:break-all;color:#166534;">${resetUrl}</span></p><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" /><p style="margin:0;font-size:12px;color:#94a3b8;">Didn't request a reset? You can safely ignore this email — your password stays unchanged.</p></div></body></html>`;
    const resetText = `Reset your Wangari password using this link (valid 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your password — Wangari",
        html: resetHtml,
        text: resetText,
        template: "password_reset",
        userId: user.id,
      });
    } catch (mailErr) {
      console.error("Password reset email failed:", mailErr);
    }

    res.json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// POST /api/auth/google — sign in/up with Google
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential, clientId } = req.body || {};
    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    // Verify the Google ID token by calling Google's tokeninfo endpoint
    let googleUser: { sub: string; email: string; name: string; picture: string; email_verified: string | boolean; aud?: string };
    try {
      const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      if (!googleRes.ok) {
        return res.status(401).json({ error: "Invalid Google token" });
      }
      googleUser = await googleRes.json() as any;
    } catch {
      return res.status(401).json({ error: "Failed to verify Google token" });
    }

    if (!googleUser.email || !googleUser.sub) {
      return res.status(400).json({ error: "Invalid Google token data" } as any);
    }

    // Token must be issued for OUR client ID and the email must be verified by Google.
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && googleUser.aud !== expectedAud) {
      return res.status(401).json({ error: "Google token was not issued for this app" } as any);
    }
    if (googleUser.email_verified === "false" || googleUser.email_verified === false) {
      return res.status(401).json({ error: "Google account email is not verified" } as any);
    }

    const normalizedGoogleEmail = googleUser.email.toLowerCase().trim();

    // Check if user exists by googleId or email (case-insensitive)
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleUser.sub },
          { email: { equals: normalizedGoogleEmail, mode: "insensitive" } },
        ],
      },
    });

    if (user) {
      // Existing user — update Google data if not linked yet
      const updateData: any = {};
      if (!user.googleId) updateData.googleId = googleUser.sub;
      if (googleUser.picture && user.avatar !== googleUser.picture) updateData.avatar = googleUser.picture;
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data: updateData });
      }
    } else {
      // No matching account — DO NOT auto-create.
      //
      // This used to silently mint a user plus a placeholder "Jane Doe Farm"
      // and sign them straight in, which (a) let anyone who tapped Google on a
      // shared handset walk into a fresh farm, and (b) skipped onboarding
      // entirely, so the account had no real farm behind it.
      //
      // Now a genuinely new Google identity is sent to full registration, where
      // the farmer states their farm and claims it. Identity is proven by
      // Google; ownership of a farm is proven by saying what you farm.
      return res.status(409).json({
        error: "No Wangari account uses this Google account yet.",
        code: "ACCOUNT_NOT_PROVISIONED",
        email: normalizedGoogleEmail,
        googleSub: googleUser.sub,
      });
    }

    // Get farm membership
    const member = await prisma.farmMember.findFirst({ where: { userId: user.id } });
    const farmId = member?.farmId || null;

    const token = await generateToken(user.id, farmId);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        profileComplete: user.profileComplete,
        googleId: user.googleId,
      },
      farmId,
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

// POST /api/auth/link-google — link Google account to existing user
router.post("/link-google", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    // Verify token
    let googleUser: { sub: string; email: string; name: string; picture: string };
    try {
      const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      if (!googleRes.ok) return res.status(401).json({ error: "Invalid Google token" });
      googleUser = await googleRes.json() as any;
    } catch {
      return res.status(401).json({ error: "Failed to verify Google token" });
    }

    // Check if this Google account is already linked to another user
    const existingGoogleUser = await prisma.user.findUnique({ where: { googleId: googleUser.sub } });
    if (existingGoogleUser && existingGoogleUser.id !== req.user!.userId) {
      return res.status(409).json({ error: "This Google account is already linked to another user" });
    }

    // Link to current user
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        googleId: googleUser.sub,
        avatar: googleUser.picture || undefined,
      },
    });

    res.json({ success: true, user: { id: user.id, name: user.name, avatar: user.avatar } });
  } catch (error) {
    console.error("Link Google error:", error);
    res.status(500).json({ error: "Failed to link Google account" });
  }
});

// PUT /api/auth/profile — update user profile
// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING — "has this account ever really been used?"
//
// There was a 337-line /onboarding wizard that POSTed to /api/user-preferences,
// a route that did not exist; the 404 was swallowed by an empty catch. So the
// farm name, location and farm type a farmer entered were discarded and they
// landed on the dashboard believing it had saved. Nothing ever checked whether
// the account had been used, so an unused account (or a Google sign-in that
// auto-created a placeholder farm) walked straight in.
//
// These two endpoints fix the data half of that: one persists what the farmer
// actually said, one reports whether the account has ever recorded anything.
// The gate itself lives in the client (lib/onboarding.ts, tested) with the
// server as the source of truth for "has real activity".
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/onboarding — the state the gate needs.
router.get("/onboarding", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const farmId = req.user!.farmId;
    if (!userId || !farmId) {
      return res.status(403).json({ error: "No farm scope on this session" });
    }

    const [user, farm, earliest] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { profileComplete: true, name: true, phone: true } }),
      prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, name: true, location: true, county: true, farmType: true, code: true } }),
      // Real activity = any production, harvest, money or delivery record.
      prisma.$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`
        SELECT MIN(d) AS first FROM (
          SELECT MIN(date) AS d FROM daily_production WHERE farm_id = ${farmId}
          UNION ALL SELECT MIN(date) FROM crop_harvests WHERE farm_id = ${farmId}
          UNION ALL SELECT MIN(date) FROM transactions WHERE farm_id = ${farmId}
          UNION ALL SELECT MIN(date) FROM deliveries WHERE farm_id = ${farmId}
        ) t
      `).catch(() => [{ first: null }]),
    ]);

    const firstRecordAt = earliest?.[0]?.first ? new Date(earliest[0].first).toISOString() : null;

    res.json({
      profileComplete: Boolean(user?.profileComplete),
      firstRecordAt,
      everLoggedIn: true,
      // Mirrors lib/onboarding.ts: gate only on real activity, so an existing
      // farmer with records is NEVER locked out of their own records.
      onboardingRequired: !firstRecordAt,
      farm: farm ?? null,
    });
  } catch (error) {
    console.error("Onboarding status error:", error);
    res.status(500).json({ error: "Failed to read onboarding state" });
  }
});

// POST /api/auth/onboarding — persist what the farmer actually said.
router.post("/onboarding", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const farmId = req.user!.farmId;
    if (!userId || !farmId) {
      return res.status(403).json({ error: "No farm scope on this session" });
    }

    const { name, phone, farmName, location, county, farmType } = req.body || {};

    // Only these two are required to claim the farm. Keeping this SHORT is
    // deliberate: research (TraceX, Mar 2026) is explicit that "a form
    // requiring 14 fields before a harvest can be recorded will be abandoned
    // or faked". Everything else is progressive — asked later, in context.
    if (!farmName || !String(farmName).trim()) {
      return res.status(400).json({ error: "farmName is required" });
    }
    if (!farmType) {
      return res.status(400).json({ error: "farmType is required — tell us what you farm" });
    }

    await prisma.farm.update({
      where: { id: farmId },
      data: {
        name: String(farmName).trim().slice(0, 120),
        // A Google sign-in creates "Jane Doe Farm" as a placeholder; once the
        // farmer states the real name this stops being a guess.
        farmType: String(farmType).slice(0, 60),
        location: location ? String(location).trim().slice(0, 120) : null,
        county: county ? String(county).trim().slice(0, 80) : null,
      },
    });

    // The user's own contact details are optional here (a farmer may not use
    // email or may not want it typed), so profileComplete is NOT forced true —
    // it stays the settings-page concern. Onboarding only claims the farm.
    const userUpdate: any = {};
    if (name) userUpdate.name = String(name).trim().slice(0, 120);
    if (phone) userUpdate.phone = String(phone).trim().slice(0, 40);
    if (Object.keys(userUpdate).length) {
      await prisma.user.update({ where: { id: userId }, data: userUpdate });
    }

    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true, name: true, location: true, county: true, farmType: true, code: true },
    });

    res.json({ ok: true, farm });
  } catch (error) {
    console.error("Onboarding submit error:", error);
    res.status(500).json({ error: "Failed to save farm details" });
  }
});

router.put("/profile", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, phone, location, county, farmName } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;

    // Mark profile as complete if key fields are filled
    if (name && phone) {
      updateData.profileComplete = true;
    }

    const user = await prisma.user.update({ where: { id: userId }, data: updateData });

    // Update farm if provided
    if (farmName || location || county) {
      const member = await prisma.farmMember.findFirst({ where: { userId } });
      if (member) {
        await prisma.farm.update({ where: { id: member.farmId }, data: {
          name: farmName || undefined,
          location: location || undefined,
          county: county || undefined,
        }});
      }
    }

    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, profileComplete: user.profileComplete },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// POST /api/auth/send-verification
// Generates a 6-digit code, stores it, emails it via the backend's SMTP.
router.post("/send-verification", async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      // Don't reveal whether the email exists
      return res.json({ message: "If that email is registered, a code has been sent." });
    }
    if (user.emailVerified) {
      return res.json({ message: "Email is already verified." });
    }

    const result = await issueVerificationCode(user);

    res.json({
      message: result.ok
        ? "Verification code sent to your email."
        : "Email delivery failed — use the code shown below.",
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  } catch (error) {
    console.error("Send verification error:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/verify-email
// OTP brute-force protection: max 5 failed attempts per code, then the code
// is invalidated and the farmer must request a fresh one. (Pentest finding:)
// without this, a 6-digit code could be brute-forced since there's no
// per-code attempt counter and the general limiter allows 100 req/15min.
const OTP_MAX_ATTEMPTS = 5;

router.post("/verify-email", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(400).json({ error: "Invalid code" });
    if (user.emailVerified) return res.json({ message: "Email is already verified." });

    const verification = await prisma.verificationCode.findFirst({
      where: { userId: user.id, purpose: "email_verification", usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!verification) {
      return res.status(400).json({ error: "No verification code found. Please request a new one." });
    }
    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ error: "Code has expired. Please request a new one." });
    }
    if (verification.code !== String(code)) {
      const attempts = (verification.attempts ?? 0) + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        // Burn the code — brute-forcing is no longer possible.
        await prisma.verificationCode.update({ where: { id: verification.id }, data: { usedAt: new Date(), attempts } });
        return res.status(400).json({ error: "Too many wrong attempts. Please request a new code." });
      }
      await prisma.verificationCode.update({ where: { id: verification.id }, data: { attempts } });
      return res.status(400).json({ error: `Invalid code. ${OTP_MAX_ATTEMPTS - attempts} attempt${OTP_MAX_ATTEMPTS - attempts === 1 ? "" : "s"} left.` });
    }

    await prisma.$transaction([
      prisma.verificationCode.update({ where: { id: verification.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }),
    ]);

    // Verification completes the login — issue the session immediately so the
    // farmer doesn't have to re-enter credentials. Same shape as /login.
    const member = await prisma.farmMember.findFirst({ where: { userId: user.id } });
    const farmId = member?.farmId || null;
    const token = await generateToken(user.id, farmId);

    res.json({
      message: "Email verified successfully!",
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      farmId,
    });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ─── Two-factor authentication (authenticator app) for farmers ───
// Same TOTP machinery as the admin MFA, exposed on the user's own routes.

// GET /api/auth/mfa/status — whether 2FA is enabled for the logged-in user.
router.get("/mfa/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } });
    res.json({ enabled: !!user?.totpEnabledAt });
  } catch (error) {
    console.error("MFA status error:", error);
    res.status(500).json({ error: "Failed to check 2FA status" });
  }
});

// POST /api/auth/mfa/setup — generate a pending secret + otpauth URI.
// Not enabled until /mfa/verify confirms a live code from the app.
router.post("/mfa/setup", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, totpEnabledAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.totpEnabledAt) return res.status(409).json({ error: "Two-factor is already enabled — disable it first to re-enroll" });

    const secret = generateSecret();
    await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    const uri = otpauthUri(secret, user.email, "Wangari");
    res.json({ secret, uri }); // client renders the QR from this
  } catch (error) {
    console.error("MFA setup error:", error);
    res.status(500).json({ error: "Failed to start 2FA setup" });
  }
});

// POST /api/auth/mfa/verify — confirm a live code, enable 2FA, return
// recovery codes ONCE (stored hashed).
router.post("/mfa/verify", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const code = String(req.body?.code || "");
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    if (!user?.totpSecret) return res.status(400).json({ error: "Start 2FA setup first" });
    if (user.totpEnabledAt) return res.status(409).json({ error: "Two-factor is already enabled" });
    if (!verifyTotp(user.totpSecret, code)) {
      return res.status(401).json({ error: "That code doesn't match — check your authenticator app and try again" });
    }
    const { plain, hashed } = generateRecoveryCodes(8);
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date(), recoveryCodes: JSON.stringify(hashed) },
    });
    res.json({ enabled: true, recoveryCodes: plain }); // plaintext shown exactly once
  } catch (error) {
    console.error("MFA verify error:", error);
    res.status(500).json({ error: "Failed to enable 2FA" });
  }
});

// POST /api/auth/mfa/disable — requires the current password + a live code.
router.post("/mfa/disable", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { password, code } = req.body ?? {};
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, totpSecret: true, totpEnabledAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.totpEnabledAt) return res.status(400).json({ error: "Two-factor is not enabled" });
    if (!password || !user.password || !(await bcrypt.compare(String(password), user.password))) {
      return res.status(401).json({ error: "Password is incorrect" });
    }
    if (!user.totpSecret || !verifyTotp(user.totpSecret, String(code || ""))) {
      return res.status(401).json({ error: "Invalid authenticator code" });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null },
    });
    res.json({ enabled: false });
  } catch (error) {
    console.error("MFA disable error:", error);
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

export default router;
