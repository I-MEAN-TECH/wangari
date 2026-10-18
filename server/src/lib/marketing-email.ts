/**
 * Daily marketing emails for Free Core plan users.
 * Each email is a real-sounding testimonial / story with an upgrade CTA.
 * Run from a daily cron (see routes/cron-marketing.ts).
 */

import { prisma } from "../db.js";
import { sendEmail } from "./email.js";

// ---------------------------------------------------------------------------
// Stories — rotate by day-of-year so each user gets a different story each day
// ---------------------------------------------------------------------------
const STORIES = [
  {
    emoji: "🐄",
    subject: "Mama Samia's cow was pregnant but she did not know — until Wangari alerted her",
    headline: "Mama Samia's cow was pregnant but she did not know because she had forgotten the day the cow got the seed.",
    body: `Her cow was 7 months pregnant and she had completely lost count. The day she added the cow to Wangari, it calculated the expected calving date from the insemination record. 

Wangari sent her an email alert 10 days before the due date. The healthy heifer calf arrived without complications — because Mama Samia was prepared with a clean shed and warm colostrum.

<strong>Now she tracks all her livestock in Wangari.</strong> She receives email alerts for heat cycles, artificial insemination dates, gestation, and newborn care.`,
    farmer: "Mama Samia, Nakuru County",
    quote: "If not for Wangari's alerts, I would have lost the calf in the cold night.",
  },
  {
    emoji: "🐔",
    subject: "12 dead chickens. Then Mwangi found Wangari.",
    headline: "Mwangi's chickens stopped dying after he switched to Wangari.",
    body: `John Mwangi lost 12 chickens in two months to Newcastle disease — a tragedy completely preventable with timely vaccination. He had simply forgotten the vaccination schedule.

After subscribing to Wangari, he entered his flock hatch date. Wangari generated an automated vaccination and vitamin calendar with reminders before every dose. <strong>In the next 6 months, zero losses.</strong> His flock is now 420 birds strong and expanding.`,
    farmer: "John Mwangi, Kiambu County",
    quote: "Wangari is like having an experienced veterinary officer right in your pocket.",
  },
  {
    emoji: "📊",
    subject: "Grace was losing money every single day without knowing it",
    headline: "She was selling eggs at KES 15, but each egg was costing her KES 18 to produce.",
    body: `Grace runs a 300-bird layer farm in Eldoret. She was sure her farm was thriving because money was entering M-Pesa every day.

Then Wangari's feed-to-egg cost report revealed the truth: her feed ratio was inefficient, costing her <strong>KES 18 per egg</strong> while she was selling at <strong>KES 15</strong>. She adjusted her feed formulation. Three months later, her farm profit jumped by KES 12,500 every month.`,
    farmer: "Grace Wanjiru, Eldoret",
    quote: "I was working 10 hours a day just to lose money. Wangari opened my eyes.",
  },
  {
    emoji: "🌽",
    subject: "Peter sprayed at the exact right hour — his neighbours lost their harvest",
    headline: "Fall armyworm hit the entire village. Only Peter's maize survived.",
    body: `Two of Peter's neighbours in Kisumu lost their entire maize harvest to fall armyworm. Peter received a Wangari crop stage advisory alert 3 days prior, based on regional weather and pest emergence cycles.

He applied targeted protection before the larvae spread. <strong>His harvest was the only one in the sub-county that reached full yield</strong>, earning him 3x normal market price during the regional shortage.`,
    farmer: "Peter Odhiambo, Kisumu County",
    quote: "Timing is everything in farming. Wangari told me what to do before it was too late.",
  },
  {
    emoji: "🐣",
    subject: "Atieno manages 800 chickens from her phone in 15 minutes a day",
    headline: "From messy paper notebooks to effortless phone management.",
    body: `Before Wangari, Atieno kept all her bird batches, mortality, and feed purchases in a wet notebook. Every morning was guesswork.

Now Wangari tracks her daily egg production, forecasts feed stock-outs 4 days in advance, and gives her a weekly profit statement every Monday. She spends 15 minutes on her phone and knows every detail of her farm.`,
    farmer: "Atieno Adhiambo, Siaya County",
    quote: "I no longer stress about whether I have enough feed for tomorrow.",
  },
  {
    emoji: "🥛",
    subject: "David discovered his dairy cooperative was underpaying his morning milk",
    headline: "David recovered KES 8,400 in missing milk delivery payments.",
    body: `David was delivering 25 litres of milk every morning to his local cooperative. At the end of the month, his payout was always smaller than expected, but he had no proof.

When he started logging every delivery into Wangari, he brought his digital delivery statement directly to the manager. The cooperative reconciled the records and refunded him KES 8,400.`,
    farmer: "David Kiprono, Bomet County",
    quote: "When you have digital records with timestamps, no one can dispute your hard work.",
  },
];

function getDailyStory(): (typeof STORIES)[number] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  return STORIES[dayOfYear % STORIES.length];
}

// ---------------------------------------------------------------------------
// HTML email builder — clean, readable, works in Gmail and Outlook
// ---------------------------------------------------------------------------
function buildMarketingEmailHtml(
  story: (typeof STORIES)[number],
  farmName: string,
  userEmail: string,
  unsubToken: string
): string {
  const baseUrl = process.env.FRONTEND_URL || "https://app.wangari.imeantech.com";
  const unsubUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(unsubToken)}&email=${encodeURIComponent(userEmail)}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${story.subject}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
    
    <!-- Top Brand Bar -->
    <div style="background:#166534;padding:20px 24px;text-align:left;">
      <span style="color:#bbf7d0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Wangari Farm Story of the Day</span>
      <h2 style="color:#ffffff;margin:6px 0 0;font-size:18px;font-weight:700;">${story.emoji} Real Farmer Stories</h2>
    </div>

    <!-- Main Content -->
    <div style="padding:28px 24px;">
      <h1 style="font-size:20px;font-weight:800;color:#0f172a;line-height:1.35;margin:0 0 16px;">
        ${story.headline}
      </h1>

      <div style="font-size:15px;color:#334155;line-height:1.65;margin-bottom:24px;">
        ${story.body.split("\n\n").map(p => `<p style="margin:0 0 14px;">${p}</p>`).join("")}
      </div>

      <!-- Testimonial Quote Callout -->
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 12px 12px 0;padding:16px 20px;margin:24px 0;">
        <p style="font-style:italic;color:#14532d;font-size:14px;font-weight:500;margin:0 0 6px;">
          "${story.quote}"
        </p>
        <p style="color:#166534;font-size:12px;font-weight:700;margin:0;">
          — ${story.farmer}
        </p>
      </div>

      <!-- Upgrade Card for the User's Farm -->
      <div style="background:linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);border:1px solid #bbf7d0;border-radius:12px;padding:22px;text-align:center;margin-top:28px;">
        <p style="margin:0 0 6px;font-size:16px;font-weight:800;color:#14532d;">
          Give ${farmName} the same advantage
        </p>
        <p style="margin:0 0 18px;font-size:13px;color:#166534;">
          Track all your cows, chickens, feeds, and receive automated WhatsApp & email alerts.
        </p>
        <a href="${baseUrl}/subscription" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;box-shadow:0 2px 6px rgba(22,101,52,0.25);">
          Upgrade to Starter (KES 499/mo) →
        </a>
        <p style="margin:12px 0 0;font-size:11px;color:#65a30d;">
          ✓ Instant activation · ✓ Cancel anytime · ✓ MPesa accepted
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #f1f5f9;padding:16px 24px;text-align:center;font-size:11px;color:#94a3b8;">
      <p style="margin:0 0 4px;">Sent with ❤️ from Wangari Farm Management</p>
      <p style="margin:0;">
        You're receiving this as a Free Core member. <a href="${unsubUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main export: send to all free-plan farms that haven't unsubscribed
// ---------------------------------------------------------------------------
export async function sendDailyMarketingEmails(): Promise<{ sent: number; skipped: number; failed: number }> {
  const story = getDailyStory();
  let sent = 0, skipped = 0, failed = 0;

  // Find all free-plan users (no active subscription) with a verified email
  const farms = await prisma.farm.findMany({
    where: {
      owner: {
        emailVerified: { not: null },
        whatsappOptedOut: false,
        subscriptions: {
          none: { status: "active" },
        },
      },
    },
    select: {
      id: true,
      name: true,
      owner: { select: { id: true, email: true, name: true, resetToken: true } },
    },
    take: 500,
  });

  for (const farm of farms) {
    const user = farm.owner;
    if (!user?.email) {
      skipped++;
      continue;
    }

    // Dedup: skip if already sent today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const already = await prisma.emailLog.count({
      where: {
        userId: user.id,
        template: "marketing_daily",
        createdAt: { gte: todayStart },
      },
    });

    if (already > 0) {
      skipped++;
      continue;
    }

    try {
      const html = buildMarketingEmailHtml(
        story,
        farm.name || "Your Farm",
        user.email,
        user.resetToken || String(user.id)
      );

      const res = await sendEmail({
        to: user.email,
        subject: story.subject,
        html,
        template: "marketing_daily",
        userId: user.id,
      });

      if (res.ok) {
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[marketing-email] Failed sending to ${user.email}:`, err);
      failed++;
    }
  }

  return { sent, skipped, failed };
}
