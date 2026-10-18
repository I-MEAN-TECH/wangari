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
  {
    emoji: "🥔",
    subject: "Late blight destroyed 4 farms in Nyandarua — Kariuki saved his potatoes",
    headline: "High humidity and cool nights triggered the fungus. Kariuki was ready.",
    body: `Late blight can wipe out an entire acre of potatoes in 72 hours. When continuous rain hit Ol Kalou, Wangari's agro-weather engine issued a high-risk humidity alert to Joseph Kariuki.

He applied protective fungicide 24 hours before the rain intensified. While adjacent shambas lost up to 70% of foliage, Joseph's crop produced 110 bags per acre.`,
    farmer: "Joseph Kariuki, Nyandarua County",
    quote: "Listening to weather warnings on Wangari saved my family KES 180,000 this season.",
  },
  {
    emoji: "🐐",
    subject: "Fatuma stopped goat kid deaths with an automated deworming cycle",
    headline: "How automated health reminders saved 18 Boer cross kids.",
    body: `Internal parasites and coccidiosis are the number one killers of young goats in coastal Kenya. Fatuma registered her 35 dairy and meat goats in Wangari.

Every 60 days, Wangari sends an exact dewormer rotation alert (alternating active ingredients so worms don't become resistant). Kid mortality dropped to zero over the entire kidding season.`,
    farmer: "Fatuma Bakari, Kilifi County",
    quote: "My goats are clean and healthy. Meat buyers now pay top price without bargaining.",
  },
  {
    emoji: "🌱",
    subject: "Samuel slashed his water & electricity bills by 35% on drip irrigation",
    headline: "He was overwatering his tomatoes by 4 hours every week.",
    body: `Running water pumps with solar and diesel in Machakos is expensive. Samuel Maina was pumping every morning regardless of soil moisture.

Using Wangari's evapotranspiration estimator for his microclimate, he reduced pumping to exact crop water requirements. Fuel savings exceeded KES 6,500 every month, and tomato split defects reduced by half.`,
    farmer: "Samuel Maina, Machakos County",
    quote: "More water doesn't mean more tomatoes. Smart timing makes the money.",
  },
  {
    emoji: "☕",
    subject: "Nancy stopped tea weight disputes at the collection shed",
    headline: "Every kilo recorded on her phone with instant digital receipt.",
    body: `Nancy plucks 40 to 60 kg of green leaf daily in Kericho. At the collection shed, leaf clerks often wrote down hasty figures in worn counter-books.

Nancy logs her weigh-in right at the scale on Wangari. At month-end, her digital summary matched factory credit slips to the exact decimal, eliminating deduction discrepancies.`,
    farmer: "Nancy Chebet, Kericho County",
    quote: "Peace of mind at the factory pay-day is worth everything.",
  },
];

function getDailyStory(): (typeof STORIES)[number] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  return STORIES[dayOfYear % STORIES.length];
}

// ---------------------------------------------------------------------------
// HTML email builder — high converting, mobile responsive, trust-first
// ---------------------------------------------------------------------------
function buildMarketingEmailHtml(
  story: (typeof STORIES)[number],
  farmName: string,
  userEmail: string,
  unsubToken: string
): string {
  const baseUrl = process.env.FRONTEND_URL || "https://wangari.imeantech.com";
  const unsubUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(unsubToken)}&email=${encodeURIComponent(userEmail)}`;
  const waShareText = encodeURIComponent(`Nimesoma hii hadithi ya ${story.farmer} inayohusu Wangari: "${story.quote}". Tazama bure: ${baseUrl}/register`);
  const waShareUrl = `https://api.whatsapp.com/send?text=${waShareText}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${story.subject}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;">
  <div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${story.headline.slice(0, 100)} — Wangari Real Farmer Stories
  </div>
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.03);">
    
    <!-- Top Brand Bar -->
    <div style="background:#166534;padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="color:#bbf7d0;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Wangari · Hadithi ya Leo</span>
            <h2 style="color:#ffffff;margin:4px 0 0;font-size:18px;font-weight:800;">${story.emoji} Real Farmer Stories</h2>
          </td>
          <td align="right">
            <span style="display:inline-block;background:#15803d;color:#ffffff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;">
              Kenya 🇰🇪
            </span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Main Content -->
    <div style="padding:28px 24px;">
      <h1 style="font-size:21px;font-weight:800;color:#0f172a;line-height:1.35;margin:0 0 16px;">
        ${story.headline}
      </h1>

      <div style="font-size:15px;color:#334155;line-height:1.65;margin-bottom:24px;">
        ${story.body.split("\n\n").map(p => `<p style="margin:0 0 14px;">${p}</p>`).join("")}
      </div>

      <!-- Testimonial Quote Callout -->
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 12px 12px 0;padding:16px 20px;margin:24px 0;">
        <p style="font-style:italic;color:#14532d;font-size:14px;font-weight:600;margin:0 0 6px;">
          "${story.quote}"
        </p>
        <p style="color:#166534;font-size:12px;font-weight:700;margin:0;">
          — ${story.farmer}
        </p>
      </div>

      <!-- Share on WhatsApp with a friend -->
      <div style="text-align:center;margin:20px 0;">
        <a href="${waShareUrl}" style="display:inline-block;background:#25d366;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 20px;border-radius:8px;box-shadow:0 1px 4px rgba(37,211,102,0.2);">
          📲 Forward Story to Farmer Friend on WhatsApp
        </a>
      </div>

      <!-- Upgrade Card for the User's Farm -->
      <div style="background:linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);border:1px solid #bbf7d0;border-radius:14px;padding:22px;text-align:center;margin-top:28px;">
        <p style="margin:0 0 6px;font-size:17px;font-weight:800;color:#14532d;">
          Give ${farmName} the same advantage
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#166534;line-height:1.5;">
          Unlock automated WhatsApp & SMS alerts, veterinary vaccination schedules, feed stock-out forecasting, and digital milk receipts.
        </p>
        <a href="${baseUrl}/subscription" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 30px;border-radius:9px;box-shadow:0 3px 10px rgba(22,101,52,0.25);">
          Upgrade to Starter (KES 499 / mwezi) →
        </a>
        <p style="margin:12px 0 0;font-size:11px;color:#4d7c0f;font-weight:600;">
          ✓ Lipa na M-Pesa · ✓ Instant activation · ✓ Cancel anytime
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #f1f5f9;padding:18px 24px;text-align:center;font-size:11px;color:#94a3b8;">
      <p style="margin:0 0 4px;font-weight:600;color:#64748b;">Wangari — Smart Farm Management · Nairobi, Kenya</p>
      <p style="margin:0 0 4px;">
        You're receiving this daily story as a Wangari Free Core member.
      </p>
      <p style="margin:0;">
        <a href="${unsubUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe from daily stories</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

function buildMarketingEmailText(
  story: (typeof STORIES)[number],
  farmName: string,
  userEmail: string,
  unsubToken: string
): string {
  const baseUrl = process.env.FRONTEND_URL || "https://wangari.imeantech.com";
  const unsubUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(unsubToken)}&email=${encodeURIComponent(userEmail)}`;
  return `${story.headline}\n\n${story.body.replace(/<[^>]+>/g, "")}\n\n"${story.quote}" — ${story.farmer}\n\nGive ${farmName} the same advantage:\nUpgrade to Starter (KES 499/mo) at ${baseUrl}/subscription\n\nUnsubscribe: ${unsubUrl}`;
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
      const text = buildMarketingEmailText(
        story,
        farm.name || "Your Farm",
        user.email,
        user.resetToken || String(user.id)
      );

      const res = await sendEmail({
        to: user.email,
        subject: story.subject,
        html,
        text,
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
    }
  }

  return { sent, skipped, failed };
}
