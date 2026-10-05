import { NextResponse } from "next/server";

/**
 * Vercel Cron trigger for the daily farm digest.
 *
 * The database lives on the VPS and is not reachable from Vercel, so the
 * actual digest logic runs on the Express backend (api.wangari.imeantech.com).
 * This route just calls it with the shared CRON_SECRET.
 *
 * Schedule: 6:30 AM EAT daily (see vercel.json).
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
    console.error("[cron:farm-digest] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const res = await fetch(`${BACKEND_URL}/api/cron/farm-digest`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      // Digest can take a while with many farms (SMTP sends are serial)
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Digest trigger error:", e?.message, e?.cause?.message || "");
    return NextResponse.json({ error: "Failed to trigger digest", detail: e?.message }, { status: 502 });
  }
}
