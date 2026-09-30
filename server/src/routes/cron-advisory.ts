import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { sendEmail } from "../lib/email.js";

/**
 * GET /api/cron/farm-advisory — daily "what's happening" email.
 *
 * Every morning each farm owner receives one email with:
 *   1. Season-aware planting advisory (Kenya's long rains / short rains /
 *      dry season) — what to plant NOW, what to prepare, what to avoid.
 *   2. A 7-day rain outlook for the farm's own location (Open-Meteo, free).
 *   3. Real Kenyan agri news headlines pulled live from Kilimo News and
 *      FarmBiz Africa RSS feeds — prices, weather warnings, policy, markets.
 * A matching in-app banner notification is created per farm (deduped daily).
 *
 * Triggered daily via Vercel Cron → Next.js proxy (same pattern as digest).
 */

const router = Router();

const NEWS_FEEDS: { name: string; url: string; region: "kenya" | "world" }[] = [
  // Kenya (local agri press). allAfrica is the reliable primary — verified
  // reachable from the VPS; Kilimo/FarmBiz sometimes block datacenter IPs.
  { name: "allAfrica Agriculture", url: "https://allafrica.com/tools/headlines/rdf/agriculture/headlines.rdf", region: "kenya" },
  { name: "Kilimo News", url: "https://kilimonews.co.ke/feed/", region: "kenya" },
  { name: "FarmBiz Africa", url: "https://www.farmbizafrica.com/feed", region: "kenya" },
  // World (free, no API key): Google News RSS, global agriculture + food security.
  { name: "Google News — World Farming", url: "https://news.google.com/rss/search?q=global+agriculture+OR+farming+OR+%22food+security%22+when:3d&hl=en-US&gl=US&ceid=US:en", region: "world" },
];

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: Date | null;
  region: "kenya" | "world";
  risk?: string;
}

// Farmer-risk keywords — when a headline matches, it gets a red ALERT badge
// so warnings (aflatoxin, armyworm, drought…) can't be missed.
const RISK_KEYWORDS: { kw: string; label: string }[] = [
  { kw: "aflatoxin", label: "AFLATOXIN" },
  { kw: "armyworm", label: "ARMYWORM" },
  { kw: "locust", label: "LOCUSTS" },
  { kw: "drought", label: "DROUGHT" },
  { kw: "flood", label: "FLOODS" },
  { kw: "frost", label: "FROST" },
  { kw: "disease outbreak", label: "OUTBREAK" },
  { kw: "quarantine", label: "QUARANTINE" },
  { kw: "price crash", label: "PRICE DROP" },
  { kw: "ban", label: "BAN" },
];

function detectRisk(title: string): string | undefined {
  const t = title.toLowerCase();
  return RISK_KEYWORDS.find((r) => t.includes(r.kw))?.label;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#821[01];|&ndash;/g, "–")
    .replace(/&#038;|&#38;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function pick(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

export async function fetchFarmNews(): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  await Promise.allSettled(
    NEWS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; WangariFarmOS/1.0; +https://wangari.imeantech.com)",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const blocks = xml.split(/<item[\s>]/i).slice(1);
        for (const b of blocks.slice(0, 12)) {
          const title = pick("title", b);
          const link = pick("link", b).split("?")[0];
          const pub = pick("pubDate", b);
          if (title && link) {
            items.push({
              title,
              link,
              source: feed.name,
              region: feed.region,
              pubDate: pub ? new Date(pub) : null,
              risk: detectRisk(title),
            });
          }
        }
      } catch {
        // feed down — the others still fill the section
      }
    })
  );
  // Freshest first, cross-source dedupe by title prefix
  const seen = new Set<string>();
  return items.sort((a, b) => (b.pubDate?.getTime() || 0) - (a.pubDate?.getTime() || 0)).filter((n) => {
    const k = n.title.toLowerCase().slice(0, 40);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Per-farm "already sent" memory ──────────────────────
// Every fetched article is upserted into news_articles (keyed by the sha1 of
// its canonical URL). For each farm we then select only stories with no
// news_article_sends row — a farmer who has been told a story never gets it
// again, no matter which feed it came from or how long ago.
import { createHash } from "crypto";

function linkHash(link: string): string {
  return createHash("sha1").update(link.trim().toLowerCase()).digest("hex");
}

export async function upsertNewsArticles(items: NewsItem[]): Promise<Map<string, number>> {
  const hashToId = new Map<string, number>();
  for (const item of items.slice(0, 60)) {
    const hash = linkHash(item.link);
    try {
      const row = await prisma.newsArticle.upsert({
        where: { linkHash: hash },
        create: {
          linkHash: hash,
          source: item.source,
          title: item.title,
          link: item.link,
          region: item.region,
          risk: item.risk || null,
          publishedAt: item.pubDate && !isNaN(item.pubDate.getTime()) ? item.pubDate : null,
        },
        update: {}, // first-seen facts are immutable
      });
      hashToId.set(hash, row.id);
    } catch (e: any) {
      // Log loudly — a silent upsert failure here silently disables dedupe.
      console.error("newsArticle upsert failed:", e?.message || e);
    }
  }
  return hashToId;
}

// Filter a fetched news list down to the stories THIS farm has not received
// before, in DB insertion order (freshest first).
export async function filterUnsentForFarm(items: NewsItem[], farmId: number): Promise<NewsItem[]> {
  if (!items.length) return [];
  const hashes = items.slice(0, 60).map((n) => linkHash(n.link));
  const already = await prisma.newsArticleSend.findMany({
    where: { farmId, article: { linkHash: { in: hashes } } },
    select: { article: { select: { linkHash: true } } },
  });
  const sentHashes = new Set(already.map((s) => s.article.linkHash));
  return items.filter((n) => !sentHashes.has(linkHash(n.link)));
}

// Record that a farm received specific stories (idempotent via unique index).
export async function recordNewsSends(items: NewsItem[], hashToId: Map<string, number>, farmId: number): Promise<void> {
  const rows = items
    .map((n) => hashToId.get(linkHash(n.link)))
    .filter((id): id is number => !!id)
    .map((articleId) => ({ articleId, farmId }));
  if (!rows.length) return;
  try {
    await prisma.newsArticleSend.createMany({ data: rows, skipDuplicates: true });
    const ids = [...new Set(rows.map((r) => r.articleId))];
    await prisma.newsArticle.updateMany({
      where: { id: { in: ids }, firstSentAt: null },
      data: { firstSentAt: new Date() },
    });
  } catch {
    // A missed write only means a story might repeat once — acceptable.
  }
}

interface SeasonInfo {
  name: string;
  emoji: string;
  headline: string;
  plant: string[];
  prepare: string[];
  avoid: string;
}

export function seasonalAdvisory(now: Date): SeasonInfo {
  const m = now.getMonth(); // 0-based
  if (m >= 2 && m <= 4) {
    // March–May: long rains
    return {
      name: "Long Rains season",
      emoji: "🌧️",
      headline: "The long rains are here — this is Kenya's main planting season.",
      plant: [
        "Maize (plant with the first consistent rains)",
        "Beans (intercrop with maize)",
        "Irish potatoes",
        "Tomatoes & kales (sukuma wiki) in nurseries",
      ],
      prepare: ["Top-dress maize with CAN when knee-high", "Mulch beds to keep moisture in", "Stake tomatoes early"],
      avoid: "Don't replant if the first flush failed — wait for a stable wet spell, not a single storm.",
    };
  }
  if (m >= 5 && m <= 8) {
    // June–September: cool dry / harvest
    return {
      name: "Cool Dry season",
      emoji: "☀️",
      headline: "Harvest and storage season — protect your grain and plan for the short rains.",
      plant: ["Leafy greens under irrigation", "Onions (transplant now for October markets)"],
      prepare: [
        "Dry maize to 13% moisture before storing",
        "Treat seed for the short-rains planting",
        "Repair terraces & drainage before October",
      ],
      avoid: "Avoid selling all your maize at harvest-time lows — store and sell when prices climb.",
    };
  }
  if (m >= 9 && m <= 11) {
    // October–December: short rains
    return {
      name: "Short Rains season",
      emoji: "🌦️",
      headline: "Short rains season — quick-maturing crops win here.",
      plant: [
        "Beans (90-day varieties)",
        "Green grams (ndengu)",
        "Carrots, beetroot & radish",
        "Fodder for dairy cows",
      ],
      prepare: [
        "Early land preparation catches every drop of rain",
        "Water harvesting: clean gutters & pans",
        "Book certified seed early — demand spikes",
      ],
      avoid: "Maize is risky in the short rains in most counties — plant only early-maturing varieties (e.g. Katumani).",
    };
  }
  // January–February: hot dry
  return {
    name: "Hot Dry season",
    emoji: "🔥",
    headline: "Hot and dry — protect livestock and prep the land for the long rains.",
    plant: [
      "Drought-tolerant crops: cassava, sweet potatoes, sorghum",
      "Tomatoes & onions under irrigation",
    ],
    prepare: [
      "Long-rains land prep NOW — plough early",
      "Order certified maize & bean seed before March",
      "Vaccinate & deworm livestock; secure water",
    ],
    avoid: "Don't burn crop residue — compost it instead to feed next season's soil.",
  };
}

export async function rainOutlook(location: string): Promise<{ summary: string; totalMm: number } | null> {
  try {
    const geo: any = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
      { signal: AbortSignal.timeout(8000) }
    ).then((r) => (r.ok ? r.json() : null));
    const hit = geo?.results?.[0];
    if (!hit) return null;
    const wx: any = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&daily=precipitation_sum&timezone=Africa%2FNairobi&forecast_days=7`,
      { signal: AbortSignal.timeout(8000) }
    ).then((r) => (r.ok ? r.json() : null));
    const days: number[] = wx?.daily?.precipitation_sum || [];
    if (!days.length) return null;
    const total = Math.round(days.reduce((a: number, b: number) => a + (b || 0), 0));
    const rainyDays = days.filter((d: number) => (d || 0) >= 1).length;
    let summary: string;
    if (total >= 50)
      summary = `A wet week ahead — about ${total} mm of rain over ${rainyDays} day${rainyDays === 1 ? "" : "s"}. Great for planting; watch for waterlogging and delay spraying.`;
    else if (total >= 10)
      summary = `Moderate rain expected — around ${total} mm across ${rainyDays} day${rainyDays === 1 ? "" : "s"}. Fine for transplanting and top-dressing.`;
    else
      summary = `A mostly dry week (only ~${total} mm expected). Prioritise irrigation and don't plant rain-fed yet.`;
    return { summary, totalMm: total };
  } catch {
    return null;
  }
}

function newsSection(label: string, items: NewsItem[]): string {
  const rows = items.length
    ? items
        .map(
          (n) => `
        <tr><td style="padding:9px 14px;background-color:${n.risk ? "#fef2f2;border-left:3px solid #dc2626" : "#f8fafc"};border-radius:8px;">
          <a href="${n.link}" style="text-decoration:none;font-size:13px;font-weight:600;color:#1e293b;">${n.title}</a>
          ${n.risk ? `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background-color:#dc2626;color:#ffffff;font-size:9px;font-weight:800;letter-spacing:0.5px;vertical-align:middle;">⚠ ${n.risk}</span>` : ""}
          <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">${n.source}${
            n.pubDate && !isNaN(n.pubDate.getTime()) ? ` · ${n.pubDate.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}` : ""
          }</p>
        </td></tr>
        <tr><td style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`
        )
        .join("")
    : `<tr><td style="padding:10px 14px;font-size:13px;color:#64748b;">Nothing new — you're all caught up. ✅</td></tr>`;
  return `
          <p style="margin:14px 0 4px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">${label}</p>
          <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function advisoryEmailHtml(
  userName: string,
  farmName: string,
  season: SeasonInfo,
  outlook: { summary: string; totalMm: number } | null,
  kenyaNews: NewsItem[],
  worldNews: NewsItem[],
  now: Date
): string {
  const dateStr = now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const chips = season.plant
    .map((p) => `<tr><td style="padding:6px 14px;font-size:13px;color:#166534;font-weight:600;">🌱 ${p}</td></tr>`)
    .join("");
  const prep = season.prepare
    .map((p) => `<tr><td style="padding:6px 14px;font-size:13px;color:#334155;">✅ ${p}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#166534;padding:24px 32px;text-align:center;">
          <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">🌿 Wangari</span>
          <p style="margin:4px 0 0;font-size:12px;color:#bbf7d0;">Today's farm advisory · ${dateStr}</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 2px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${season.emoji} ${season.name}</p>
          <h2 style="margin:0 0 16px;font-size:18px;color:#1e293b;">Good morning ${userName}, here's what's happening on the farm 🌾</h2>

          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:10px;margin-bottom:14px;">
            <tr><td style="padding:12px 14px;font-size:13px;color:#166534;font-weight:600;">${season.headline}</td></tr>
          </table>

          <p style="margin:14px 0 4px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Best to plant now</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;">${chips}</table>

          <p style="margin:14px 0 4px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">While you're at it</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;">${prep}</table>

          <p style="margin:14px 0 4px;font-size:12px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.5px;">Watch out</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-radius:10px;"><tr><td style="padding:10px 14px;font-size:13px;color:#92400e;">⚠️ ${season.avoid}</td></tr></table>

          ${
            outlook
              ? `<p style="margin:14px 0 4px;font-size:12px;font-weight:700;color:#0284c7;text-transform:uppercase;letter-spacing:0.5px;">7-day rain outlook</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:10px;"><tr><td style="padding:10px 14px;font-size:13px;color:#1e40af;">💧 ${outlook.summary}</td></tr></table>`
              : ""
          }

          ${newsSection("📰 Kenya farming news", kenyaNews)}
          ${newsSection("🌍 World farming news", worldNews)}
          <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;text-align:center;">News from Kenyan agri press &amp; global sources · only stories you haven't seen before · tap a headline to read more</p>

          <div style="text-align:center;margin-top:24px;">
            <a href="${process.env.FRONTEND_URL || "https://wangari.imeantech.com"}/dashboard" style="display:inline-block;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;">Open Wangari →</a>
          </div>
          <p style="margin:20px 0 0;font-size:11px;color:#64748b;text-align:center;">You receive this daily advisory because you have a Wangari farm account.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#64748b;">© ${new Date().getFullYear()} Wangari · imeantech.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

router.get("/farm-advisory", async (req: Request, res: Response) => {
  const CRON_SECRET = process.env.CRON_SECRET || "";
  const authHeader = req.headers.authorization || "";
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const season = seasonalAdvisory(now);

  try {
    const [allNews, farms] = await Promise.all([
      fetchFarmNews(),
      prisma.farm.findMany({
        where: { owner: { emailVerified: { not: null } } },
        select: {
          id: true,
          name: true,
          location: true,
          county: true,
          owner: { select: { name: true, email: true } },
        },
        take: 500,
      }),
    ]);

    // Store everything fetched once; the per-farm send ledger decides repeats.
    const hashToId = await upsertNewsArticles(allNews);
    const kenyaAll = allNews.filter((n) => n.region === "kenya");
    const worldAll = allNews.filter((n) => n.region === "world");

    let sent = 0;
    let skippedNoNews = 0;
    const errors: string[] = [];
    for (const farm of farms) {
      const ownerEmail = farm.owner?.email;
      if (!ownerEmail) continue;
      try {
        // Only stories this specific farm has never been sent before.
        const [kenyaNews, worldNews] = await Promise.all([
          filterUnsentForFarm(kenyaAll, farm.id),
          filterUnsentForFarm(worldAll, farm.id),
        ]);
        kenyaNews.splice(4);
        worldNews.splice(3);

        // Nothing new at all? Don't email just to say "no news".
        if (!kenyaNews.length && !worldNews.length) {
          skippedNoNews++;
          continue;
        }

        const outlook = farm.location ? await rainOutlook(farm.location) : null;
        await sendEmail({
          to: ownerEmail,
          subject: `🌾 Today's farm advisory — ${season.name} · ${now.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}`,
          html: advisoryEmailHtml(farm.owner?.name || "Farmer", farm.name, season, outlook, kenyaNews, worldNews, now),
          template: "oneoff",
        });
        sent++;

        // Mark these exact stories as delivered to THIS farm — they will never
        // be included in a future advisory for the same farm again.
        await recordNewsSends([...kenyaNews, ...worldNews], hashToId, farm.id);

        // In-app notification — one per farm per day (deduped by date marker).
        const marker = `[advisory ${now.toISOString().slice(0, 10)}]`;
        const exists = await prisma.announcement.findFirst({
          where: { farmId: farm.id, message: { contains: marker } },
        });
        if (!exists) {
          await prisma.announcement.create({
            data: {
              farmId: farm.id,
              active: true,
              message: `${season.emoji} ${marker} Today's farm advisory: ${season.name} tips, rain outlook${kenyaNews.length + worldNews.length ? ` and ${kenyaNews.length + worldNews.length} new farming news stories` : ""}.`,
              link: "/weather",
            },
          });
        }
      } catch (e: any) {
        errors.push(`${ownerEmail}: ${e?.message || "unknown"}`);
      }
    }

    res.json({
      ok: true,
      season: season.name,
      farmsTargeted: farms.length,
      emailsSent: sent,
      skippedNoNews,
      kenyaItems: kenyaAll.length,
      worldItems: worldAll.length,
      errors: errors.slice(0, 10),
    });
  } catch (error: any) {
    console.error("Farm advisory cron error:", error);
    res.status(500).json({ error: "Farm advisory failed", detail: error?.message });
  }
});

export default router;
