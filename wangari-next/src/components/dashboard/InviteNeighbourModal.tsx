"use client";

import * as React from "react";
import { Gift, Copy, Check, Share2, X, Users, Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/shared/toast";

interface ReferralData {
  farmCode: string;
  refLink: string;
  waText: string;
  waShareUrl: string;
  referralsCount: number;
  farmName: string;
}

export function InviteNeighbourModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<ReferralData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const { showToast, ToastComponent } = useToast();

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get("/api/referrals/my-code")
      .then((res: any) => setData(res))
      .catch((err) => {
        console.error("Failed to load referral code:", err);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleCopy = () => {
    if (!data?.refLink) return;
    navigator.clipboard.writeText(data.refLink);
    setCopied(true);
    showToast("Link copied! Share with your farmer friends on WhatsApp.", "success");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      {ToastComponent}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-wangari-border overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-br from-wangari-green-800 to-wangari-green-950 px-6 py-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold text-wangari-green-200 mb-2">
            <Gift className="h-3.5 w-3.5 text-wangari-green-300" />
            <span>Alika Jirani · Invite & Earn</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Give 14 Days Free, Get 1 Month Free</h2>
          <p className="mt-1 text-xs text-wangari-green-100/90 leading-relaxed">
            Invite fellow farmers to Wangari. When they upgrade, your farm gets 1 free month of Starter!
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-8 text-center text-sm text-wangari-muted">
              Loading your invitation link...
            </div>
          ) : (
            <>
              {/* Stats pill */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-wangari-green-50/70 border border-wangari-green-200">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-wangari-green-800 text-white flex items-center justify-center">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-wangari-muted">Farmers Invited</p>
                    <p className="text-sm font-bold text-wangari-green-900">
                      {data?.referralsCount || 0} joined
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-wangari-green-800 bg-wangari-green-200/60 px-2.5 py-1 rounded-full">
                    <Sparkles className="h-3 w-3" />
                    Code: {data?.farmCode || "..."}
                  </span>
                </div>
              </div>

              {/* 3 Step Explanation */}
              <div className="space-y-2 text-xs text-wangari-text">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-[11px] font-bold text-wangari-green-800">
                    1
                  </span>
                  <span>Share your link with neighbouring dairy or poultry farmers.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-[11px] font-bold text-wangari-green-800">
                    2
                  </span>
                  <span>They start keeping records with full livestock and crop features.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-[11px] font-bold text-wangari-green-800">
                    3
                  </span>
                  <span>When they subscribe, your farm is credited with 1 free month!</span>
                </div>
              </div>

              {/* Primary WhatsApp Action */}
              <a
                href={data?.waShareUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <Share2 className="h-4 w-4" />
                <span>Share to WhatsApp (Alika kwa WhatsApp)</span>
              </a>

              {/* Copy link bar */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={data?.refLink || ""}
                  className="flex-1 px-3 py-2 text-xs bg-wangari-cream/60 border border-wangari-border rounded-lg text-wangari-muted select-all"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-wangari-green-100 text-wangari-green-800 hover:bg-wangari-green-200 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-wangari-green-800" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  </>
  );
}
