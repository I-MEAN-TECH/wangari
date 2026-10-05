import { NextResponse } from "next/server";

/**
 * Vercel Cron trigger for the daily farm advisory email.
 *
 * The database lives on the VPS, so the actual work runs on the Express
 * backend (api.wangari.imeantech.com): seasonal planting tips, a 7-day rain
 * outlook per farm location, and live Kenyan agri news headlines from
 * Kilimo News + FarmBiz Africa RSS feeds.
 *
 * Schedule: 6:45 AM EAT daily (see vercel.json) — before the digest at 6:30? No:
 * digest runs 6:30 EAT = 03:30 UTC; this runs at 03:45 UTC so the two emails
 * arrive a few minutes apart rather than merged.
 */

// Fail CLOSED: an unset CRON_SECRET must refuse, not admit. The old
// `if (CRON_SECRET && ...)` skipped the whole check when the variable was
// missing, so a deploy that lost the secret left these routes open to anyone —
// and they send email to real farmers.
const CRON_SECRET = process.env.CRON_SECRET || "";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("[cron:farm-advisory] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300_000); // news fetch + per-farm sends take a while
    const res = await fetch(`${BACKEND_URL}/api/cron/farm-advisory`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Farm advisory trigger error:", e?.message, e?.cause?.message || "");
    return NextResponse.json({ error: "Failed to trigger farm advisory", detail: e?.message }, { status: 502 });
  }
}
