"use client";

import * as React from "react";
import { Plus, X, Egg, DollarSign, ShoppingCart, Bird } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";

export function FloatingActionButton() {
  const [open, setOpen] = React.useState(false);
  const { lang, t } = useLanguage();

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setOpen(!open)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-wangari-green-700 text-white shadow-lg hover:bg-wangari-green-800 hover:scale-105 active:scale-95 transition-all cursor-pointer border-2 border-white"
          aria-label="Quick Add"
        >
          {open ? <X className="h-7 w-7" /> : <Plus className="h-8 w-8" />}
        </button>
      </div>

      {/* Slide-Up Quick Action Modal */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-50 w-full max-w-sm rounded-3xl bg-wangari-card p-6 shadow-2xl border border-wangari-border animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-wangari-border mb-4">
              <div>
                <h3 className="text-base font-extrabold text-wangari-heading">
                  "Quick Actions 🚜"
                </h3>
                <p className="text-xs text-wangari-muted">
                  "Select what you want to record right now"
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-wangari-subtle hover:text-wangari-text p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {[
                {
                  href: "/production",
                  icon: Egg,
                  color: "bg-tone-good-bg text-tone-good-text border-tone-good-border",
                  title: "Log Eggs & Milk",
                  subtitle: "Record today's yield",
                },
                {
                  href: "/finances",
                  icon: DollarSign,
                  color: "bg-tone-warn-bg text-tone-warn-text border-tone-warn-border",
                  title: "Record Money Spent",
                  subtitle: "Feed, vet, or labor costs",
                },
                {
                  href: "/sales",
                  icon: ShoppingCart,
                  color: "bg-blue-50 text-blue-700 border-blue-200",
                  title: "Record a Sale",
                  subtitle: "Sell to buyers",
                },
                {
                  href: "/flocks",
                  icon: Bird,
                  color: "bg-purple-50 text-purple-700 border-purple-200",
                  title: "Add Animals / Crops",
                  subtitle: "Register new stock",
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border ${item.color} hover:shadow-md transition-all active:scale-98`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-wangari-card shadow-sm shrink-0">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-wangari-heading">{item.title}</p>
                    <p className="text-xs text-wangari-muted mt-0.5">{item.subtitle}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
