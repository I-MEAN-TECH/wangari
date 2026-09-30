"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CreditCard, AlertTriangle, Clock, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import api from "@/lib/api-client";
import { PaymentResultModal } from "@/components/subscription/PaymentResultModal";
import { useSearchParams } from "next/navigation";

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

// Plan cards render from GET /api/plans (DB-backed) — description carries the
// marketing copy, name/amount come from the pricing source of truth.
interface ApiPlan {
  id: string;
  name: string;
  description: string | null;
  amount: number; // pesewas
  amountKes: number;
  days: number;
}

function formatPrice(plan: ApiPlan): string {
  const kes = plan.amountKes.toLocaleString("en-KE");
  return plan.days >= 365 ? `KES ${kes}/yr` : `KES ${kes}/mo`;
}

// ── Inner component — uses useSearchParams, must be inside <Suspense> ──────────
function SubscriptionContent() {
  const [sub, setSub] = React.useState<any>(null);
  const [trial, setTrial] = React.useState<any>(null);
  const [plans, setPlans] = React.useState<ApiPlan[]>([]);
  const [userEmail, setUserEmail] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [purchasing, setPurchasing] = React.useState<string | null>(null);
  const [promoCode, setPromoCode] = React.useState("");
  const [promoNote, setPromoNote] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [subError, setSubError] = React.useState("");

  const searchParams = useSearchParams();
  const paymentParam = searchParams.get("payment");
  const trxrefParam = searchParams.get("trxref") || searchParams.get("reference");
  const reasonParam = searchParams.get("reason");

  const [modalState, setModalState] = React.useState<{
    show: boolean;
    type: "success" | "failed";
    reference?: string | null;
    reason?: string | null;
  } | null>(null);

  React.useEffect(() => {
    if (paymentParam === "success" || trxrefParam) {
      setModalState({ show: true, type: "success", reference: trxrefParam });
      import("@/lib/posthog").then(({ trackEvent }) =>
        trackEvent("subscription_completed", { reference: trxrefParam })
      );
    } else if (paymentParam === "failed") {
      setModalState({ show: true, type: "failed", reason: reasonParam || "Transaction was not completed or was cancelled." });
      import("@/lib/posthog").then(({ trackEvent }) =>
        trackEvent("checkout_failed", { reason: reasonParam })
      );
    }
  }, [paymentParam, trxrefParam, reasonParam]);

  React.useEffect(() => {
    api.get("/api/trial/status")
      .then((d: any) => {
        setSub(d.subscription);
        setTrial(d.trial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get<ApiPlan[]>("/api/plans")
      .then((d) => setPlans(Array.isArray(d) ? d : []))
      .catch(() => {});

    api.get("/api/auth/me").then((d: any) => {
      if (d?.email) setUserEmail(d.email);
    }).catch(() => {});
  }, []);

  // Sponsorship / partnership codes: redeem directly for free months — no payment.
  const [redeeming, setRedeeming] = React.useState(false);
  const redeemFreeCode = async () => {
    if (!promoCode.trim()) return;
    setRedeeming(true);
    setPromoNote(null);
    try {
      const res = await api.post<{ ok: boolean; months: number; sponsor: string | null; expiresAt: string }>(
        "/api/promos/redeem",
        { code: promoCode.trim().toUpperCase() }
      );
      setPromoNote({
        kind: "ok",
        text: `🎉 ${res.months} month${res.months === 1 ? "" : "s"} of free access activated${res.sponsor ? ` (sponsor: ${res.sponsor})` : ""} — valid until ${new Date(res.expiresAt).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}. A confirmation email is on its way.`,
      });
      setPromoCode("");
      // Refresh status everywhere live — no jarring full-page reload. The
      // wangari:subscription_updated event (emitted by api-client) makes the
      // banner timer and sidebar padlocks update instantly.
      try {
        const d = await api.get("/api/trial/status");
        setSub(d.subscription);
        setTrial(d.trial);
      } catch {}
    } catch (err: any) {
      setPromoNote({ kind: "err", text: err?.message || "Could not redeem the code" });
    } finally {
      setRedeeming(false);
    }
  };

  const handleSubscribe = async (planKey: string) => {
    setPurchasing(planKey);
    try {
      const res = await api.post("/api/paystack", {
        email: "",
        plan: planKey,
        ...(promoCode.trim() ? { promoCode: promoCode.trim().toUpperCase() } : {}),
        callback_url: `${window.location.origin}/subscription?payment=success`,
      });
      if (res.authorization_url) {
        import("@/lib/posthog").then(({ trackEvent }) =>
          trackEvent("checkout_started", { plan: planKey, has_promo: !!promoCode.trim() })
        );
        window.location.href = res.authorization_url;
        return;
      }
      // No redirect URL returned — tell the user instead of failing silently.
      setSubError("Could not start checkout. Please try again in a moment.");
    } catch (err: any) {
      // All checkout problems surface as a visible message (promo issues,
      // Paystack errors, network failures, rate limits). Never fail silently.
      const msg = err?.message || "Could not start checkout — please try again.";
      if (/promo/i.test(msg)) {
        setPromoNote({ kind: "err", text: msg });
      } else {
        setSubError(msg);
      }
      console.error("Checkout error:", err);
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#166534]" />
    </div>
  );

  const isActive = sub?.status === "active";
  const isPending = sub?.status === "pending";
  const isTrial = trial?.status === "active";

  return (
    <div className="space-y-6 max-w-3xl">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Subscription" description="Manage your Wangari plan" />
      </motion.div>

      {/* Current status */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-[#E5E7EB]">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#166534] text-white">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Current Plan</p>
                <p className="text-xs text-[#64748B]">
                  {isActive ? sub.planName || sub.plan_name || "Active plan" : isPending ? "Pending — starts after trial" : isTrial ? "Free trial" : "No active plan"}
                </p>
              </div>
            </div>

            {isActive && (
              <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">Plan</span>
                  <span className="font-bold text-[#0F172A]">{sub.planName || sub.plan_name || "Active plan"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">Status</span>
                  <Badge className="bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]">✅ Active</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">Valid until</span>
                  <span className="font-bold text-[#0F172A]">{new Date(sub.expiresAt || sub.expires_at).toLocaleDateString()}</span>
                </div>
              </div>
            )}

            {isPending && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-bold text-amber-800">{sub.planName || sub.plan_name} — Pending</p>
                </div>
                <p className="text-xs text-amber-600">Your subscription will start when your free trial ends on {trial?.endsAt ? new Date(trial.endsAt).toLocaleDateString() : "—"}</p>
              </div>
            )}

            {!isActive && !isPending && isTrial && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-bold text-blue-800">Free Trial — {trial?.daysLeft || 0} days left</p>
                </div>
                <p className="text-xs text-blue-600">Subscribe now to keep full access after your trial ends.</p>
              </div>
            )}

            {!isActive && !isPending && !isTrial && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <p className="text-sm font-bold text-red-800">No active plan</p>
                </div>
                <p className="text-xs text-red-600">Subscribe to access all modules and features.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Available plans */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-[#0F172A]">Available Plans</h3>
          {/* Promo code — validated server-side at checkout init; applied by the webhook on payment. Sponsorship/partner codes can be redeemed directly for free months. */}
          <div className="flex items-center gap-2">
            <input
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                setPromoNote(null);
              }}
              placeholder="Promo / sponsor code"
              className="h-9 w-40 rounded-lg border border-[#E5E7EB] px-3 text-xs font-semibold tracking-wide uppercase placeholder:font-normal placeholder:normal-case focus:border-[#166534] focus:outline-none"
            />
            {promoCode && (
              <button
                onClick={redeemFreeCode}
                disabled={redeeming}
                className="h-9 whitespace-nowrap rounded-lg bg-[#166534] px-3 text-xs font-bold text-white hover:bg-[#14532D] disabled:opacity-60"
              >
                {redeeming ? "Checking…" : "Redeem"}
              </button>
            )}
            {promoCode && (
              <button
                onClick={() => { setPromoCode(""); setPromoNote(null); }}
                className="text-xs text-[#64748B] hover:text-[#0F172A]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {promoNote && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${promoNote.kind === "err" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
            {promoNote.text}
          </div>
        )}
        {subError && (
          <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-200 flex items-center justify-between gap-2">
            <span>{subError}</span>
            <button onClick={() => setSubError("")} className="font-bold hover:underline shrink-0">Dismiss</button>
          </div>
        )}
        {!promoCode && (
          <p className="mb-3 text-[11px] text-[#94A3B8]">Have a promo or sponsor code? Discount codes apply to your payment. Sponsorship/partner codes — tap <span className="font-semibold">Redeem</span> for free months, no payment needed.</p>
        )}
        <div className="grid gap-4">
          {plans.map(plan => (
            <Card key={plan.id} className="border border-[#E5E7EB] hover:border-[#166534] transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">{plan.name}</p>
                    <p className="text-lg font-extrabold text-[#166534] mt-1">{formatPrice(plan)}</p>
                    {plan.description && <p className="text-xs text-[#64748B] mt-0.5">{plan.description}</p>}
                  </div>
                  <Button
                    onClick={() => handleSubscribe(plan.id)}                     disabled={purchasing === plan.id || (isActive && (sub?.planName || sub?.plan_name) === plan.name)}
                    className="bg-[#166534] hover:bg-[#14532D] cursor-pointer shrink-0"
                    size="sm"
                  >
                    {purchasing === plan.id ? "Loading..." : "Subscribe"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Enterprise CTA */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-[#E5E7EB] bg-[#F8FAFC]">
          <CardContent className="p-5 text-center">
            <p className="text-sm font-bold text-[#0F172A]">Need Enterprise?</p>
            <p className="text-xs text-[#64748B] mt-1">Custom hosting, installation, and dedicated support for large farms.</p>
            <a href="mailto:sales@imeantech.com" className="inline-flex items-center gap-1 mt-3 text-sm font-bold text-[#166534] hover:underline">
              Contact Sales <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      </motion.div>

      {modalState?.show && (
        <PaymentResultModal
          type={modalState.type}
          reference={modalState.reference}
          amount={sub?.amount || null}
          planName={sub?.planName || sub?.plan_name || "Starter Plan"}
          userEmail={userEmail}
          reason={modalState.reason}
          onClose={() => setModalState(null)}
          onRetry={() => {
            setModalState(null);
            handleSubscribe("starter_monthly");
          }}
        />
      )}
    </div>
  );
}

// ── Page shell — wraps content in Suspense so useSearchParams works ────────────
export default function SubscriptionPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#166534]" />
        </div>
      }
    >
      <SubscriptionContent />
    </React.Suspense>
  );
}
