"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, CreditCard, Tags, Ticket, TicketPercent,
  Megaphone, Handshake, Mail, ShieldCheck, Activity, Lock, ChevronDown, LogOut, X, Menu, Globe,
  LineChart, Bot,
} from "lucide-react";
import { getAdminToken, getAdminSession, clearAdminSession, AdminSession } from "@/lib/admin-client";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";

/**
 * Admin shell for the super-admin dashboard, styled with the same wangari
 * design system as the farm dashboards (light theme, green accents, same
 * card/border tokens). UX-only guard: presence of an admin token gates
 * rendering — authorization is enforced server-side on every /api/admin call.
 */

const NAV = [
  { section: "Platform", items: [
    { href: "/waadmin", label: "Overview", icon: LayoutDashboard, end: true },
    { href: "/waadmin/analytics", label: "PostHog Analytics", icon: LineChart },
    { href: "/waadmin/farms", label: "Farms", icon: Building2 },
    { href: "/waadmin/users", label: "Users", icon: Users },
    { href: "/waadmin/billing", label: "Billing", icon: CreditCard },
    { href: "/waadmin/plans", label: "Plans & Pricing", icon: Tags },
    { href: "/waadmin/ai", label: "AI Models", icon: Bot },
  ]},
  { section: "Growth", items: [
    { href: "/waadmin/promos", label: "Promo Codes", icon: TicketPercent },
    { href: "/waadmin/crm", label: "CRM Pipeline", icon: Handshake },
    { href: "/waadmin/announcements", label: "Announcements", icon: Megaphone },
    { href: "/waadmin/website", label: "Website", icon: Globe },
  ]},
  { section: "Support", items: [
    { href: "/waadmin/tickets", label: "Tickets", icon: Ticket },
    { href: "/waadmin/emails", label: "Email Ops", icon: Mail },
    { href: "/waadmin/audit", label: "Audit Log", icon: ShieldCheck },
    { href: "/waadmin/system", label: "System Health", icon: Activity },
  ]},
  { section: "Account", items: [
    { href: "/waadmin/security", label: "Security & MFA", icon: Lock },
  ]},
];

export default function WaAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [admin, setAdmin] = React.useState<AdminSession | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false); // user dropdown
  const [drawerOpen, setDrawerOpen] = React.useState(false); // mobile nav

  const isLoginPage = pathname === "/waadmin/login";

  React.useEffect(() => {
    if (isLoginPage) return; // login renders without the shell
    const token = getAdminToken();
    const session = getAdminSession();
    if (!token || !session) {
      router.replace("/waadmin/login");
      return;
    }
    setAdmin(session);
    setReady(true);
  }, [router, isLoginPage]);

  // Close overlays on navigation.
  React.useEffect(() => {
    setMenuOpen(false);
    setDrawerOpen(false);
  }, [pathname]);

  if (isLoginPage) return <>{children}</>;

  if (!ready || !admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wangari-cream">
        <div className="flex items-center gap-2 text-sm text-wangari-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-wangari-green-200 border-t-wangari-green-600" />
          Checking admin session…
        </div>
      </div>
    );
  }

  const isActive = (href: string, end?: boolean) =>
    end ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const signOut = () => {
    clearAdminSession();
    router.replace("/waadmin/login");
  };

  const navContent = (
    <nav className="admin-nav-scroll flex-1 space-y-4 overflow-y-auto px-3 py-3">
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-wangari-subtle">{group.section}</div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.end);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-wangari-green-800 text-white shadow-sm"
                      : "text-wangari-text hover:bg-wangari-green-50 hover:text-wangari-green-800"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-wangari-green-200" : "text-wangari-muted"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-wangari-cream text-wangari-text">
      {/* The admin panel is the first thing to break in an outage and the
          hardest place to guess why — every list simply fails to load. Say so
          at the top instead. */}
      <MaintenanceNotice />
      {/* Sidebar — desktop, fixed so it never scrolls with the page */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-wangari-border bg-white md:flex">
        <div className="flex shrink-0 items-center gap-2.5 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wangari-green-800">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-wangari-heading">Wangari Admin</div>
            <div className="text-[11px] uppercase tracking-widest text-wangari-muted">Mission Control</div>
          </div>
        </div>
        {navContent}
        <div className="shrink-0 border-t border-wangari-border px-4 py-3">
          <div className="relative z-10">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 hover:bg-wangari-cream"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wangari-green-100 text-xs font-bold text-wangari-green-800">
                  {admin.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 text-left">
                  <div className="truncate text-sm font-semibold text-wangari-heading">{admin.name}</div>
                  <div className="truncate text-[11px] font-medium capitalize text-wangari-green-700">{admin.role.replace("_", " ")}</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-wangari-muted" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-xl border border-wangari-border bg-white shadow-lg">
                <Link
                  href="/waadmin/security"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-wangari-text hover:bg-wangari-green-50"
                >
                  <Lock className="h-4 w-4 text-wangari-muted" /> Security & MFA
                </Link>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2 border-t border-wangari-border px-3 py-2.5 text-sm text-badge-red-text hover:bg-badge-red-bg"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Sidebar — mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute left-0 top-0 flex h-full w-[280px] flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-wangari-green-800">
                  <ShieldCheck className="h-4 w-4 text-white" />
                </div>
                <div className="text-sm font-bold text-wangari-heading">Wangari Admin</div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-wangari-muted hover:bg-wangari-cream">
                <X className="h-4 w-4" />
              </button>
            </div>
            {navContent}
            <div className="border-t border-wangari-border p-4">
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-badge-red-text hover:bg-badge-red-bg"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-[260px]">
        {/* Mobile topbar */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-wangari-border bg-white/85 px-4 py-3 backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-2.5">
            <button onClick={() => setDrawerOpen(true)} className="rounded-lg p-1.5 text-wangari-text hover:bg-wangari-cream">
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-sm font-bold text-wangari-heading">Wangari Admin</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-wangari-green-100 text-xs font-bold text-wangari-green-800">
            {admin.name.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
