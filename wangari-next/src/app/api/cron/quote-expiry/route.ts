import { NextResponse } from "next/server";

/**
 * Vercel Cron trigger for daily quote expiry + farmer nudge emails.
 *
 * The database lives on the VPS, so the actual work runs on the Express
 * backend (api.wangari.imeantech.com). This route just calls it with the
 * shared CRON_SECRET — same pattern as the farm-digest trigger.
 *
 * Schedule: 7:00 AM EAT daily (see vercel.json) — after the digest, before
 * most farmers open the app.
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
    console.error("[cron:quote-expiry] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const res = await fetch(`${BACKEND_URL}/api/cron/quote-expiry`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Quote expiry trigger error:", e?.message, e?.cause?.message || "");
    return NextResponse.json({ error: "Failed to trigger quote expiry", detail: e?.message }, { status: 502 });
  }
}
