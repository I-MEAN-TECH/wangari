import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/learn/live?slug=<doc-slug>
 *
 * Live-data blocks for Learn documents — fetched fresh at read time so a
 * document opened today shows this week's rain outlook and latest farm news.
 * Public (no auth): the Learn library is a free marketing surface.
 */

const FEEDS = [
  { name: "Kilimo News", url: "https://kilimonews.co.ke/feed/" },
  { name: "FarmBiz Africa", url: "https://www.farmbizafrica.com/index.php?option=com_content&view=featured&Itemid=435&format=feed&type=rss" },
];

const RISK_KEYWORDS = [
  "aflatoxin", "armyworm", "locust", "drought", "flood", "outbreak",
  "quarantine", "ban", "price crash", "frost", "disease",
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function seasonForMonth(date: Date): { name: string; advice: string } {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return { name: "Long Rains (Mar–May)", advice: "Prime planting season — land prep and planting in the first two weeks of the rains." };
  if (m >= 6 && m <= 8) return { name: "Cool Dry Season (Jun–Aug)", advice: "Harvest-and-storage season — dry grain to 13% moisture and plan short-rains land prep." };
  if (m >= 9 && m <= 10) return { name: "Hot Dry Season (Sep–Oct)", advice: "Land preparation, water harvesting, and ordering certified seed before the short rains." };
  return { name: "Short Rains (Oct–Dec)", advice: "Second planting season — quick-maturing varieties win." };
}

async function fetchNews() {
  const items: { title: string; source: string; link: string; pubDate: string; alert: boolean }[] = [];
  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "WangariFarmOS/1.0" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const entries = xml.split(/<(?:item|entry)[\s>]/).slice(1, 6);
        for (const entry of entries) {
          const title = stripHtml(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "");
          const link = entry.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
          const cleanLink = stripHtml(link).replace(/<!\[CDATA\[|\]\]>/g, "");
          if (!title) continue;
          const alert = RISK_KEYWORDS.some((k) => title.toLowerCase().includes(k));
          items.push({
            title,
            source: feed.name,
            link: cleanLink || feed.url,
            pubDate: entry.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/)?.[1]?.trim() ?? "",
            alert,
          });
        }
      } catch {
        /* feed unreachable — return what we have */
      }
    })
  );
  return items.slice(0, 5);
}

async function fetchWeather(slug: string) {
  // Nakuru as a sensible Kenya-centroid default for public (non-farm) docs
  const lat = -0.3031, lon = 36.08;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=Africa%2FNairobi&forecast_days=7`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const daily = data?.daily;
    if (!daily) return null;
    const days = daily.time.map((t: string, i: number) => ({
      date: t,
      rainMm: Math.round((daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
      tMax: Math.round(daily.temperature_2m_max?.[i] ?? 0),
      tMin: Math.round(daily.temperature_2m_min?.[i] ?? 0),
      humidity: Math.round(daily.relative_humidity_2m_mean?.[i] ?? 0),
    }));
    const totalRain = Math.round(days.reduce((s: number, d: { rainMm: number }) => s + d.rainMm, 0));
    const humidDays = days.filter((d: { humidity: number }) => d.humidity >= 75).length;
    const summary =
      totalRain >= 40
        ? `A wet week ahead (~${totalRain}mm over 7 days) — good for planting; delay spraying until the rain clears.`
        : totalRain >= 15
          ? `Moderate rain ahead (~${totalRain}mm this week) — keep soil moisture up with mulch.`
          : `A dry week ahead (only ~${totalRain}mm) — plan irrigation and hold off top-dressing onto dry ground.`;
    const blightRisk = humidDays >= 3
      ? `${humidDays} humid days ahead — fungal/blight risk is elevated in tomatoes and potatoes; spray preventively before the humid spell.`
      : null;
    return { days, totalRain, humidDays, summary, blightRisk };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") ?? "";
  const wantsWeather = searchParams.get("weather") === "1";
  const wantsNews = searchParams.get("news") === "1";

  const payload: Record<string, unknown> = { slug, fetchedAt: new Date().toISOString() };

  const [weather, news, market] = await Promise.all([
    wantsWeather ? fetchWeather(slug) : Promise.resolve(null),
    wantsNews ? fetchNews() : Promise.resolve([]),
    fetchMarketRates(),
  ]);

  if (wantsWeather) payload.weather = weather;
  if (wantsNews) payload.news = news;
  payload.market = market;
  payload.season = seasonForMonth(new Date());

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
  });
}

/**
 * Live market context for Kenyan farmers: USD/KES exchange rate
 * (open.er-api.com — free, no key) + month timing context.
 * Returns null gracefully when the API is unreachable.
 */
async function fetchMarketRates() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.KES;
    if (!rate) return null;
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
      usdKes: Math.round(rate * 100) / 100,
      asOf: data.time_last_update_utc?.slice(0, 16) ?? new Date().toISOString().slice(0, 10),
      dayOfMonth: now.getDate(),
      daysToMonthEnd: monthEnd - now.getDate(),
      note: "A stronger dollar usually lifts export crop prices (avocado, macadamia, tea) at the farm gate.",
    };
  } catch {
    return null;
  }
}
