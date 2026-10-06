"use client";

import * as React from "react";
import { use } from "react";
import { CheckCircle2, XCircle, Loader2, Leaf, MapPin, Clock, AlertTriangle } from "lucide-react";

/**
 * /q/[token] — customer-facing quote response.
 *
 * Opened from the WhatsApp link a farmer shares. No login required: the
 * unguessable token IS the authorization. The customer reviews the quote
 * and taps Accept or Decline — the farmer sees the status update in the
 * Quotes pipeline instantly.
 */

type QuoteData = {
  quoteNumber: string;
  farmName: string;
  farmLocation: string | null;
  customerName: string | null;
  items: { description?: string; qty?: number; quantity?: number; unitPrice?: number }[];
  totalAmount: string | number;
  status: string;
  validUntil: string | null;
  notes: string | null;
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  accepted: { bg: "bg-wangari-green-50", text: "text-wangari-green-700", label: "Accepted ✓" },
  declined: { bg: "bg-tone-bad-bg", text: "text-badge-red-text", label: "Declined" },
  expired: { bg: "bg-tone-warn-bg", text: "text-tone-warn-text", label: "Expired" },
  converted: { bg: "bg-blue-50", text: "text-badge-blue-text", label: "Invoiced" },
};

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [quote, setQuote] = React.useState<QuoteData | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [decided, setDecided] = React.useState<string | null>(null);
  const [decideError, setDecideError] = React.useState("");

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";

  React.useEffect(() => {
    fetch(`${BACKEND}/api/quotes-public/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Quote not found");
        setQuote(data);
      })
      .catch((e) => setError(e.message || "This quote link is invalid or has expired."));
  }, [token, BACKEND]);

  async function respond(decision: "accept" | "decline") {
    if (busy) return;
    if (decision === "decline" && !confirm("Decline this quote? The farmer will see your response.")) return;
    setBusy(true);
    setDecideError("");
    try {
      const r = await fetch(`${BACKEND}/api/quotes-public/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Something went wrong");
      setDecided(data.status);
      setQuote((q) => (q ? { ...q, status: data.status } : q));
    } catch (e: any) {
      setDecideError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-tone-bad-bg">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Quote unavailable</h1>
          <p className="mt-2 text-sm text-wangari-muted">{error}</p>
          <p className="mt-1 text-xs text-wangari-subtle">Please ask the farm to resend the link.</p>
        </div>
      </Shell>
    );
  }

  if (!quote) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-10 text-wangari-subtle">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="mt-3 text-sm">Loading quote…</p>
        </div>
      </Shell>
    );
  }

  const isDecided = quote.status === "accepted" || quote.status === "declined" || quote.status === "converted" || quote.status === "expired";
  const badge = STATUS_STYLES[quote.status];
  const expired = quote.validUntil ? new Date(quote.validUntil) < new Date() : false;
  const daysLeft = quote.validUntil ? Math.ceil((new Date(quote.validUntil).getTime() - Date.now()) / 86400000) : null;

  return (
    <Shell>
      {/* Header */}
      <div className="border-b border-wangari-sunken bg-gradient-to-b from-wangari-green-50/60 to-transparent px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-wangari-green-700">Quote {quote.quoteNumber}</p>
            <h1 className="mt-1 text-xl font-extrabold text-slate-800">{quote.farmName}</h1>
            {quote.farmLocation && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-wangari-muted">
                <MapPin className="h-3 w-3" /> {quote.farmLocation}
              </p>
            )}
          </div>
          {badge && (
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badge.bg} ${badge.text}`}>{badge.label}</span>
          )}
        </div>
        {quote.customerName && (
          <p className="mt-3 text-xs text-wangari-muted">Prepared for <span className="font-semibold text-wangari-text">{quote.customerName}</span></p>
        )}
        {quote.validUntil && !isDecided && (
          <p className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${expired ? "text-tone-warn-text" : daysLeft !== null && daysLeft <= 3 ? "text-amber-600" : "text-wangari-muted"}`}>
            <Clock className="h-3.5 w-3.5" />
            {expired ? "Validity has passed" : `Valid until ${new Date(quote.validUntil).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}${daysLeft !== null && daysLeft >= 0 ? ` (${daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `${daysLeft} days left`})` : ""}`}
          </p>
        )}
      </div>

      {/* Items */}
      <div className="px-6 py-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-wangari-sunken text-left text-[11px] uppercase tracking-wide text-wangari-subtle">
              <th className="pb-2 font-bold">Item</th>
              <th className="pb-2 text-center font-bold">Qty</th>
              <th className="pb-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(quote.items || []).map((it, i) => {
              const qty = Number(it.qty ?? it.quantity ?? 0);
              const amount = qty * Number(it.unitPrice || 0);
              return (
                <tr key={i} className="border-b border-tone-neutral-bg">
                  <td className="py-2.5 pr-2 font-medium text-wangari-text">{it.description || "Item"}</td>
                  <td className="py-2.5 text-center text-wangari-muted">{qty || "—"}</td>
                  <td className="py-2.5 text-right font-semibold text-wangari-text">KES {amount.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-wangari-green-50 px-4 py-3">
          <span className="text-sm font-bold text-wangari-green-800">Total</span>
          <span className="text-lg font-extrabold text-wangari-green-800">KES {Number(quote.totalAmount).toLocaleString()}</span>
        </div>
        {quote.notes && (
          <p className="mt-4 rounded-lg bg-tone-neutral-bg px-4 py-3 text-xs leading-relaxed text-tone-neutral-text">{quote.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-wangari-sunken px-6 py-5">
        {decided === "accepted" || quote.status === "accepted" ? (
          <div className="rounded-xl bg-wangari-green-50 px-4 py-5 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-wangari-green-600" />
            <p className="mt-2 text-sm font-bold text-wangari-green-800">Quote accepted — thank you!</p>
            <p className="mt-1 text-xs text-wangari-green-700">The farm has been notified and will be in touch with the invoice and next steps.</p>
          </div>
        ) : decided === "declined" || quote.status === "declined" ? (
          <div className="rounded-xl bg-tone-bad-bg px-4 py-5 text-center">
            <XCircle className="mx-auto h-8 w-8 text-red-500" />
            <p className="mt-2 text-sm font-bold text-badge-red-text">Quote declined</p>
            <p className="mt-1 text-xs text-red-600">Your response was sent to the farm. Thank you for letting them know.</p>
          </div>
        ) : isDecided ? (
          <p className="text-center text-sm text-wangari-muted">This quote is no longer open for response.</p>
        ) : expired ? (
          <div className="rounded-xl bg-tone-warn-bg px-4 py-4 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
            <p className="mt-2 text-sm font-bold text-amber-800">This quote has expired</p>
            <p className="mt-1 text-xs text-tone-warn-text">Contact the farm for a fresh quote.</p>
          </div>
        ) : (
          <>
            {decideError && <p className="mb-3 rounded-lg bg-tone-bad-bg px-3 py-2 text-center text-xs font-semibold text-red-600">{decideError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => respond("decline")}
                disabled={busy}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-tone-neutral-border px-4 py-3 text-sm font-bold text-tone-neutral-text transition-colors hover:bg-tone-neutral-bg disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Decline
              </button>
              <button
                onClick={() => respond("accept")}
                disabled={busy}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-wangari-green-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-wangari-green-800 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Accept quote
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-wangari-subtle">
              Your response is sent directly to {quote.farmName}. No account needed.
            </p>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-wangari-sunken px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-center gap-2 border-b border-wangari-sunken bg-white px-6 py-3">
          <Leaf className="h-4 w-4 text-wangari-green-700" />
          <span className="text-sm font-bold text-slate-800">Wangari Farm OS</span>
        </div>
        {children}
      </div>
    </div>
  );
}
