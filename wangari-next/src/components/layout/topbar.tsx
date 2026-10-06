"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, Bell, X, LogOut, Settings, User, ChevronRight, AlertTriangle, Package, Syringe, ArrowUpRight, ArrowDownRight, LifeBuoy } from "lucide-react";
import { HelpModal } from "@/components/support/HelpModal";
import { useAuth } from "@/hooks/useAuth";
import { useFarm } from "@/hooks/useFarm";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import api from "@/lib/api-client";
import { useLanguage } from "@/components/language-provider";

interface TopbarProps {
  onMenuToggle?: () => void;
}

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/flocks": "Livestock",
  "/crops": "Crops",
  "/production": "Production",
  "/finances": "Finances",
  "/sales": "Sales",
  "/inventory": "Inventory",
  "/workers": "Workers",
  "/reports": "Reports",
  "/settings": "Settings",
  "/ai": "Wangari",
  "/vaccinations": "Vaccinations",
  "/attendance": "Attendance",
  "/feed-calculator": "Feed Calculator",
  "/customers": "Customers",
  "/weather": "Weather",
  "/invoices": "Invoices",
};

// ─── Search Pages ─────────────────────────────────────────
const searchablePages = [
  { label: "Dashboard", href: "/dashboard", keywords: "home overview summary" },
  { label: "Livestock", href: "/flocks", keywords: "chickens birds poultry animals herd" },
  { label: "Crops", href: "/crops", keywords: "plants fields farming" },
  { label: "Production", href: "/production", keywords: "eggs milk output yield" },
  { label: "Vaccinations", href: "/vaccinations", keywords: "vaccine health shots medicine" },
  { label: "Finances", href: "/finances", keywords: "money expenses income profit loss" },
  { label: "Sales", href: "/sales", keywords: "sell buyers revenue customer" },
  { label: "Inventory", href: "/inventory", keywords: "stock feed supplies warehouse" },
  { label: "Workers", href: "/workers", keywords: "employees staff labor" },
  { label: "Feed Calculator", href: "/feed-calculator", keywords: "feed ratio nutrition mix" },
  { label: "Weather", href: "/weather", keywords: "forecast rain temperature climate" },
  { label: "Reports", href: "/reports", keywords: "analytics data export" },
  // A farmer looking for help does not search for "chatbot". Wangari is
  // searchable by what she does — record, ask, check — so the words she is
  // useful for are the ones in her keywords, not the ones in her category.
  { label: "Wangari", href: "/ai", keywords: "ask record help assistant question chat check" },
  { label: "WhatsApp Bot", href: "/whatsapp", keywords: "messaging integration" },
  { label: "Settings", href: "/settings", keywords: "config profile account" },
  { label: "Customers", href: "/customers", keywords: "buyers contacts" },
  { label: "Invoices", href: "/invoices", keywords: "billing receipts" },
  { label: "Attendance", href: "/attendance", keywords: "check in clock work hours" },
  { label: "Subscription", href: "/subscription", keywords: "plan billing upgrade" },
];

// ─── Search Command Palette ───────────────────────────────
function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ⌘K shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const results = React.useMemo(() => {
    if (!query.trim()) return searchablePages.slice(0, 8);
    const q = query.toLowerCase();
    return searchablePages.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.keywords.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  const handleSelect = (href: string) => {
    router.push(href);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-50 w-full max-w-md mx-4 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-wangari-border overflow-hidden animate-fade-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-wangari-border">
          <Search className="h-4 w-4 text-wangari-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm text-wangari-heading placeholder:text-wangari-subtle outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-wangari-muted bg-wangari-cream border border-wangari-border rounded-md">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="text-sm text-wangari-muted text-center py-8">No results found</p>
          ) : (
            results.map((page) => (
              <button
                key={page.href}
                onClick={() => handleSelect(page.href)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-wangari-green-50 transition-colors group cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-700 group-hover:bg-wangari-green-100 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-wangari-heading">{page.label}</p>
                  <p className="text-[11px] text-wangari-subtle truncate">{page.href}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notification Dropdown ────────────────────────────────
function NotificationDropdown({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [alerts, setAlerts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open && alerts.length === 0) {
      setLoading(true);
      api.get("/api/dashboard")
        .then((data: any) => {
          const items: any[] = [];
          // Mortality alerts
          (data.mortalityAlerts || []).forEach((a: any) => {
            items.push({
              id: `mortality-${a.flockName}`,
              type: "warning",
              icon: <AlertTriangle className="h-4 w-4" />,
              title: `High mortality: ${a.flockName}`,
              desc: `${a.mortalityRate}% mortality rate (${a.totalMortality} deaths)`,
              href: "/flocks",
            });
          });
          // Stock alerts
          (data.stockAlerts || []).forEach((a: any) => {
            items.push({
              id: `stock-${a.itemName}`,
              type: "danger",
              icon: <Package className="h-4 w-4" />,
              title: `Low stock: ${a.itemName}`,
              desc: `${a.currentStock} ${a.unit} remaining (reorder at ${a.reorderLevel})`,
              href: "/inventory",
            });
          });
          // Vaccination alerts
          (data.vaccinationAlerts || []).forEach((a: any) => {
            items.push({
              id: `vax-${a.flockName}-${a.vaccineName}`,
              type: "info",
              icon: <Syringe className="h-4 w-4" />,
              title: `Vaccination: ${a.vaccineName}`,
              desc: `Due for ${a.flockName} on ${new Date(a.dueDate).toLocaleDateString()}`,
              href: "/vaccinations",
            });
          });
          // Recent transactions
          (data.recentTransactions || []).slice(0, 3).forEach((tx: any) => {
            items.push({
              id: `tx-${tx.id}`,
              type: tx.type === "income" ? "success" : "muted",
              icon: tx.type === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />,
              title: tx.description || tx.category,
              desc: `${tx.type === "income" ? "+" : "-"}KES ${Number(tx.amount).toLocaleString()} • ${new Date(tx.date).toLocaleDateString()}`,
              href: "/finances",
            });
          });
          setAlerts(items);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, alerts.length]);

  const router = useRouter();
  const unreadCount = alerts.filter((a) => a.type !== "muted" && a.type !== "success").length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)}>
      <div className="absolute right-2 sm:right-0 top-full mt-2 w-[calc(100vw-1rem)] sm:w-80 md:w-96 max-w-sm bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-wangari-border overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-wangari-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-wangari-heading">Notifications</h3>
            {unreadCount > 0 && (
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <button onClick={() => onOpenChange(false)} className="text-wangari-muted hover:text-wangari-heading transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-wangari-green-200 border-t-wangari-green-600 animate-spin" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Bell className="h-8 w-8 text-wangari-subtle mx-auto mb-2" />
              <p className="text-sm text-wangari-muted">No notifications</p>
              <p className="text-xs text-wangari-subtle mt-1">Alerts will appear here when there&apos;s activity on your farm</p>
            </div>
          ) : (
            <div className="p-1">
              {alerts.map((item) => {
                const colorMap: Record<string, string> = {
                  warning: "bg-tone-warn-bg text-amber-600",
                  danger: "bg-tone-bad-bg text-red-600",
                  info: "bg-blue-50 text-blue-600",
                  success: "bg-wangari-green-50 text-wangari-green-600",
                  muted: "bg-gray-50 text-gray-500",
                };
                return (
                  <button
                    key={item.id}
                    onClick={() => { router.push(item.href); onOpenChange(false); }}
                    className="w-full flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-wangari-green-50/50 transition-colors text-left cursor-pointer"
                  >
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5", colorMap[item.type] || colorMap.muted)}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-wangari-heading truncate">{item.title}</p>
                      <p className="text-xs text-wangari-muted mt-0.5 line-clamp-2">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Profile Dropdown ─────────────────────────────────────
function ProfileDropdown({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, role, signOut } = useAuth();
  const { farm } = useFarm();
  const router = useRouter();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)}>
      <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-wangari-border overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {/* User info */}
        <div className="px-4 py-4 border-b border-wangari-border">
          <div className="flex items-center gap-3">
            <Avatar name={user?.name || "Farmer"} src={user?.avatar || undefined} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-wangari-heading truncate">{user?.name || "Farmer"}</p>
              <p className="text-xs text-wangari-muted truncate">{user?.email}</p>
              <p className="text-[11px] text-wangari-subtle capitalize mt-0.5">{role?.replace("_", " ") || "Farm Owner"}</p>
            </div>
          </div>
          {farm && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-wangari-green-50 border border-wangari-green-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-wangari-green-700">Current Farm</p>
              <p className="text-xs font-semibold text-wangari-green-800 mt-0.5">{farm.name}</p>
            </div>
          )}
        </div>

        {/* Menu items */}
        <div className="p-1.5">
          <button
            onClick={() => { router.push("/settings"); onOpenChange(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-wangari-green-50 transition-colors cursor-pointer"
          >
            <Settings className="h-4 w-4 text-wangari-muted" />
            <span className="text-sm font-medium text-wangari-heading">Settings</span>
          </button>
          <button
            onClick={() => { router.push("/subscription"); onOpenChange(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-wangari-green-50 transition-colors cursor-pointer"
          >
            <User className="h-4 w-4 text-wangari-muted" />
            <span className="text-sm font-medium text-wangari-heading">Subscription</span>
          </button>
        </div>

        {/* Sign out */}
        <div className="border-t border-wangari-border p-1.5">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-tone-bad-bg transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-600">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Topbar ──────────────────────────────────────────
export function Topbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { lang, setLang } = useLanguage();
  const title = pageTitles[pathname] || "Dashboard";

  const [searchOpen, setSearchOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  // Close dropdowns on route change
  React.useEffect(() => {
    setNotifOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-white/80 backdrop-blur-xl border-b border-wangari-border px-3 sm:px-6 py-3">
        {/* Left */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={onMenuToggle}
            className="lg:hidden flex items-center justify-center h-10 w-10 rounded-xl bg-wangari-green-50 text-wangari-green-800 border border-wangari-green-200 hover:bg-wangari-green-100 transition-colors shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-widest text-wangari-subtle hidden sm:block">
              Wangari
            </p>
            <h1 className="text-base sm:text-lg font-bold text-wangari-heading truncate max-w-[160px] sm:max-w-xs md:max-w-none">{title}</h1>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Language Switcher — short on mobile, full on sm+ */}
          <button
            onClick={() => setLang(lang === "en" ? "sw" : "en")}
            className="flex items-center gap-1 h-9 px-2 sm:px-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-all font-bold text-xs cursor-pointer shadow-xs"
            title="Switch Language / Badili Lugha"
          >
            {/* Short code on xs, full word on sm+ */}
            <span className="sm:hidden">{lang === "sw" ? "SW" : "EN"}</span>
            <span className="hidden sm:inline">{lang === "sw" ? "Swahili" : "English"}</span>
          </button>

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 gap-2 rounded-xl bg-wangari-green-50 text-wangari-green-800 border border-wangari-green-200 hover:bg-wangari-green-100 transition-colors cursor-pointer"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
            <kbd className="hidden sm:inline text-[10px] font-semibold text-wangari-muted">⌘K</kbd>
          </button>

          {/* Help — opens a support ticket into the admin console */}
          <button
            onClick={() => setHelpOpen(true)}
            className="hidden sm:flex items-center justify-center h-9 w-9 rounded-xl bg-wangari-green-50 text-wangari-green-800 border border-wangari-green-200 hover:bg-wangari-green-100 transition-colors cursor-pointer"
            aria-label="Help & Support"
            title="Help & Support"
          >
            <LifeBuoy className="h-4 w-4" />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
              className="relative flex items-center justify-center h-9 w-9 rounded-xl bg-wangari-green-50 text-wangari-green-800 border border-wangari-green-200 hover:bg-wangari-green-100 transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
                !
              </span>
            </button>
            <NotificationDropdown open={notifOpen} onOpenChange={setNotifOpen} />
          </div>

          {/* Profile — always visible (avatar only on xs, avatar+name on md+) */}
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-wangari-border hover:bg-wangari-green-50 rounded-xl py-1.5 pr-2 transition-colors cursor-pointer"
            >
              <Avatar name={user?.name || "Farmer"} src={user?.avatar || undefined} size="sm" />
              <div className="text-left hidden md:block">
                <p className="text-sm font-semibold text-wangari-heading">
                  {user?.name || "Farmer"}
                </p>
                <p className="text-[11px] text-wangari-muted capitalize">
                  {user?.role?.replace("_", " ") || "Farm Owner"}
                </p>
              </div>
            </button>
            <ProfileDropdown open={profileOpen} onOpenChange={setProfileOpen} />
          </div>
        </div>
      </header>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
