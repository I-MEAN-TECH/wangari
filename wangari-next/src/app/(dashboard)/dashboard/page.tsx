"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Bird,
  Egg,
  Milk,
  Beef,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ShoppingCart,
  DollarSign,
  RefreshCw,
  Wheat,
  Target,
  Heart,
  Leaf,
  PawPrint,
  ClipboardList,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import api from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import { TrialBanner } from "@/components/trial/trial-banner";
import { useSearchParams, useRouter } from "next/navigation";
import { PaymentResultModal } from "@/components/subscription/PaymentResultModal";

// Components
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ProductionChart, RevenueChart, FlockChart, HDPTrendChart } from "@/components/dashboard/Charts";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { AlertsCard } from "@/components/dashboard/Alerts";
import { DailyTasks } from "@/components/dashboard/DailyTasks";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

// ─── FCR Rating ──────────────────────────────────────────
function getFCRRating(fcr: number): { label: string; color: string; bg: string } {
  if (fcr === 0) return { label: "No data yet", color: "text-wangari-muted", bg: "bg-gray-50" };
  if (fcr <= 1.8) return { label: "Excellent", color: "text-wangari-green-700", bg: "bg-wangari-green-50" };
  if (fcr <= 2.2) return { label: "Good", color: "text-wangari-green-700", bg: "bg-wangari-green-50" };
  if (fcr <= 2.5) return { label: "Watch", color: "text-badge-yellow-text", bg: "bg-badge-yellow-bg" };
  return { label: "Too High", color: "text-badge-red-text", bg: "bg-badge-red-bg" };
}

// ─── Mortality Rating ────────────────────────────────────
function getMortalityRating(rate: number): { label: string; color: string; bg: string } {
  if (rate <= 1) return { label: "Normal", color: "text-wangari-green-700", bg: "bg-wangari-green-50" };
  if (rate <= 3) return { label: "Acceptable", color: "text-wangari-green-700", bg: "bg-wangari-green-50" };
  if (rate <= 5) return { label: "Getting High", color: "text-badge-yellow-text", bg: "bg-badge-yellow-bg" };
  return { label: "Critical", color: "text-badge-red-text", bg: "bg-badge-red-bg" };
}

const DEFAULT_WEATHER = {
  temperature: 0,
  feelsLike: 0,
  humidity: 0,
  windSpeed: 0,
  condition: "Unknown",
  description: "Set your farm location for weather",
  icon: "cloud" as const,
  location: "",
  today: { tempMin: 0, tempMax: 0, rainMm: 0, avgHumidity: 0, willRain: false },
  sunrise: "--:--",
  sunset: "--:--",
  forecast: [],
  noData: true,
};

function DashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = React.useState<any>(null);
  const [weather, setWeather] = React.useState<any>(DEFAULT_WEATHER);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [profileDismissed, setProfileDismissed] = React.useState(false);
  const [trialData, setTrialData] = React.useState<any>(null);
  // Hard lock: trial expired + no active subscription → every dashboard action
  // (Record Output, Add Expense, onboarding steps, tasks) is disabled.
  const fullyLocked = !!trialData && trialData.hasAccess === false;
  const [needsFarm, setNeedsFarm] = React.useState(false);
  const [farmName, setFarmName] = React.useState("");
  const [creatingFarm, setCreatingFarm] = React.useState(false);
  const [farmError, setFarmError] = React.useState("");
  const [paymentModal, setPaymentModal] = React.useState<{ type: "success" | "failed"; reference?: string | null } | null>(null);
  const searchParams = useSearchParams();
  const subscribePlan = searchParams.get("subscribe");

  // Handle Paystack checkout on ?subscribe= param → always redirect to /subscription for receipt
  React.useEffect(() => {
    if (subscribePlan && user?.email) {
      const doCheckout = async () => {
        try {
          const res = await api.post("/api/paystack", {
            email: user.email,
            plan: subscribePlan,
            callback_url: `${window.location.origin}/subscription?payment=success`,
          });
          if (res.authorization_url) {
            window.location.href = res.authorization_url;
          }
        } catch (err) {
          console.error("Paystack checkout error:", err);
        }
      };
      doCheckout();
    }
  }, [subscribePlan, user?.email]);

  // Handle ?payment= params if user lands on dashboard (legacy / direct link)
  React.useEffect(() => {
    const payment = searchParams.get("payment");
    const ref = searchParams.get("trxref") || searchParams.get("reference");
    if (payment === "success") {
      setPaymentModal({ type: "success", reference: ref });
      // Clean up URL
      router.replace("/dashboard", { scroll: false });
    } else if (payment === "failed") {
      setPaymentModal({ type: "failed" });
      router.replace("/dashboard", { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = React.useCallback(async () => {
    try {
      // Get GPS coordinates for weather
      let weatherUrl = "/api/weather";
      if ("geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 300000 })
          );
          weatherUrl += `?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`;
        } catch {}
      }

      const [dashboardData, weatherData, trialResult] = await Promise.allSettled([
        api.get("/api/dashboard"),
        api.get(weatherUrl),
        api.get("/api/trial/status"),
      ]);
      // Fresh signup with no farm yet: the API answers 403 + needsFarm.
      if (dashboardData.status === "rejected" && (dashboardData.reason as any)?.needsFarm) {
        setNeedsFarm(true);
        setLoading(false);
        return;
      }
      if (dashboardData.status === "fulfilled") setData(dashboardData.value);
      if (weatherData.status === "fulfilled" && weatherData.value && !weatherData.value.noData) {
        setWeather(weatherData.value);
      }
      if (trialResult.status === "fulfilled") {
        setTrialData(trialResult.value);
        // Lock the UI the moment the API reports the trial expired mid-session.
        if (trialResult.value?.hasAccess === false) {
          window.dispatchEvent(new CustomEvent("wangari:trial_expired", { detail: "locked" }));
        }
      }
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-[3px] border-wangari-green-200 border-t-wangari-green-600 animate-spin" />
          <Bird className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-wangari-green-600" />
        </div>
        <p className="text-sm text-wangari-muted">Loading your farm...</p>
      </div>
    );

  // Fresh signup, no farm yet — inline onboarding instead of an error.
  if (needsFarm) {
    const createFarm = async (e: React.FormEvent) => {
      e.preventDefault();
      setCreatingFarm(true);
      setFarmError("");
      try {
        await api.post("/api/farms", { name: farmName });
        setNeedsFarm(false);
        fetchData(); // reload the dashboard with the new farm
      } catch (err: any) {
        setFarmError(err?.message || "Could not create farm");
      } finally {
        setCreatingFarm(false);
      }
    };
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-wangari-border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-wangari-green-50 text-2xl">🌱</div>
          <h1 className="text-xl font-bold text-wangari-heading">Welcome to Wangari!</h1>
          <p className="mt-2 text-sm text-wangari-muted">
            One last step — name your farm and your 14-day free trial starts immediately.
          </p>
          <form onSubmit={createFarm} className="mt-6 space-y-4 text-left">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-wangari-muted">Farm name</label>
              <input
                required
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g. Lewis Ndungu Farm"
                className="h-12 w-full rounded-xl border border-wangari-border px-4 text-sm focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20"
              />
            </div>
            {farmError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{farmError}</div>}
            <button
              type="submit"
              disabled={creatingFarm || !farmName.trim()}
              className="h-12 w-full rounded-xl bg-wangari-green-600 text-sm font-semibold text-white transition-colors hover:bg-wangari-green-700 disabled:opacity-60"
            >
              {creatingFarm ? "Creating your farm…" : "Create my farm & start trial"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const txs = data?.recentTransactions || [];
  const recentProd = data?.recentProduction || [];
  const mortalityAlerts = data?.mortalityAlerts || [];
  const stockAlerts = data?.stockAlerts || [];
  const vaccinationAlerts = data?.vaccinationAlerts || [];
  const feedItems = data?.feedItems || [];

  // Ratings
  const fcrRating = getFCRRating(data?.fcr || 0);
  const mortalityRating = getMortalityRating(data?.mortalityRate || 0);

  // Chart data
  const productionChartData = recentProd.map((r: any) => ({
    date: new Date(r.date).toLocaleDateString("en-KE", { weekday: "short" }),
    eggs: r.eggsCollected || 0,
    mortality: r.mortality || 0,
  }));

  // Revenue chart - show last 6 months
  const revenueChartData = data?.recentProduction?.length > 0
    ? (() => {
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push({
            month: d.toLocaleDateString("en-KE", { month: "short" }),
            income: i === 0 ? (data?.monthlyRevenue || 0) : 0,
            expenses: i === 0 ? (data?.monthlyExpenses || 0) : 0,
          });
        }
        return months;
      })()
    : [
        { month: "Jan", income: 0, expenses: 0 },
        { month: "Feb", income: 0, expenses: 0 },
        { month: "Mar", income: 0, expenses: 0 },
        { month: "Apr", income: 0, expenses: 0 },
        { month: "Jun", income: 0, expenses: 0 },
      ];

  const flockChartData = data?.flocks?.map((f: any) => ({
    name: f.name,
    value: f.totalBirds || 0,
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Toolbar */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-wangari-green-900 via-wangari-green-800 to-wangari-green-900 p-6 rounded-2xl text-white shadow-md"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {data?.farmName || "Active Farm"}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1.5">
            {greeting}, {user?.name?.split(" ")[0] || "Farmer"}!
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/80 mt-1">
            Here is your daily farm overview and operations summary.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {(!trialData?.subscription || trialData?.subscription?.daysLeft <= 7) && (
            <Link href="/subscription">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold gap-1.5 shadow cursor-pointer">
                <CreditCard className="h-4 w-4" />
                {trialData?.subscription ? "Renew Subscription" : "Subscribe Now"}
              </Button>
            </Link>
          )}
          <Link href={fullyLocked ? "/subscription" : "/production"}>
            <Button
              size="sm"
              title={fullyLocked ? "Subscribe to unlock" : undefined}
              className={`bg-emerald-500 hover:bg-emerald-600 text-white font-bold gap-1.5 shadow cursor-pointer ${fullyLocked ? "opacity-60" : ""}`}
            >
              <Plus className="h-4 w-4" /> Record Today's Output
            </Button>
          </Link>
          <Link href={fullyLocked ? "/subscription" : "/finances"}>
            <Button
              size="sm"
              variant="outline"
              title={fullyLocked ? "Subscribe to unlock" : undefined}
              className={`bg-white/10 hover:bg-white/20 text-white border-white/20 font-medium gap-1.5 cursor-pointer ${fullyLocked ? "opacity-60" : ""}`}
            >
              <DollarSign className="h-4 w-4" /> Add Expense
            </Button>
          </Link>
          <Button
            onClick={handleRefresh}
            variant="ghost"
            size="sm"
            className="text-emerald-100 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </motion.div>

      {/* Payment result modal */}
      {paymentModal && (
        <PaymentResultModal
          type={paymentModal.type}
          reference={paymentModal.reference}
          amount={trialData?.subscription?.amount || null}
          planName={trialData?.subscription?.plan_name || "Wangari Plan"}
          userEmail={user?.email}
          onClose={() => setPaymentModal(null)}
          onRetry={() => {
            setPaymentModal(null);
            router.push("/subscription");
          }}
        />
      )}

      {/* Trial / Subscription Banner */}
      {trialData && (
        <TrialBanner
          trialStatus={trialData.trial?.status || "no_trial"}
          daysLeft={trialData.trial?.daysLeft || 0}
          endsAt={trialData.trial?.endsAt}
          subscription={trialData.subscription}
        />
      )}

      {/* Profile completion reminder */}
      {user && !user.profileComplete && !profileDismissed && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border border-amber-200 bg-amber-50/80">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">Complete your farm profile</p>
                    <p className="text-xs text-[#64748B] mt-0.5">Add your phone, farm location, and details to get the most out of Wangari.</p>
                    <Link href="/settings" className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-amber-700 hover:underline">
                      Complete Profile →
                    </Link>
                  </div>
                </div>
                <button onClick={() => setProfileDismissed(true)} className="text-amber-400 hover:text-amber-600 text-xs shrink-0 cursor-pointer">Dismiss</button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Onboarding banner for new users */}
      {!data?.totalFlocks && !data?.totalBirds && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-2 border-emerald-300 bg-emerald-50/60">
            <CardContent className="p-5">
              <h3 className="text-base font-bold text-[#0F172A] mb-1">Welcome to Wangari!</h3>
              <p className="text-sm text-[#64748B] mb-4">Start here — follow these 3 easy steps:</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { step: "1", icon: <PawPrint className="h-5 w-5" />, text: "Add your animals or crops", href: "/flocks", color: "bg-[#166534]" },
                  { step: "2", icon: <ClipboardList className="h-5 w-5" />, text: "Record today's output", href: "/production", color: "bg-emerald-600" },
                  { step: "3", icon: <DollarSign className="h-5 w-5" />, text: "Record money in or out", href: "/finances", color: "bg-amber-600" },
                ].map(s => (
                  <Link
                    key={s.step}
                    href={fullyLocked ? "/subscription" : s.href}
                    className={`flex items-center gap-3 p-4 rounded-xl bg-white border-2 border-emerald-100 transition-all shadow-sm ${fullyLocked ? "opacity-50" : "hover:border-emerald-400"}`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${s.color} text-white shrink-0`}>{s.icon}</div>
                    <p className="text-sm font-semibold text-[#0F172A]">{s.text}</p>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SECTION 1: Primary Key Indicators (Core Highlights)
          ═══════════════════════════════════════════════════════ */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-wangari-text">Today's Farm Summary</h2>
        </div>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <motion.div variants={fadeUp}>
            <KpiCard
              title="Today's Output"
              value={data?.eggsToday ? `${data.eggsToday} eggs` : data?.milkToday ? `${data.milkToday}L` : `${data?.eggsToday || 0}`}
              icon={data?.milkToday ? <Milk className="h-5 w-5" /> : <Egg className="h-5 w-5" />}
              change={`${data?.henDayProduction || data?.productionRate || 0}% yield today`}
              changeType="positive"
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <KpiCard
              title="My Animals"
              value={(data?.totalBirds || data?.totalAnimals || 0).toLocaleString()}
              icon={<Bird className="h-5 w-5" />}
              change={`${data?.totalFlocks || 0} active groups`}
              changeType="positive"
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <KpiCard
              title="Feed in Store"
              value={data?.feedStock ? `${data.feedStock}` : "Enough"}
              icon={<Wheat className="h-5 w-5" />}
              change={
                stockAlerts.some((a: any) => a.itemName?.toLowerCase().includes("feed"))
                  ? "Low stock — buy more"
                  : "Good supply"
              }
              changeType={
                stockAlerts.some((a: any) => a.itemName?.toLowerCase().includes("feed"))
                  ? "negative"
                  : "positive"
              }
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <KpiCard
              title="Money Earned"
              value={`KES ${(data?.monthlyRevenue || 0).toLocaleString()}`}
              icon={<TrendingUp className="h-5 w-5" />}
              change="This month total"
              changeType="positive"
            />
          </motion.div>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2: Farm Health & Efficiency Metrics
          ═══════════════════════════════════════════════════════ */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-wangari-text">Farm Health Check</h2>
          <p className="text-xs text-wangari-muted">How is your farm performing?</p>
        </div>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Feed Efficiency (FCR) — simplified as Feed Score */}
          <motion.div variants={fadeUp}>
            <Card className="border border-wangari-border bg-white p-4 sm:p-5 hover:border-wangari-green-300 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-wangari-text">Feed Score</p>
                  <p className="text-[10px] text-wangari-muted mt-0.5">How well are animals using feed?</p>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-wangari-heading font-serif">
                    {data?.fcr || "—"}
                  </p>
                  <Badge variant="default" className={`mt-2 ${fcrRating.bg} ${fcrRating.color}`}>
                    {fcrRating.label}
                  </Badge>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4EA] text-[#166534] shrink-0">
                  <Target className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Deaths (Mortality) */}
          <motion.div variants={fadeUp}>
            <Card className="border border-wangari-border bg-white p-4 sm:p-5 hover:border-wangari-green-300 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-wangari-text">Animals Lost</p>
                  <p className="text-[10px] text-wangari-muted mt-0.5">Percentage of animals that died</p>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-wangari-heading font-serif">
                    {data?.mortalityRate || 0}%
                  </p>
                  <Badge variant="default" className={`mt-2 ${mortalityRating.bg} ${mortalityRating.color}`}>
                    {mortalityRating.label}
                  </Badge>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4EA] text-[#166534] shrink-0">
                  <Heart className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Cost per Unit — simplified */}
          <motion.div variants={fadeUp}>
            <Card className="border border-wangari-border bg-white p-4 sm:p-5 hover:border-wangari-green-300 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-wangari-text">Cost per Egg / Litre</p>
                  <p className="text-[10px] text-wangari-muted mt-0.5">How much it costs to produce one unit</p>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-wangari-heading font-serif">
                    {data?.costPerEgg ? `KES ${data.costPerEgg}` : "—"}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4EA] text-[#166534] shrink-0">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Feed per Animal — simplified */}
          <motion.div variants={fadeUp}>
            <Card className="border border-wangari-border bg-white p-4 sm:p-5 hover:border-wangari-green-300 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-wangari-text">Feed per Animal (daily)</p>
                  <p className="text-[10px] text-wangari-muted mt-0.5">Average food each animal eats per day</p>
                  <p className="mt-1.5 text-2xl sm:text-3xl font-bold text-wangari-heading font-serif">
                    {data?.feedPerBird ? `${data.feedPerBird}g` : "—"}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4EA] text-[#166534] shrink-0">
                  <Wheat className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 3: Main Operations & Analytics Split (2-Col Layout)
          ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tasks & Core Charts (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Daily Tasks */}
          <motion.div variants={fadeUp}>
            <Card className="border border-[#E5E7EB] shadow-sm">
              <CardContent className="p-5">
                <DailyTasks flocks={data?.flocks || []} />
              </CardContent>
            </Card>
          </motion.div>

          {/* Production Yield Graph */}
          {productionChartData.length > 0 && (
            <motion.div variants={fadeUp}>
              <ProductionChart data={productionChartData} />
            </motion.div>
          )}

          {/* Revenue vs Expense Graph */}
          <motion.div variants={fadeUp}>
            <RevenueChart data={revenueChartData} />
          </motion.div>

          {/* Recent Financial Transactions */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-bold text-wangari-heading">
                    Recent Transactions
                  </CardTitle>
                  <p className="text-xs text-wangari-muted">Latest financial activity</p>
                </div>
                <Link
                  href="/finances"
                  className="text-xs font-semibold text-wangari-green-700 hover:underline"
                >
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {txs.length === 0 && (
                    <p className="text-sm text-wangari-muted py-6 text-center">
                      No transactions recorded yet.
                    </p>
                  )}
                  {txs.map((tx: any, i: number) => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-wangari-green-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                            tx.type === "income"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {tx.type === "income" ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-wangari-heading">
                            {tx.description || tx.category}
                          </p>
                          <p className="text-[11px] text-wangari-subtle">
                            {new Date(tx.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          tx.type === "income"
                            ? "text-emerald-700"
                            : "text-gray-700"
                        }`}
                      >
                        {tx.type === "income" ? "+" : "-"}KES {Number(tx.amount).toLocaleString()}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column: Weather, Alerts, Stock & Distribution (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Weather Widget */}
          <WeatherWidget
            data={weather}
            location={data?.farmName || "Your Farm"}
          />

          {/* Alerts & Warnings */}
          <AlertsCard
            mortalityAlerts={mortalityAlerts}
            stockAlerts={stockAlerts}
            vaccinationAlerts={vaccinationAlerts}
          />

          {/* Flock / Animal Breakdown */}
          {flockChartData.length > 0 && (
            <motion.div variants={fadeUp}>
              <FlockChart data={flockChartData} />
            </motion.div>
          )}

          {/* Feed Stock Detail */}
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-wangari-heading">
                      Feed Stock Inventory
                    </CardTitle>
                    <p className="text-xs text-wangari-muted">Current feed levels</p>
                  </div>
                  <Link
                    href="/inventory"
                    className="text-xs font-semibold text-wangari-green-700 hover:underline"
                  >
                    Manage
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {feedItems.length === 0 ? (
                  <p className="text-sm text-wangari-muted py-6 text-center">
                    No feed items tracked yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {feedItems.map((item: any, i: number) => (
                      <div key={i} className="rounded-xl border border-wangari-border p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-wangari-heading">
                            {item.name}
                          </p>
                          {item.reorderLevel > 0 && item.quantity <= item.reorderLevel && (
                            <Badge variant="danger">Low</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-wangari-muted">
                          <span>
                            {item.quantity} {item.unit}
                          </span>
                          {item.daysLeft !== null && (
                            <span>~{item.daysLeft} days left</span>
                          )}
                        </div>
                        {item.reorderLevel > 0 && (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wangari-border">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${Math.min((item.quantity / item.reorderLevel) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-[3px] border-wangari-green-200 border-t-wangari-green-600 animate-spin" />
            <Bird className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-wangari-green-600" />
          </div>
          <p className="text-sm text-wangari-muted">Loading your farm...</p>
        </div>
      }
    >
      <DashboardContent />
    </React.Suspense>
  );
}
