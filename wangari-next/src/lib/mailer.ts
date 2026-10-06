/**
 * Email utility using Mailbux SMTP.
 * Sends transactional emails: verification, welcome, password reset, subscription.
 */
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'my.mailbux.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const FROM = process.env.SMTP_FROM || 'Wangari <noreply@imeantech.com>';
const FRONTEND = process.env.FRONTEND_URL || 'https://wangari.imeantech.com';

// ─── Email wrapper (shared HTML shell) ────────────────────
function wrap(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><tr><td style="background:#166534;padding:24px 32px;text-align:center;"><span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">🌿 Wangari</span></td></tr><tr><td style="padding:32px;">${body}</td></tr><tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;"><p style="margin:0;font-size:11px;color:#64748b;">© ${new Date().getFullYear()} Wangari · imeantech.com<br/>This is a transactional email from your Wangari account.</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendWelcomeEmail(name: string, email: string) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#0F172A;">Welcome to Wangari, ${name}! 🎉</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;">Your account is ready. You have a <strong>14-day free trial</strong> to explore all features.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center"><a href="${FRONTEND}/dashboard" style="display:inline-block;background:#166534;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Go to Dashboard</a></td></tr></table>
    <p style="margin:0;font-size:13px;color:#64748b;">Need help? Reply to this email and we'll guide you through.</p>
  `);
  await transporter.sendMail({ from: FROM, to: email, subject: 'Welcome to Wangari! 🌿', html });
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const resetUrl = `${FRONTEND}/reset-password?token=${resetToken}`;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#0F172A;">Reset your password</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center"><a href="${resetUrl}" style="display:inline-block;background:#166534;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Reset Password</a></td></tr></table>
    <p style="margin:0;font-size:13px;color:#64748b;">If you didn't request this, you can safely ignore this email.</p>
    <p style="margin:8px 0 0;font-size:12px;color:#5F6E85;word-break:break-all;">Button not working? Paste this URL: <a href="${resetUrl}" style="color:#166534;">${resetUrl}</a></p>
  `);
  await transporter.sendMail({ from: FROM, to: email, subject: 'Reset your Wangari password', html });
}

export async function sendVerificationCodeEmail(email: string, code: string) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#0F172A;">Your verification code</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;">Use the code below. It expires in <strong>15 minutes</strong>.</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;"><span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#166534;font-family:monospace;">${code}</span></div>
    <p style="margin:0;font-size:13px;color:#64748b;">If you didn't request this, ignore this email.</p>
  `);
  await transporter.sendMail({ from: FROM, to: email, subject: `Your Wangari verification code: ${code}`, html });
}

export async function sendSubscriptionConfirmedEmail(email: string, name: string, planName: string, expiresAt: string) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#0F172A;">You're subscribed! 🎉</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;">Hi ${name}, your <strong>${planName}</strong> plan is now active.</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin-bottom:24px;"><table width="100%"><tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Plan</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#0F172A;text-align:right;">${planName}</td></tr><tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Status</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#16a34a;text-align:right;">✅ Active</td></tr><tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Valid until</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#0F172A;text-align:right;">${expiresAt}</td></tr></table></div>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="${FRONTEND}/dashboard" style="display:inline-block;background:#166534;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Go to Dashboard</a></td></tr></table>
  `);
  await transporter.sendMail({ from: FROM, to: email, subject: `${planName} subscription confirmed — Welcome to Wangari!`, html });
}

export async function sendPlanExpiredEmail(email: string, name: string, planName: string) {
  const renewUrl = `${FRONTEND}/subscription`;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#0F172A;">Your plan has expired</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;">Hi ${name}, your <strong>${planName}</strong> subscription has expired.</p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:24px;"><p style="margin:0;font-size:14px;color:#991B1B;font-weight:600;">⚠️ Renew to keep full access</p></div>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="${renewUrl}" style="display:inline-block;background:#166534;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Renew Now</a></td></tr></table>
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Your data remains safe — subscribe to restore full access.</p>
  `);
  await transporter.sendMail({ from: FROM, to: email, subject: `Your ${planName} subscription has expired`, html });
}

export async function sendTrialWarningEmail(email: string, name: string, daysLeft: number) {
  const renewUrl = `${FRONTEND}/subscription`;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#0F172A;">Your trial ends in ${daysLeft} days</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;">Hi ${name}, your free trial will expire soon. Subscribe now to keep full access.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="${renewUrl}" style="display:inline-block;background:#166534;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Subscribe Now</a></td></tr></table>
  `);
  await transporter.sendMail({ from: FROM, to: email, subject: `Your Wangari trial ends in ${daysLeft} days`, html });
}
