/**
 * HTML email templates for Wangari.
 * All templates use inline styles for maximum email client compatibility.
 * Email clients cannot resolve CSS variables, so the palette comes from the
 * JS mirror of @theme (enforced by theme-palette.test.ts).
 */

import { THEME } from "./theme-palette";

const BRAND = {
  name: "Wangari",
  color: THEME["wangari-green-800"],
  bgColor: THEME["wangari-green-50"],
  textColor: THEME["wangari-text"],
  mutedColor: THEME["wangari-muted"],
  borderColor: THEME["wangari-border"],
  logoUrl: "https://wangari.imeantech.com/logo.png",
};

function wrap(body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND.color};padding:24px 32px;text-align:center;">
              <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">🌿 ${BRAND.name}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid ${BRAND.borderColor};text-align:center;">
              <p style="margin:0;font-size:11px;color:${BRAND.mutedColor};">
                © ${new Date().getFullYear()} ${BRAND.name} · imeantech.com<br/>
                This is a transactional email from your ${BRAND.name} account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Daily Farm Digest ────────────────────────────────────

export interface DigestAlert {
  icon: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "info" | "success";
}

export function dailyDigestEmail(userName: string, farmName: string, alerts: DigestAlert[], dashboardUrl: string): string {
  const toneColors: Record<DigestAlert["tone"], string> = {
    danger: "#dc2626",
    warning: "#d97706",
    info: "#2563eb",
    success: "#16a34a",
  };
  const toneBg: Record<DigestAlert["tone"], string> = {
    danger: "#fef2f2",
    warning: "#fffbeb",
    info: "#eff6ff",
    success: "#f0fdf4",
  };

  const alertRows = alerts.length === 0
    ? `<p style="margin:0;font-size:14px;color:${BRAND.mutedColor};">
         Nothing needs your attention today — your farm is running smoothly. 🌱
       </p>`
    : alerts.slice(0, 12).map((a) => `
      <tr>
        <td style="padding:10px 14px;background-color:${toneBg[a.tone]};border-radius:8px;margin-bottom:8px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:16px;width:28px;vertical-align:top;">${a.icon}</td>
            <td>
              <p style="margin:0;font-size:13px;font-weight:700;color:${toneColors[a.tone]};">${a.title}</p>
              <p style="margin:2px 0 0;font-size:12px;color:${BRAND.textColor};">${a.detail}</p>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`).join("");

  const today = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return wrap(`
    <h2 style="margin:0 0 4px;font-size:20px;color:${BRAND.textColor};">Good morning, ${userName} 👋</h2>
    <p style="margin:0 0 20px;font-size:13px;color:${BRAND.mutedColor};">${farmName} · ${today}</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${alertRows}
    </table>
    <div style="text-align:center;margin-top:24px;">
      <a href="${dashboardUrl}" style="display:inline-block;background-color:${BRAND.color};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">
        Open Dashboard →
      </a>
    </div>
    <p style="margin:20px 0 0;font-size:11px;color:${BRAND.mutedColor};text-align:center;">
      You receive this daily summary because you have a Wangari farm account.<br/>
      Turn it off anytime in Settings → Notifications.
    </p>
  `);
}

// ─── Confirmation Code ────────────────────────────────────

export function confirmationCodeEmail(code: string, purpose: string = "verification"): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND.textColor};">Your verification code</h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.mutedColor};">
      Use the code below to complete your ${purpose}. It expires in <strong>15 minutes</strong>.
    </p>
    <div style="background-color:${BRAND.bgColor};border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:${BRAND.color};font-family:monospace;">${code}</span>
    </div>
    <p style="margin:0;font-size:13px;color:${BRAND.mutedColor};">
      If you didn't request this, you can safely ignore this email.
    </p>
  `);
}

// ─── Password Reset ───────────────────────────────────────

export function passwordResetEmail(resetUrl: string): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND.textColor};">Reset your password</h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.mutedColor};">
      We received a request to reset the password on your ${BRAND.name} account. Click the button below to set a new one.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${resetUrl}" style="display:inline-block;background-color:${BRAND.color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:${BRAND.mutedColor};">
      This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email — your password will remain unchanged.
    </p>
    <p style="margin:0;font-size:12px;color:#5F6E85;word-break:break-all;">
      Button not working? Paste this URL into your browser:<br/>
      <a href="${resetUrl}" style="color:${BRAND.color};">${resetUrl}</a>
    </p>
  `);
}

// ─── Welcome ──────────────────────────────────────────────

export function welcomeEmail(userName: string, loginUrl: string): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND.textColor};">Welcome to ${BRAND.name}, ${userName}! 🎉</h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.mutedColor};">
      Your account is ready. ${BRAND.name} helps you run your whole farm — cattle, poultry, goats, fish, crops — track animals, monitor production, handle invoices, and more.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${loginUrl}" style="display:inline-block;background-color:${BRAND.color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            Go to Dashboard
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:${BRAND.mutedColor};">
      Need help getting started? Reply to this email and we'll guide you through.
    </p>
  `);
}

// ─── Subscription Confirmed ───────────────────────────────

export function subscriptionConfirmedEmail(userName: string, planName: string, expiresAt: string, dashboardUrl: string): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND.textColor};">You're subscribed! 🎉</h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.mutedColor};">
      Hi ${userName}, your <strong>${planName}</strong> plan is now active.
    </p>
    <div style="background-color:${BRAND.bgColor};border-radius:8px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${BRAND.mutedColor};">Plan</td>
          <td style="padding:6px 0;font-size:14px;font-weight:700;color:${BRAND.textColor};text-align:right;">${planName}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${BRAND.mutedColor};">Status</td>
          <td style="padding:6px 0;font-size:14px;font-weight:700;color:#16a34a;text-align:right;">✅ Active</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${BRAND.mutedColor};">Valid until</td>
          <td style="padding:6px 0;font-size:14px;font-weight:700;color:${BRAND.textColor};text-align:right;">${expiresAt}</td>
        </tr>
      </table>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td align="center">
          <a href="${dashboardUrl}" style="display:inline-block;background-color:${BRAND.color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            Go to Dashboard
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:${BRAND.mutedColor};">
      Your subscription will auto-renew. You can manage it anytime from Settings.
    </p>
  `);
}

// ─── Plan Expired ─────────────────────────────────────────

export function planExpiredEmail(userName: string, planName: string, renewUrl: string): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND.textColor};">Your plan has expired</h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.mutedColor};">
      Hi ${userName}, your <strong>${planName}</strong> subscription has expired. Some features are now limited.
    </p>
    <div style="background-color:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#991B1B;font-weight:600;">⚠️ Renew to keep full access</p>
      <p style="margin:6px 0 0;font-size:13px;color:#B91C1C;">Renew now to continue using all Wangari features without interruption.</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td align="center">
          <a href="${renewUrl}" style="display:inline-block;background-color:${BRAND.color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            Renew Now
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:${BRAND.mutedColor};">
      Your data remains safe — subscribe to restore full access.
    </p>
  `);
}

// ─── Invoice Sent (for farmers to send to their own customers)
// NOTE: This template is NOT sent from noreply@imeantech.com.
// Farmers use this when sending invoices from their own email.

export function invoiceEmail(customerName: string, invoiceNumber: string, amount: string, invoiceUrl: string): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${BRAND.textColor};">Invoice ${invoiceNumber}</h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.mutedColor};">
      Hi ${customerName}, here is your invoice.
    </p>
    <div style="background-color:${BRAND.bgColor};border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:${BRAND.mutedColor};">Total Amount</p>
      <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:${BRAND.color};">${amount}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${invoiceUrl}" style="display:inline-block;background-color:${BRAND.color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            View Invoice
          </a>
        </td>
      </tr>
    </table>
  `);
}
