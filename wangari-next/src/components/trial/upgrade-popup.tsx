"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import api from "@/lib/api-client";

interface UpgradePopupProps {
  open: boolean;
  onClose: () => void;
  moduleName?: string;
}

interface ApiPlan {
  id: string;
  name: string;
  description: string | null;
  amountKes: number;
  days: number;
}

export function UpgradePopup({ open, onClose, moduleName }: UpgradePopupProps) {
  const [mounted, setMounted] = React.useState(false);
  const [plans, setPlans] = React.useState<ApiPlan[]>([]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Plans come from the pricing source of truth (backend DB) — no literals here.
  React.useEffect(() => {
    if (!open || plans.length > 0) return;
    api.get<ApiPlan[]>("/api/plans")
      .then((d) => setPlans(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [open, plans.length]);

  if (!open) return null;

  const isExpired = moduleName === "Free Trial Expired";

  const content = (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[9999] p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl my-auto border border-gray-100 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-wangari-ink via-wangari-green-900 to-wangari-green-800 px-6 py-8 text-center text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer border border-white/20"
            aria-label="Close modal"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
            <X className="h-3.5 w-3.5 ml-1" />
          </button>
          
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 mx-auto mb-4">
            <Lock className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-extrabold text-white">
            {isExpired ? "Your 14-Day Free Trial Has Expired" : moduleName ? `"${moduleName}" Requires a Plan` : "Upgrade Your Plan"}
          </h2>
          <p className="text-white/80 text-xs sm:text-sm mt-2 max-w-sm mx-auto">
            {isExpired
              ? "Subscribe to a plan to continue managing your farm, animals, crops, and finances."
              : "Choose a plan to unlock this module and enjoy full access to all features."}
          </p>
        </div>

        {/* Plans */}
        <div className="p-6 space-y-3">
          {plans.map((plan, idx) => {
            const popular = idx === 1; // second plan highlighted as popular
            const period = plan.days >= 365 ? "/yr" : "/mo";
            return (
            <div
              key={plan.id}
              className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                popular
                  ? "border-wangari-green-800 bg-wangari-green-50"
                  : "border-wangari-border hover:border-wangari-green-200"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-wangari-heading">{plan.name.replace(/ (Monthly|Annual)$/, "")}</p>
                  {popular && (
                    <span className="text-[9px] font-bold text-wangari-green-800 bg-wangari-green-50 px-2 py-0.5 rounded-full border border-wangari-green-200">
                      Popular
                    </span>
                  )}
                </div>
                <p className="text-xs text-wangari-muted mt-0.5">
                  KES {plan.amountKes.toLocaleString("en-KE")}{period}
                </p>
                {plan.description && (
                  <p className="text-[10px] text-wangari-muted mt-1">{plan.description}</p>
                )}
              </div>
              <Link
                href="/subscription"
                onClick={onClose}
                className={`flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  popular
                    ? "bg-wangari-green-800 text-white hover:bg-wangari-green-900"
                    : "border border-wangari-border text-wangari-heading hover:border-wangari-green-800 hover:text-wangari-green-800"
                }`}
              >
                Choose <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            );
          })}
          {plans.length === 0 && (
            <p className="text-xs text-wangari-muted text-center py-4">Loading plans…</p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 pb-6 space-y-2">
          <Link
            href="/subscription"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-wangari-green-800 text-white text-sm font-extrabold hover:bg-wangari-green-900 transition-colors shadow-md"
          >
            See All Plans & Subscription Options
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-bold text-wangari-muted hover:text-wangari-heading transition-colors cursor-pointer text-center"
          >
            ← Back to Farm Navigation
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
