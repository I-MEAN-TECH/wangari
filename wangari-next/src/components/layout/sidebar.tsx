"use client";

import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PawPrint,
  ClipboardList,
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Settings,
  MessageCircle,
  Truck,
  CalendarRange,
  Trophy,
  ChevronDown,
  LogOut,
  Syringe,
  Stethoscope,
  Thermometer,
  Scale,
  ShieldCheck,
  Calculator,
  CloudSun,
  Leaf,
  Lock,
  CreditCard,
  Search,
  FileText,
  GraduationCap,
  MapPin,
  Landmark,
  PiggyBank,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useFarm } from "@/hooks/useFarm";
import { Tractor } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { WangariMark } from "@/components/ai/wangari-mark";
import api from "@/lib/api-client";
import { UpgradePopup } from "@/components/trial/upgrade-popup";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  moduleKey?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const MODULE_MAP: Record<string, string> = {
  "My Animals": "module_livestock",
  "Livestock": "module_livestock",
  "My Crops": "module_crops",
  "Crops": "module_crops",
  "Daily Output": "module_production",
  "Production": "module_production",
  "Sales": "module_sales",
  "Store / Inventory": "module_inventory",
  "Inventory": "module_inventory",
  "Income & Expenses": "module_finances",
  "Finances": "module_finances",
  "My Workers": "module_workers",
  "Workers": "module_workers",
  "Health & Vaccines": "module_vaccinations",
  "Vaccinations": "module_vaccinations",
  "Feed Helper": "module_feed_calculator",
  "Feed Calculator": "module_feed_calculator",
  "Weather": "module_weather",
  "Reports": "module_reports",
};

const navGroups: NavGroup[] = [
  {
    title: "",
    items: [
      { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" />, moduleKey: "dashboard" },
    ],
  },
  {
    title: "My Farm",
    items: [
      { label: "My Animals", href: "/flocks", icon: <PawPrint className="h-5 w-5" />, moduleKey: "flocks" },
      { label: "My Crops", href: "/crops", icon: <Leaf className="h-5 w-5" />, moduleKey: "crops" },
      { label: "My Plots", href: "/plots", icon: <MapPin className="h-5 w-5" />, moduleKey: "plots" },
      { label: "Cold Chain", href: "/cold-chain", icon: <Thermometer className="h-5 w-5" />, moduleKey: "cold-chain" },
      { label: "Daily Output", href: "/production", icon: <ClipboardList className="h-5 w-5" />, moduleKey: "production" },
      { label: "Health & Vaccines", href: "/vaccinations", icon: <Syringe className="h-5 w-5" />, moduleKey: "vaccinations" },
      { label: "Animal Health", href: "/health", icon: <Stethoscope className="h-5 w-5" />, moduleKey: "health" },
    ],
  },
  {
    title: "Money & Workers",
    items: [
      { label: "Deliveries", href: "/deliveries", icon: <Truck className="h-5 w-5" />, moduleKey: "deliveries" },
      { label: "Income & Expenses", href: "/finances", icon: <DollarSign className="h-5 w-5" />, moduleKey: "finances" },
      { label: "Store / Inventory", href: "/inventory", icon: <Package className="h-5 w-5" />, moduleKey: "inventory" },
      { label: "Documents", href: "/documents", icon: <Search className="h-5 w-5" />, moduleKey: "documents" },
      { label: "Quotes", href: "/quotes", icon: <FileText className="h-5 w-5" />, moduleKey: "quotes" },
      { label: "Market Prices", href: "/market-prices", icon: <Scale className="h-5 w-5" />, moduleKey: "market-prices" },
      { label: "Insurance", href: "/insurance", icon: <ShieldCheck className="h-5 w-5" />, moduleKey: "insurance" },
      { label: "My Loans", href: "/loans", icon: <Landmark className="h-5 w-5" />, moduleKey: "loans" },
      { label: "Money Tools", href: "/money", icon: <PiggyBank className="h-5 w-5" />, moduleKey: "money" },
      { label: "Sales", href: "/sales", icon: <ShoppingCart className="h-5 w-5" />, moduleKey: "sales" },
      { label: "My Workers", href: "/workers", icon: <Users className="h-5 w-5" />, moduleKey: "workers" },
      { label: "Worker Attendance", href: "/attendance", icon: <Users className="h-5 w-5" />, moduleKey: "attendance" },
    ],
  },
  {
    title: "Tools",
    items: [
      { label: "Feed Helper", href: "/feed-calculator", icon: <Calculator className="h-5 w-5" />, moduleKey: "feed-calculator" },
      { label: "Weather", href: "/weather", icon: <CloudSun className="h-5 w-5" />, moduleKey: "weather" },
      { label: "Learn", href: "/library", icon: <GraduationCap className="h-5 w-5" />, moduleKey: "learn" },
      { label: "Wangari", href: "/ai", icon: <WangariMark size={24} />, moduleKey: "ai" },
      { label: "Season Planner", href: "/planner", icon: <CalendarRange className="h-5 w-5" />, moduleKey: "planner" },
      { label: "My Group", href: "/coop", icon: <Users className="h-5 w-5" />, moduleKey: "coop" },
      { label: "My Farm Record", href: "/farm-record", icon: <FileText className="h-5 w-5" />, moduleKey: "farm-record" },
      { label: "Profitability", href: "/profitability", icon: <Trophy className="h-5 w-5" />, moduleKey: "profitability" },
      { label: "Reports", href: "/reports", icon: <BarChart3 className="h-5 w-5" />, moduleKey: "reports" },
      { label: "WhatsApp & USSD", href: "/whatsapp", icon: <MessageCircle className="h-5 w-5" />, badge: "Soon", moduleKey: "whatsapp" },
    ],
  },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, role, signOut } = useAuth();
  const { farm, farms, selectFarm } = useFarm();
  const [showFarmPicker, setShowFarmPicker] = React.useState(false);
  const [moduleSettings, setModuleSettings] = React.useState<Record<string, string>>({});
  const [moduleAccess, setModuleAccess] = React.useState<Record<string, boolean>>({});
  const [lockedModule, setLockedModule] = React.useState<string>("");
  const [trialInfo, setTrialInfo] = React.useState<any>(null);
  const [fullyLocked, setFullyLocked] = React.useState(false);

  const applyStatus = React.useCallback((d: any) => {
    setModuleAccess(d.modules || {});
    setTrialInfo(d);
    // Hard lock: trial expired AND no active subscription → every module locked.
    setFullyLocked(d.locked === true || (!!d.trial && d.trial.status === "expired" && !d.subscription));
    if (d.locked === true || (!!d.trial && d.trial.status === "expired" && !d.subscription)) {
      setLockedModule("Free Trial Expired");
    }
  }, []);

  const refreshStatus = React.useCallback(() => {
    api.get("/api/trial/status").then(applyStatus).catch(() => {});
  }, [applyStatus]);

  React.useEffect(() => {
    api.get("/api/settings").then((d: any) => setModuleSettings(d.settings || {})).catch(() => {});
    refreshStatus();

    // Live updates: redeeming a promo code or completing a payment elsewhere in
    // the app instantly re-evaluates access (padlocks unlock, timer refreshes).
    window.addEventListener("wangari:subscription_updated", refreshStatus);
    window.addEventListener("wangari:trial_expired", refreshStatus);
    return () => {
      window.removeEventListener("wangari:subscription_updated", refreshStatus);
      window.removeEventListener("wangari:trial_expired", refreshStatus);
    };
  }, [refreshStatus]);

  // When fully locked, show the paywall popup right away (don't wait for a click).
  React.useEffect(() => {
    if (fullyLocked) setLockedModule("Free Trial Expired");
  }, [fullyLocked]);

  const isModuleEnabled = (key: string) => moduleSettings[key] !== "false";

  const isModuleLocked = React.useCallback(
    (item: NavItem) => {
      if (fullyLocked) return true;
      const key = item.moduleKey || item.href.replace(/^\//, "").split("/")[0];
      const alwaysOpen = new Set([
        "dashboard",
        "finances",
        "inventory",
        "deliveries",
        "weather",
        "feed-calculator",
        "learn",
        "library",
        "ai",
        "whatsapp",
        "settings",
      ]);

      const isFree =
        trialInfo?.tier === "free_core" ||
        (!trialInfo?.subscription && trialInfo?.trial?.status !== "active");

      if (isFree) {
        return !alwaysOpen.has(key);
      }

      if (key in moduleAccess) {
        return moduleAccess[key] === false;
      }

      const labelKey = item.label.toLowerCase().replace(/\s+/g, "-");
      if (labelKey in moduleAccess) {
        return moduleAccess[labelKey] === false;
      }

      return false;
    },
    [fullyLocked, moduleAccess, trialInfo]
  );

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({
    "": true,
    "My Farm": true,
    "Money & Workers": true,
    Tools: true,
  });

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: prev[title] === false }));
  };

  const isFreePlan =
    trialInfo?.tier === "free_core" ||
    (!trialInfo?.subscription && trialInfo?.trial?.status !== "active");

  const displayGroups = React.useMemo(() => {
    if (!isFreePlan) {
      return navGroups.map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => {
          const lockedA = isModuleLocked(a) ? 1 : 0;
          const lockedB = isModuleLocked(b) ? 1 : 0;
          return lockedA - lockedB;
        }),
      }));
    }

    // Free Plan: Push all accessible free modules to the top for maximum visibility
    const freeItems: NavItem[] = [];
    const lockedGroupsMap: Record<string, NavItem[]> = {
      "My Farm": [],
      "Money & Workers": [],
      "Tools": [],
    };

    navGroups.forEach((g) => {
      g.items.forEach((item) => {
        if (!isModuleLocked(item)) {
          freeItems.push(item);
        } else {
          const groupTitle = g.title || "My Farm";
          if (!lockedGroupsMap[groupTitle]) {
            lockedGroupsMap[groupTitle] = [];
          }
          lockedGroupsMap[groupTitle].push(item);
        }
      });
    });

    const groups: NavGroup[] = [
      {
        title: "",
        items: freeItems,
      },
    ];

    Object.entries(lockedGroupsMap).forEach(([title, items]) => {
      if (items.length > 0) {
        groups.push({
          title,
          items,
        });
      }
    });

    return groups;
  }, [isFreePlan, isModuleLocked]);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[260px] bg-white border-r border-wangari-border flex flex-col">
      {/* Brand + mobile close button */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-wangari-border">
        <Link href="/"><Logo size="lg" /></Link>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden flex items-center justify-center h-9 w-9 rounded-xl text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Farm Switcher */}
      <div className="px-3 py-3 border-b border-wangari-border">
        <button onClick={() => setShowFarmPicker(!showFarmPicker)} className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-wangari-green-50 border border-wangari-green-200 hover:bg-wangari-green-100 transition-colors cursor-pointer">
          <Tractor className="h-4 w-4 text-wangari-green-800" />
          <span className="flex-1 text-left text-sm font-semibold text-wangari-green-800 truncate">{farm?.name || "Select Farm"}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-wangari-green-800 transition-transform", showFarmPicker && "rotate-180")} />
        </button>
        {showFarmPicker && farms.length > 1 && (
          <div className="mt-1 space-y-0.5">
            {farms.map(f => (
              <button key={f.id} onClick={() => { selectFarm(f.id); setShowFarmPicker(false); }}
                className={cn("w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer", f.id === farm?.id ? "bg-wangari-green-800 text-white" : "text-wangari-text hover:bg-wangari-green-50")}>{f.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {displayGroups.map((group) => (
          <div key={group.title || "unlocked"}>
            {group.title && (
              <button
                onClick={() => toggleGroup(group.title)}
                className="flex items-center justify-between w-full px-3 py-2 text-[12px] font-bold text-wangari-text hover:text-wangari-green-800 transition-colors cursor-pointer"
              >
                <span>{group.title}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    openGroups[group.title] !== false ? "rotate-180" : ""
                  )}
                />
              </button>
            )}
            {(openGroups[group.title] ?? true) && (
              <div className="space-y-0.5">
                {group.items.filter(item => {
                  const moduleKey = MODULE_MAP[item.label];
                  return !moduleKey || isModuleEnabled(moduleKey);
                }).map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  const locked = isModuleLocked(item);
                  return (
                    <Link
                      key={item.href}
                      href={locked ? "#" : item.href}
                      onClick={locked ? (e) => { e.preventDefault(); import("@/lib/posthog").then(({ trackEvent }) => trackEvent("locked_module_clicked", { module: item.label })); setLockedModule(item.label); } : onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 min-h-[48px] text-sm font-medium transition-all duration-150",
                        locked
                          ? "text-wangari-muted opacity-70 hover:opacity-100 hover:bg-wangari-gray-50 cursor-pointer"
                          : isActive
                            ? "bg-wangari-green-800 text-white shadow-md"
                            : "text-wangari-text hover:bg-wangari-green-50 hover:text-wangari-green-800"
                      )}
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-extrabold border", isActive ? "bg-wangari-green-700/60 text-white border-wangari-green-500" : "bg-wangari-amber-100 text-wangari-amber-800 border-tone-warn-border")}>
                          {item.badge}
                        </span>
                      )}
                      {locked && (
                        <span
                          className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0",
                            fullyLocked
                              ? "bg-wangari-red-50 text-wangari-red-700 border-wangari-red-200"
                              : "bg-wangari-gray-100 text-wangari-muted border-wangari-border/70"
                          )}
                        >
                          <Lock className="h-3 w-3 shrink-0" />
                          <span>Locked</span>
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Quick links footer */}
      <div className="border-t border-wangari-border px-3 py-2 space-y-0.5">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-all">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Back to Website
        </Link>
        <Link href="/subscription" className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-all">
          <CreditCard className="h-4 w-4" />
          Subscription
        </Link>
        {role === "super_admin" && (
          <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-all">
            <BarChart3 className="h-4 w-4" />
            System Admin
          </Link>
        )}
        <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-all">
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>

      {/* User footer */}
      <div className="border-t border-wangari-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name || "Farmer"} src={user?.avatar || undefined} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-wangari-heading truncate">
              {user?.name || "Farmer"}
            </p>
            <p className="text-[11px] text-wangari-muted capitalize">
              {role?.replace("_", " ") || "Farm Owner"}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex items-center justify-center gap-2 w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-wangari-red-600 bg-tone-bad-bg border border-badge-red-bg hover:bg-badge-red-bg transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
      <UpgradePopup
        open={!!lockedModule}
        onClose={() => setLockedModule("")}
        moduleName={lockedModule}
      />
    </aside>
  );
}
