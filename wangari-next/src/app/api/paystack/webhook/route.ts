import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/paystack/webhook
 *
 * Paystack sends payment events here. We forward the raw body and signature
 * to the Express backend's /api/paystack/webhook, which:
 *   - verifies the HMAC SHA512 signature against the live Paystack secret,
 *   - activates the subscription on the Plan row's `days`,
 *   - sends the receipt email,
 *   - records the promo redemption.
 *
 * Why we don't do the work here: Vercel can't reach Postgres, and the
 * canonical plan/promo/subscription logic is on the backend. Forwarding the
 * raw body preserves the signature hash byte-for-byte — the backend
 * recomputes HMAC over the same bytes and verifies.
 *
 * Set the URL in Paystack Dashboard → Settings → Webhook URL to:
 *   https://wangari.imeantech.com/api/paystack/webhook
 *
 * The previously-hardcoded PLAN_DURATIONS map (4 plans, 30/365 days) is gone:
 * every plan's `days` now comes from the plans table on the backend, so
 * `growth_season`, `growth_60day`, `growth_120day`, and all `enterprise_*`
 * variants get the duration they were sold with, not 30 days by default.
 */
const BACKEND_URL = process.env.BACKEND_URL || "https://api.wangari.imeantech.com";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";

    // Forward the exact body and signature. Buffer transport on the backend
    // (server/src/routes/paystack.ts) recomputes HMAC over these bytes, so
    // the signature is still valid end-to-end.
    const res = await fetch(`${BACKEND_URL}/api/paystack/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": signature,
      },
      body,
      cache: "no-store",
    });

    // If the backend is unreachable, return 502 so Paystack retries — better
    // than a 200 ack that silently drops a successful payment.
    if (!res.ok && res.status >= 500) {
      return NextResponse.json({ error: "Backend webhook failed" }, { status: 502 });
    }

    const data = await res.json().catch(() => ({ received: true }));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("/api/paystack/webhook forward error:", error);
    // 500 so Paystack retries — a payment that we drop is a paying customer
    // who paid and saw "subscription activated" but never got one.
    return NextResponse.json({ error: "Webhook forward failed" }, { status: 500 });
  }
}

/**
 * GET /api/paystack/webhook — health check (Paystack pings this to verify
 * the URL is live before sending events). Hit the backend too, so this
 * route actually proves the whole payment path is healthy.
 */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/paystack/webhook`, {
      method: "GET",
      cache: "no-store",
    });
    return NextResponse.json(
      { status: "ok", message: "Paystack webhook endpoint active", backend: res.ok ? "ok" : "degraded" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { status: "ok", message: "Paystack webhook endpoint active", backend: "unreachable" },
      { status: 200 }
    );
  }
}
