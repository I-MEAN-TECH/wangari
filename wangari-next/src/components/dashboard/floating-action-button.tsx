"use client";

import * as React from "react";
import { Plus, X, Egg, ShoppingCart, Bird, Package } from "lucide-react";

/**
 * FloatingActionButton — the Quick Add sheet.
 *
 * A farmer who wants to record something should not have to know which tab it
 * lives under. This offers the four things they actually record, in the words
 * they use for them.
 *
 * Sized to the house system: the trigger is a h-12 w-12 circle and the sheet is
 * a rounded-2xl card, matching every other card and button in the app. The
 * sheet entries are plain rows with an icon, not coloured tiles.
 */
export function FloatingActionButton() {
  const [open, setOpen] = React.useState(false);

  const ACTIONS = [
    { href: "/production", icon: Egg, title: "Log eggs & milk", sub: "Record today's yield" },
    { href: "/finances", icon: ShoppingCart, title: "Record money spent", sub: "Feed, vet or labour costs" },
    { href: "/sales", icon: ShoppingCart, title: "Record a sale", sub: "Sell to a buyer" },
    { href: "/flocks", icon: Bird, title: "Add animals or crops", sub: "Register new stock" },
  ];

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Quick add"
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 border-wangari-card bg-wangari-green-700 text-white shadow-lg transition-transform hover:scale-105 hover:bg-wangari-green-800 active:scale-95"
        >
          {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center">
          <div
            className="fixed inset-0 bg-wangari-ink/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-50 w-full max-w-sm animate-in slide-in-from-bottom rounded-2xl border border-wangari-border bg-wangari-card p-6 shadow-2xl duration-200">
            <div className="mb-4 flex items-start justify-between border-b border-wangari-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-wangari-heading">
                  Quick actions
                </h3>
                <p className="text-sm text-wangari-muted">
                  What do you want to record?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-wangari-subtle transition-colors hover:bg-wangari-cream hover:text-wangari-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="grid gap-2">
              {ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.href + a.title}>
                    <a
                      href={a.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl border border-wangari-border p-3 transition-colors hover:border-wangari-green-300 hover:bg-wangari-cream"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wangari-green-50">
                        <Icon className="h-4 w-4 text-wangari-green-700" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-wangari-heading">
                          {a.title}
                        </span>
                        <span className="block text-xs text-wangari-muted">
                          {a.sub}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 flex items-center justify-center gap-1 text-xs text-wangari-subtle">
              <Package className="h-3.5 w-3.5" aria-hidden />
              Pick what you want to record right now.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default FloatingActionButton;