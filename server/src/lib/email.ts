import { prisma } from "../db.js";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * Transactional email — SMTP first (Mailbux noreply mailbox), Resend fallback.
 * Plain-fetch Resend, no SDK. Behavior:
 *  - SMTP_HOST+SMTP_USER set   → send via SMTP (nodemailer); preferred path.
 *  - Else RESEND_API_KEY set   → send via Resend REST API.
 *  - Neither configured        → send is skipped, EmailLog row records "failed"
 *    with a clear error. App never breaks because email is down.
 * Every attempt is logged to email_logs (the admin Email Ops module reads it).
 */

const RESEND_API = "https://api.resend.com/emails";
const FROM = process.env.EMAIL_FROM || "Wangari <noreply@imeantech.com>";

// SMTP transport (created lazily once; only when SMTP env is configured).
// pool: true keeps a warm connection open between sends — verification codes
// skip the ~1.5s TCP+STARTTLS+AUTH handshake when sent shortly after another
// email. Nodemailer closes the pooled connection automatically after 10 min
// of inactivity (socketTimeout) or when maxMessages is reached, and it
// transparently reconnects on the next send, so stale connections are never
// a problem. Pool-level 'error' events (idle socket dropped by Mailbux) are
// swallowed — the next send simply opens a fresh connection.
let smtpTransport: Transporter | null = null;
let smtpAttempted = false;
function getSmtp(): Transporter | null {
  if (smtpAttempted) return smtpTransport;
  smtpAttempted = true;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  smtpTransport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true", // true = port 465 implicit TLS; false = 587 STARTTLS
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100, // recycle each connection after 100 emails
    socketTimeout: 10 * 60 * 1000, // drop idle sockets after 10 min (Mailbux default NOOP window is safe)
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  smtpTransport.on("error", () => {
    // Idle pooled connection dropped by the server etc. — nodemailer
    // re-establishes the connection on the next send automatically.
  });
  return smtpTransport;
}

export interface EmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text alternative — improves deliverability
  template: string; // receipt | ticket_reply | announcement | oneoff
  userId?: number | null;
}

export interface EmailResult {
  ok: boolean;
  provider: "smtp" | "resend" | null;
  error: string | null;
}

export function wrapHtml(title: string, bodyHtml: string, options?: { previewText?: string; ctaText?: string; ctaUrl?: string }): string {
  const preview = options?.previewText ? `<div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.previewText}</div>` : "";
  const ctaButton = options?.ctaText && options?.ctaUrl ? `
    <div style="margin:24px 0 12px;text-align:center;">
      <a href="${options.ctaUrl}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 32px;border-radius:10px;box-shadow:0 2px 6px rgba(22,101,52,0.25);">
        ${options.ctaText}
      </a>
    </div>` : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;">
  ${preview}
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.03);">
    <!-- Header -->
    <div style="background:#166534;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="color:#ffffff;font-weight:800;font-size:20px;letter-spacing:-0.5px;">🌾 Wangari</span>
            <span style="display:inline-block;margin-left:8px;background:#15803d;color:#bbf7d0;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">Kilimo Bora</span>
          </td>
          <td align="right">
            <span style="color:#86efac;font-size:12px;font-weight:600;">wangari.imeantech.com</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Body -->
    <div style="padding:28px 28px 24px;">
      <h2 style="margin:0 0 14px;font-size:19px;font-weight:800;color:#0f172a;line-height:1.35;">${title}</h2>
      ${bodyHtml}
      ${ctaButton}
    </div>

    <!-- Referral & Community Banner -->
    <div style="background:#f0fdf4;border-top:1px solid #dcfce7;padding:16px 28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#166534;">
        🤝 Alika Jirani — Invite a Farmer Friend
      </p>
      <p style="margin:0;font-size:12px;color:#15803d;line-height:1.4;">
        Give a neighbouring farmer 14 days free Starter. When they upgrade, your farm gets 1 free month!
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center;">
      <p style="margin:0 0 4px;">Wangari Farm Management Platform · Nairobi & Nakuru, Kenya</p>
      <p style="margin:0;">
        Need help? Reply to this email or chat with our team on WhatsApp: <strong>+254 700 000 000</strong>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export const emailTemplates = {
  welcome(userName: string, farmName: string, farmCode: string, appUrl: string): { subject: string; html: string; text: string } {
    const refLink = `${appUrl}/register?ref=${farmCode}`;
    const waShareText = encodeURIComponent(`Habari! Nimekuwa nikitumia Wangari kusimamia shamba langu na mifugo. Jaribu bure hapa: ${refLink}`);
    const waShareUrl = `https://api.whatsapp.com/send?text=${waShareText}`;

    return {
      subject: `Karibu Wangari! 🌾 Your farm setup is ready, ${userName}`,
      html: wrapHtml(
        `Karibu kwenye Wangari, ${userName}! 🌿`,
        `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px;">
          Congratulations on creating <strong>${farmName}</strong>! You've joined thousands of smart farmers who use Wangari to stop losing money to feed waste, missed vaccines, and cooperative milk errors.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:20px 0;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:800;color:#0f172a;">⚡ 3 Quick Steps to Get Value Today:</p>
          <div style="margin-bottom:10px;font-size:13px;color:#334155;">
            <strong>1. Add your animals or crops</strong> — Enter your cows or flock to get automated vaccination and heat alerts.
          </div>
          <div style="margin-bottom:10px;font-size:13px;color:#334155;">
            <strong>2. Log today's morning delivery</strong> — Record your milk or egg collection to track exact amounts owed.
          </div>
          <div style="font-size:13px;color:#334155;">
            <strong>3. Download your digital statement</strong> — Show your co-op clerk a tamper-proof timestamped delivery log.
          </div>
        </div>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;">Your Farm Code</p>
          <p style="margin:0 0 10px;font-size:22px;font-weight:800;color:#14532d;font-family:monospace;letter-spacing:1px;">${farmCode}</p>
          <a href="${waShareUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:8px 18px;border-radius:8px;">
            📲 Share with Neighbour on WhatsApp
          </a>
        </div>`,
        {
          previewText: `Welcome to Wangari! 3 quick steps to save money on feed and co-op deliveries.`,
          ctaText: "Open My Farm Dashboard →",
          ctaUrl: `${appUrl}/dashboard`,
        }
      ),
      text: `Karibu Wangari, ${userName}!\n\nYour farm ${farmName} is ready (Farm Code: ${farmCode}).\n\nStart logging your milk and egg deliveries today at ${appUrl}/dashboard\n\nShare with a fellow farmer: ${refLink}`,
    };
  },

  verificationCode(code: string): { subject: string; html: string; text: string } {
    return {
      subject: `Your Wangari verification code is ${code}`,
      html: wrapHtml(
        "Verify your email address",
        `<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
          Use the 6-digit security code below to complete your Wangari farm setup. It expires in <strong>15 minutes</strong>.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
          <span style="font-size:36px;font-weight:800;letter-spacing:6px;color:#166534;font-family:monospace;">${code}</span>
        </div>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b;">
          If you didn't create an account with Wangari, you can safely ignore this email.
        </p>
        <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:12px;font-size:12px;color:#92400e;">
          💡 <strong>Tip:</strong> If this email landed in Spam, tap <strong>"Not spam"</strong> so future morning reports and livestock alerts reach your inbox.
        </div>`,
        { previewText: `Your 6-digit Wangari security code: ${code}` }
      ),
      text: `Your Wangari verification code is ${code}. It expires in 15 minutes.\n\nTip: if this email landed in Spam, tap "Not spam" so future farm alerts reach your inbox.`,
    };
  },

  passwordReset(resetUrl: string): { subject: string; html: string; text: string } {
    return {
      subject: "Reset your Wangari password",
      html: wrapHtml(
        "Reset your password",
        `<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
          We received a request to reset your Wangari password. Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.
        </p>
        <div style="margin:24px 0;text-align:center;">
          <a href="${resetUrl}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 32px;border-radius:10px;">
            Reset My Password →
          </a>
        </div>
        <p style="margin:0 0 8px;font-size:12px;color:#64748b;">
          Or copy and paste this link into your browser:<br/>
          <span style="word-break:break-all;color:#166534;">${resetUrl}</span>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
          Didn't request a reset? You can safely ignore this email — your account remains completely secure.
        </p>`,
        { previewText: "Reset your Wangari farm password (link expires in 1 hour)" }
      ),
      text: `Reset your Wangari password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    };
  },

  receipt(amountKes: number, planName: string, expiresAt: Date): { subject: string; html: string } {
    return {
      subject: `Payment receipt — ${planName} (KES ${amountKes.toLocaleString()})`,
      html: wrapHtml(
        "Payment received — Thank you! 🎉",
        `<p style="color:#334155;font-size:15px;line-height:1.6;">
          Your payment for <strong>${planName}</strong> was successful. All premium features (automated SMS reminders, full flock health records, feed calculators, and AI agronomy) are now active.
        </p>
        <table style="width:100%;font-size:14px;color:#334155;margin:16px 0;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748B;">Amount Paid</td><td style="text-align:right;font-weight:800;color:#166534;">KES ${amountKes.toLocaleString()}</td></tr>
          <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748B;">Plan</td><td style="text-align:right;font-weight:700;">${planName}</td></tr>
          <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#64748B;">Valid Until</td><td style="text-align:right;font-weight:700;">${expiresAt.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</td></tr>
          <tr><td style="padding:8px 0;color:#64748B;">Status</td><td style="text-align:right;font-weight:700;color:#16a34a;">✓ Active</td></tr>
        </table>
        <p style="color:#64748B;font-size:13px;">You can view and download past payment receipts anytime in your Subscription settings.</p>`
      ),
    };
  },

  ticketReply(ticketId: number, subject: string, replyBody: string): { subject: string; html: string } {
    return {
      subject: `Re: [Ticket #${ticketId}] ${subject}`,
      html: wrapHtml(
        `New reply on ticket #${ticketId}`,
        `<p style="color:#334155;font-size:14px;line-height:1.6;">Support replied to your request <strong>"${subject}"</strong>:</p>
         <blockquote style="margin:12px 0;padding:12px 16px;background:#f0fdf4;border-left:3px solid #166534;color:#334155;font-size:14px;line-height:1.6;">${replyBody}</blockquote>
         <p style="color:#64748B;font-size:13px;">Reply from your dashboard's Help section to continue the conversation.</p>`
      ),
    };
  },
};

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const smtp = getSmtp();
  const provider: "smtp" | "resend" | null = smtp ? "smtp" : apiKey ? "resend" : null;
  let status = "failed";
  let providerId: string | null = null;
  let error: string | null = null;

  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from: FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      status = "sent";
      providerId = info.messageId || null;
    } catch (e: any) {
      error = e?.message || "SMTP send failed";
    }
  }

  if (!smtp && !apiKey) {
    error = "No email provider configured (SMTP_HOST/RESEND_API_KEY)";
  }

  if (provider === "resend") {
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        status = "sent";
        providerId = data.id;
      } else {
        error = data?.message || `HTTP ${res.status}`;
      }
    } catch (e: any) {
      error = e?.message || "network error";
    }
  }

  try {
    await prisma.emailLog.create({
      data: {
        to: input.to,
        subject: input.subject,
        template: input.template,
        status,
        provider,
        providerId,
        error,
        userId: input.userId ?? null,
      },
    });
  } catch (e) {
    console.error("[email] failed to log:", e);
  }
  if (status === "failed") console.warn(`[email] ${input.template} to ${input.to} failed: ${error}`);
  return { ok: status === "sent", provider, error };
}
