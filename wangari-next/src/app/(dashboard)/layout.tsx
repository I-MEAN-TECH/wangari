"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AnnouncementBanner } from "@/components/dashboard/AnnouncementBanner";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";
import { usePathname } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { WorkerBlock } from "@/components/worker-block";
import { AccessGate } from "@/components/access-gate";
import { OnboardingGate } from "@/components/onboarding-gate";
import { FloatingActionButton } from "@/components/dashboard/floating-action-button";
import Link from "next/link";
import {
  LayoutDashboard,
  PawPrint,
  ClipboardList,
  DollarSign,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { pingActivation } from "@/lib/activation";

// ─── Mobile Bottom Navigation ────────────────────────────
// 5 tabs: Home, Animals, Production, Finances, More (opens sidebar)
const mobileNav = [
  { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Animals", href: "/flocks", icon: <PawPrint className="h-5 w-5" /> },
  { label: "Output", href: "/production", icon: <ClipboardList className="h-5 w-5" /> },
  { label: "Money", href: "/finances", icon: <DollarSign className="h-5 w-5" /> },
];

function MobileBottomNav({
  onMenuOpen,
  sidebarOpen,
}: {
  onMenuOpen: () => void;
  sidebarOpen: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white border-t border-wangari-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5 h-16">
        {mobileNav.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors min-h-[48px]",
                isActive
                  ? "text-wangari-green-800"
                  : "text-wangari-muted"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-xl transition-all",
                  isActive && "bg-wangari-green-100"
                )}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}

        {/* More — opens sidebar */}
        <button
          onClick={onMenuOpen}
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors min-h-[48px]",
            sidebarOpen ? "text-wangari-green-800" : "text-wangari-muted"
          )}
          aria-label="Open menu"
        >
          <span
            className={cn(
              "flex items-center justify-center h-8 w-8 rounded-xl transition-all",
              sidebarOpen && "bg-wangari-green-100"
            )}
          >
            <Menu className="h-5 w-5" />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

// ─── Dashboard Layout ─────────────────────────────────────
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const pathname = usePathname();
  const isAI = pathname.startsWith("/ai");

  // Close sidebar on route change
  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // ── Activation funnel heartbeat ──
  // Reaching this layout means the farmer opened the app, which is the one
  // thing we can observe without asking them anything. A successful write is
  // our hint that they may have just recorded something — the server verifies
  // that against real rows, so a client that reports a write which never
  // landed is ignored rather than counted.
  //
  // Silent and fire-and-forget on purpose: this is the measurement we use to
  // decide what to build next, and it must never be able to slow down or break
  // a farmer saving a delivery.
  React.useEffect(() => {
    pingActivation("active");
    const onWrite = () => pingActivation("first_record");
    window.addEventListener("wangari:write_succeeded", onWrite);
    return () => window.removeEventListener("wangari:write_succeeded", onWrite);
  }, []);

  return (
    <WorkerBlock>
      <OnboardingGate>
      <AccessGate>
      <div className="min-h-screen bg-wangari-cream relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on AI page */}
      {!isAI && (
        <div
          className={`fixed inset-y-0 left-0 z-40 w-[260px] transform transition-transform duration-200 lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div className={`${isAI ? "" : "lg:pl-[260px]"} min-h-screen flex flex-col`}>
        {/* Truth-teller for a dead API. Mounted above everything so a farmer
            never mistakes an outage for an empty farm. */}
        {!isAI && <MaintenanceNotice />}
        {!isAI && <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />}
        {!isAI && (
          <div className="px-4 sm:px-6 pt-4">
            <AnnouncementBanner />
          </div>
        )}
        <main
          className={cn(
            isAI ? "" : "flex-1 p-4 sm:p-6",
            // Extra bottom padding on mobile so bottom nav doesn't cover content
            !isAI && "lg:pb-6 main-content-mobile"
          )}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {!isAI && (
        <MobileBottomNav
          onMenuOpen={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
        />
      )}

      {/* Floating Action Button — never on the Wangari page. It sits at the
          bottom right, which is exactly where the composer's send button
          lives, so it rendered underneath it and stole taps meant for
          sending. The page is a single-purpose full-screen surface; a quick
          add shortcut has nowhere to go but on top of the primary action. */}
      {!isAI && <FloatingActionButton />}
    </div>
      </AccessGate>
      </OnboardingGate>
    </WorkerBlock>
  );
}
