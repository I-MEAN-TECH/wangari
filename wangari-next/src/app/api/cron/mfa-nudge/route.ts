import { NextResponse } from "next/server";

/**
 * Vercel Cron trigger for the weekly 2FA nudge.
 *
 * The database lives on the VPS, so the actual nudge logic runs on the
 * Express backend (api.wangari.imeantech.com); this route just calls it
 * with the shared CRON_SECRET.
 *
 * Schedule: Mondays 09:30 EAT (see vercel.json).
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
    console.error("[cron:mfa-nudge] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110_000);
    const res = await fetch(`${BACKEND_URL}/api/cron/mfa-nudge`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("MFA nudge trigger error:", error?.message);
    return NextResponse.json({ error: "MFA nudge failed" }, { status: 502 });
  }
}
