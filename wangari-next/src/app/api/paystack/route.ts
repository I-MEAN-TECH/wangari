import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

/**
 * /api/paystack — initialize or verify a Paystack transaction.
 *
 * The Express backend at /api/paystack is the source of truth: it validates
 * the plan exists and is active, resolves the paying user from the JWT (not
 * from a client-supplied email, which is the common M-Pesa bug), applies
 * promo rules against the canonical table, and signs the Paystack request
 * with the live secret. This Vercel route forwards the request so the
 * frontend's existing /api/paystack calls keep working from the public site.
 *
 * The webhook at /api/paystack/webhook does the DB write directly because
 * Paystack sends the callback WITHOUT a JWT — see webhook/route.ts.
 */

const BACKEND_URL = process.env.BACKEND_URL || "https://api.wangari.imeantech.com";

export const dynamic = "force-dynamic";

// POST /api/paystack — initialize a payment
export async function POST(req: NextRequest) {
  try {
    // The api-client always sends Authorization: Bearer <JWT>. Forward it.
    // Backend uses it to identify the user (not a client-supplied email),
    // and to write metadata.userId so the webhook can resolve by userId first.
    const auth = req.headers.get("authorization") || "";

    const body = await req.json().catch(() => ({}));
    const { plan, promoCode, callback_url } = body || {};

    if (!plan) {
      return NextResponse.json({ error: "Plan is required" }, { status: 400 });
    }

    const res = await proxyToBackend("/api/paystack", {
      method: "POST",
      headers: { Authorization: auth },
      body: JSON.stringify({ plan, promoCode, callback_url }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("/api/paystack proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/paystack?reference=xxx — verify a payment
// Useful for the success page fallback if Paystack's inline message is missed.
export async function GET(req: NextRequest) {
  try {
    const reference = req.nextUrl.searchParams.get("reference");
    if (!reference) {
      return NextResponse.json({ error: "Reference is required" }, { status: 400 });
    }

    // Verification is a public read; forward with no JWT. Backend has the
    // canonical logic and Paystack secret.
    const res = await fetch(`${BACKEND_URL}/api/paystack?reference=${encodeURIComponent(reference)}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("/api/paystack verify proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
