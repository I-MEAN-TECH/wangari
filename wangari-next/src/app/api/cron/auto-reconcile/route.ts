import { NextResponse } from "next/server";

/**
 * Vercel Cron trigger for M-Pesa auto-reconcile.
 *
 * The matcher and the database live on the VPS. This route is a thin
 * shell that verifies CRON_SECRET and forwards the GET to the Express
 * endpoint, which runs the actual scan and write. The schedule is in
 * wangari-next/vercel.json (hourly during the working day).
 *
 * Why every 2 hours and not every 15 minutes: the matcher does a
 * 14-day backfill join in memory; running it too often multiplies
 * Postgres reads without catching materially more matches. The
 * reference+amount signal is the buyer's own slip number, which
 * arrives the same day as the payment in nearly every case.
 *
 * Fail CLOSED: an unset CRON_SECRET must refuse, not admit. A cron
 * route that writes to the ledger with no auth is a back door into
 * every farmer's books.
 */

const CRON_SECRET = process.env.CRON_SECRET || "";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("[cron:auto-reconcile] CRON_SECRET is not set — refusing. This cron will not run until it is set in the environment.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const controller = new AbortController();
    // 90s ceiling: the matcher fetches transactions and deliveries across
    // 14 days, joins them in memory, and applies N writes. A 1k-transaction
    // farm should finish in well under a second; the limit is a safety
    // valve for a runaway query, not a perf budget.
    const timer = setTimeout(() => controller.abort(), 90_000);
    const res = await fetch(`${BACKEND_URL}/api/cron/auto-reconcile`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Auto-reconcile trigger error:", e?.message, e?.cause?.message || "");
    return NextResponse.json({ error: "Failed to trigger auto-reconcile", detail: e?.message }, { status: 502 });
  }
}
