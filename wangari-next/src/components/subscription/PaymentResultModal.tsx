"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Download, ArrowLeft, Printer, ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PaymentResultModalProps {
  type: "success" | "failed";
  reference?: string | null;
  amount?: number | null;
  planName?: string | null;
  userEmail?: string | null;
  reason?: string | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function PaymentResultModal({
  type,
  reference,
  amount,
  planName,
  userEmail,
  reason,
  onClose,
  onRetry,
}: PaymentResultModalProps) {
  const receiptRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date().toLocaleDateString("en-KE", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const refCode = reference || `PAY-${Math.floor(100000 + Math.random() * 900000)}`;

  if (type === "failed") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-badge-red-bg text-center animate-in fade-in zoom-in duration-200">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-tone-bad-bg text-wangari-red-600 mb-4 border border-badge-red-bg">
            <XCircle className="h-10 w-10" />
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-wangari-gray-900">Payment Not Processed</h2>
          <p className="text-xs sm:text-sm text-wangari-gray-500 mt-1">
            Your transaction was not completed. No funds were deducted from your account.
          </p>

          <div className="mt-5 rounded-2xl bg-tone-bad-bg/80 border border-tone-bad-border/60 p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-tone-bad-text">
              <AlertTriangle className="h-4 w-4 shrink-0 text-wangari-red-600" />
              Reason for status:
            </div>
            <p className="text-xs text-badge-red-text leading-relaxed font-medium">
              {reason || "The directory server or payment prompt timed out before confirmation. This usually happens if the phone STK push prompt expired, or network connection was interrupted."}
            </p>
          </div>

          <div className="mt-4 rounded-xl bg-wangari-gray-50 p-3 text-left">
            <p className="text-[11px] font-semibold text-wangari-gray-500 uppercase tracking-wider mb-1">What to do next:</p>
            <ul className="text-xs text-wangari-gray-600 space-y-1 list-disc list-inside">
              <li>Keep your phone unlocked when initiating payment</li>
              <li>Check your M-Pesa PIN prompt immediately</li>
              <li>Or try using a credit/debit card</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <Button
              onClick={onRetry || onClose}
              className="w-full bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-bold gap-2 cursor-pointer py-3 rounded-xl shadow-md"
            >
              <RefreshCw className="h-4 w-4" /> Try Payment Again
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full border-wangari-border text-wangari-gray-700 font-semibold cursor-pointer py-3 rounded-xl"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success View with Formal Official Receipt
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto print:bg-white print:p-0">
      <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-wangari-green-100 animate-in fade-in zoom-in duration-200 print:shadow-none print:border-none print:w-full print:max-w-none">
        
        {/* Screen Only Success Header */}
        <div className="text-center print:hidden mb-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-wangari-green-50 text-wangari-green-600 mb-3 border border-wangari-green-100">
            <CheckCircle2 className="h-10 w-10 text-wangari-green-800" />
          </div>
          <h2 className="text-2xl font-extrabold text-wangari-gray-900">Payment Successful!</h2>
          <p className="text-xs text-wangari-gray-500 mt-1">
            Thank you for subscribing to Wangari Farm Management. Your account is fully active.
          </p>
        </div>

        {/* Printable Official Invoice & Statement Receipt */}
        <div ref={receiptRef} className="rounded-2xl border border-wangari-border bg-wangari-gray-50/50 p-6 print:border-none print:bg-white print:p-0">
          {/* Receipt Top Brand Header */}
          <div className="flex items-center justify-between border-b border-wangari-border pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-wangari-green-800 text-white flex items-center justify-center font-black text-xs">W</div>
                <span className="text-lg font-black text-wangari-heading tracking-tight">WANGARI</span>
              </div>
              <p className="text-[10px] text-wangari-gray-400 mt-0.5">IMEAN TECH LIMITED • Nairobi, Kenya</p>
              <p className="text-[10px] text-wangari-gray-400">support@imeantech.com</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 rounded-full bg-wangari-green-100 text-wangari-green-800 text-xs font-black uppercase tracking-wider">
                PAID RECEIPT
              </span>
              <p className="text-xs font-mono font-bold text-wangari-gray-700 mt-1">Ref: {refCode}</p>
              <p className="text-[10px] text-wangari-gray-400">{formattedDate}</p>
            </div>
          </div>

          {/* Customer & Statement Info */}
          <div className="grid grid-cols-2 gap-4 text-xs mb-4">
            <div>
              <p className="text-[10px] font-bold text-wangari-gray-400 uppercase tracking-wider">Billed To</p>
              <p className="font-bold text-wangari-gray-800 mt-0.5">{userEmail || "Registered Customer"}</p>
              <p className="text-wangari-gray-500">Wangari Platform Account</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-wangari-gray-400 uppercase tracking-wider">Payment Method</p>
              <p className="font-bold text-wangari-gray-800 mt-0.5">Paystack / M-Pesa Card</p>
              <p className="text-wangari-gray-500">Status: Completed ✅</p>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="border border-wangari-border rounded-xl overflow-hidden mb-4 bg-white">
            <div className="grid grid-cols-12 bg-wangari-gray-100 p-2.5 text-[10px] font-bold uppercase text-wangari-gray-500 tracking-wider">
              <div className="col-span-8">Description</div>
              <div className="col-span-4 text-right">Amount</div>
            </div>
            <div className="grid grid-cols-12 p-3 text-xs border-t border-wangari-gray-100">
              <div className="col-span-8">
                <p className="font-bold text-wangari-gray-900">{planName || "Wangari Subscription Plan"}</p>
                <p className="text-[10px] text-wangari-gray-400">Full platform access • Unlimited records & reports</p>
              </div>
              <div className="col-span-4 text-right font-bold text-wangari-gray-900">
                KES {amount ? (amount / 100).toLocaleString() : "—"}
              </div>
            </div>
            <div className="grid grid-cols-12 p-3 text-xs bg-wangari-green-50/50 border-t border-wangari-border">
              <div className="col-span-8 font-extrabold text-wangari-heading">TOTAL PAID</div>
              <div className="col-span-4 text-right font-black text-lg text-wangari-green-800">
                KES {amount ? (amount / 100).toLocaleString() : "—"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-wangari-gray-400 justify-center">
            <ShieldCheck className="h-3.5 w-3.5 text-wangari-green-600" />
            <span>Official digital payment record. Save or print for your tax reference.</span>
          </div>
        </div>

        {/* Modal Action Buttons (Hidden when printing) */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 print:hidden">
          <Button
            onClick={handlePrint}
            variant="outline"
            className="w-full border-wangari-border text-wangari-gray-700 font-bold gap-2 cursor-pointer py-3 rounded-xl hover:bg-wangari-gray-50"
          >
            <Printer className="h-4 w-4" /> Download / Print Receipt
          </Button>
          <Link href="/dashboard" className="w-full">
            <Button
              onClick={onClose}
              className="w-full bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-extrabold gap-2 cursor-pointer py-3 rounded-xl shadow-md"
            >
              Go to Dashboard →
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
