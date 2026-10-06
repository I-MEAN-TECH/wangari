"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Settings, User, Bell, Palette, Shield, Save, CheckCircle2, Mail, Phone, MapPin, Lock, Eye, EyeOff, Download, Trash2, Leaf, PawPrint, ClipboardList, ShoppingCart, Package, DollarSign, Users, BarChart3, Calculator, Syringe, Heart, CloudSun, ChevronRight, Fingerprint, Building2, CloudUpload, Crosshair } from "lucide-react";
import { WangariMark } from "@/components/ai/wangari-mark";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { BiometricSettings } from "@/components/settings/BiometricSettings";
import { SyncStatus } from "@/components/settings/SyncStatus";
import { FarmProfileEditor } from "@/components/settings/FarmProfileEditor";
import { useAuth } from "@/hooks/useAuth";
import { linkGoogleAccount, mfaStatus, mfaSetup, mfaVerify, mfaDisable } from "@/lib/auth-client";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

type Tab = "profile" | "farm_profile" | "ai" | "biometric" | "modules" | "notifications" | "preferences" | "security" | "sync" | "data";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "farm_profile", label: "Farm Branding", icon: <Building2 className="h-4 w-4" /> },
  { id: "ai", label: "Wangari", icon: <WangariMark size={18} /> },
  { id: "biometric", label: "Biometric", icon: <Fingerprint className="h-4 w-4" /> },
  { id: "modules", label: "Modules", icon: <Settings className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { id: "preferences", label: "Preferences", icon: <Palette className="h-4 w-4" /> },
  { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
  { id: "sync", label: "Sync", icon: <CloudUpload className="h-4 w-4" /> },
  { id: "data", label: "Data", icon: <Download className="h-4 w-4" /> },
];

const MODULE_ICONS: Record<string, React.ReactNode> = {
  livestock: <PawPrint className="h-4 w-4" />,
  crops: <Leaf className="h-4 w-4" />,
  production: <ClipboardList className="h-4 w-4" />,
  sales: <ShoppingCart className="h-4 w-4" />,
  customers: <Users className="h-4 w-4" />,
  inventory: <Package className="h-4 w-4" />,
  finances: <DollarSign className="h-4 w-4" />,
  workers: <Users className="h-4 w-4" />,
  vaccinations: <Syringe className="h-4 w-4" />,
  calculator: <Calculator className="h-4 w-4" />,
  weather: <CloudSun className="h-4 w-4" />,
  reports: <BarChart3 className="h-4 w-4" />,
  health: <Heart className="h-4 w-4" />,
};

const MODULES = [
  { key: "module_livestock", label: "Livestock", icon: "livestock", desc: "Animal groups and management" },
  { key: "module_crops", label: "Crops", icon: "crops", desc: "Crop fields and harvest tracking" },
  { key: "module_production", label: "Production", icon: "production", desc: "Daily output recording" },
  { key: "module_sales", label: "Sales", icon: "sales", desc: "Product sales and payments" },
  { key: "module_customers", label: "Customers", icon: "customers", desc: "Customer profiles" },
  { key: "module_inventory", label: "Inventory", icon: "inventory", desc: "Feed, seeds, and supplies" },
  { key: "module_finances", label: "Finances", icon: "finances", desc: "Income and expenses" },
  { key: "module_workers", label: "Workers", icon: "workers", desc: "Staff management" },
  { key: "module_vaccinations", label: "Vaccinations", icon: "vaccinations", desc: "Vaccination schedules" },
  { key: "module_feed_calculator", label: "Feed Calculator", icon: "calculator", desc: "Feed requirements" },
  { key: "module_weather", label: "Weather", icon: "weather", desc: "Weather forecasts" },
  { key: "module_reports", label: "Reports", icon: "reports", desc: "Analytics and reports" },
  { key: "module_farm_health", label: "Farm Health", icon: "health", desc: "Farm overview dashboard" },
];

const NOTIFICATIONS = [
  { key: "notif_low_stock", label: "Low stock alerts", desc: "When inventory falls below reorder level", default: true },
  { key: "notif_daily_production", label: "Daily production summary", desc: "Summary of daily output", default: true },
  { key: "notif_mortality", label: "Mortality spike alerts", desc: "When mortality exceeds thresholds", default: true },
  { key: "notif_payment", label: "Payment received", desc: "When a customer pays", default: true },
  { key: "notif_weekly_report", label: "Weekly financial report", desc: "Income, expenses, profit summary", default: false },
  { key: "notif_attendance", label: "Worker absence alerts", desc: "When a worker is absent", default: false },
  { key: "notif_vaccination", label: "Vaccination reminders", desc: "Upcoming vaccination schedules", default: true },
  { key: "notif_weather", label: "Weather alerts", desc: "Frost, rain, extreme heat warnings", default: true },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<Tab>("profile");
  const [loading, setLoading] = React.useState(true);
  const [saved, setSaved] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  // Two-factor (authenticator app) state
  const [mfaEnabled, setMfaEnabled] = React.useState<boolean | null>(null);
  const [mfaBusy, setMfaBusy] = React.useState(false);
  const [mfaUri, setMfaUri] = React.useState("");
  const [mfaQr, setMfaQr] = React.useState("");
  const [mfaCode, setMfaCode] = React.useState("");
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);
  const [disablePw, setDisablePw] = React.useState("");
  const [disableCode, setDisableCode] = React.useState("");
  const { user } = useAuth();
  const { showToast, ToastComponent } = useToast();

  // Profile state
  const [farmName, setFarmName] = React.useState("");
  const [userName, setUserName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [county, setCounty] = React.useState("");

  // M2 registration state — premises number, plot GPS, national ID.
  // The ID is write-only from here: the server only ever returns a mask.
  const [premisesRegNo, setPremisesRegNo] = React.useState("");
  const [nationalIdInput, setNationalIdInput] = React.useState("");
  const [nationalIdMasked, setNationalIdMasked] = React.useState<string | null>(null);
  const [nationalIdClear, setNationalIdClear] = React.useState(false);
  const [gps, setGps] = React.useState<{ lat: string; lng: string } | null>(null);
  const [gpsCleared, setGpsCleared] = React.useState(false);
  const [locating, setLocating] = React.useState(false);

  // Settings state
  const [settings, setSettings] = React.useState<Record<string, string>>({});

  // Password state
  const [currentPw, setCurrentPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");

  // Load 2FA status on mount
  React.useEffect(() => {
    mfaStatus().then((s) => setMfaEnabled(s.enabled)).catch(() => setMfaEnabled(false));
  }, []);

  React.useEffect(() => {
    api.get("/api/settings").then((d: any) => {
      setSettings(d.settings || {});
      setFarmName(d.farm?.name || "");
      setUserName(d.user?.name || "");
      setEmail(d.user?.email || "");
      setPhone(d.user?.phone || "");
      setLocation(d.farm?.location || "");
      setCounty(d.farm?.county || "");
      setPremisesRegNo(d.farm?.premisesRegNo || "");
      setNationalIdMasked(d.user?.nationalIdMasked ?? null);
      setGps(
        d.farm?.latitude != null && d.farm?.longitude != null
          ? { lat: String(d.farm.latitude), lng: String(d.farm.longitude) }
          : null
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const getSetting = (key: string, defaultVal = "true") => settings[key] ?? defaultVal;
  const setSetting = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSaveProfile = async () => {
    try {
      // The server touches only keys PRESENT in the body: absent = unchanged.
      const payload: Record<string, unknown> = {
        farmName, name: userName, email, phone, location, county, premisesRegNo,
      };
      const id = nationalIdInput.trim();
      if (id !== "") payload.nationalId = id;
      else if (nationalIdClear) payload.nationalId = "";
      if (gpsCleared) { payload.latitude = ""; payload.longitude = ""; }
      else if (gps) { payload.latitude = gps.lat; payload.longitude = gps.lng; }

      const res = await api.put("/api/settings/profile", payload);
      // Persist the fresh user (incl. profileComplete) so the dashboard banner clears immediately
      if (res?.user) {
        const { getUser, setUser } = await import("@/lib/auth-client");
        const current = getUser();
        if (current) setUser({ ...current, ...res.user });
      }
      if (id !== "") {
        setNationalIdMasked(`••••${id.replace(/[\s-]/g, "").slice(-4)}`);
        setNationalIdInput("");
      }
      setNationalIdClear(false);
      showToast("Profile updated!");
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      // Validation reasons (bad ID, half GPS pair) come back from the server
      // and are worth showing verbatim — they say what to fix.
      showToast(e?.message || "Failed to update profile");
    }
  };

  // R1: the farmer never types coordinates. GPS is one tap, and the pair is
  // either captured together or left untouched.
  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showToast("Location is not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude.toFixed(7), lng: pos.coords.longitude.toFixed(7) });
        setGpsCleared(false);
        setLocating(false);
      },
      () => { setLocating(false); showToast("Could not get your location — check the permission"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const clearGps = () => { setGps(null); setGpsCleared(true); };

  // The full national ID only ever leaves the server through this owner's own
  // export — as a file, straight to their device.
  const downloadKiamis = async () => {
    try {
      const doc = await api.get("/api/kiamis");
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kiamis-${(doc as any)?.holding?.farmName?.replace(/\s+/g, "-").toLowerCase() || "registration"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const missing = (doc as any)?.missing ?? [];
      showToast(missing.length > 0 ? `Export ready — ${missing.length} field${missing.length === 1 ? "" : "s"} still missing` : "Export ready — all KIAMIS fields recorded");
    } catch { showToast("Could not build the export"); }
  };

  const handleSaveSettings = async () => {
    try {
      await api.put("/api/settings", { settings });
      showToast("Settings saved!");
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch { showToast("Failed to save settings"); }
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) return showToast("Passwords do not match");
    if (newPw.length < 6) return showToast("Password must be at least 6 characters");
    try {
      await api.put("/api/settings/password", { currentPassword: currentPw, newPassword: newPw });
      showToast("Password changed!");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch { showToast("Failed — check current password"); }
  };

  const handleExportAll = () => {
    window.open("/api/export", "_blank");
    showToast("Opening farm data export...");
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#166534]" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Settings</h1>
        <p className="text-sm text-[#64748B] mt-1">Manage your farm, modules, and account</p>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="lg:w-56 shrink-0">
          <Card className="border border-[#E5E7EB]">
            <CardContent className="p-2">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === tab.id ? "bg-[#F0FDF4] text-[#166534] font-bold" : "text-[#64748B] hover:bg-[#FAFBFC]"}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Content */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex-1 min-w-0 space-y-4">

          {/* Profile */}
          {activeTab === "profile" && (
            <Card className="border border-[#E5E7EB]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><User className="h-4 w-4 text-[#166534]" /> Farm Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Farm Name</Label><Input value={farmName} onChange={e => setFarmName(e.target.value)} className="h-11 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Your Name</Label><Input value={userName} onChange={e => setUserName(e.target.value)} className="h-11 rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]"><Mail className="h-3 w-3 inline mr-1" />Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} className="h-11 rounded-xl" /></div>
                  <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]"><Phone className="h-3 w-3 inline mr-1" />Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="h-11 rounded-xl" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]"><MapPin className="h-3 w-3 inline mr-1" />Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} className="h-11 rounded-xl" /></div>
                  <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">County</Label><Input value={county} onChange={e => setCounty(e.target.value)} className="h-11 rounded-xl" /></div>
                </div>

                {/* M2 — registration details (ANITRAC premises, KIAMIS ID + GPS) */}
                <div className="border-t border-gray-100 pt-4 space-y-1">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Registration details</p>
                  <p className="text-[11px] text-gray-500">
                    For county registration (ANITRAC) and the national farmer register (KIAMIS). Optional — your farm works fully without them.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#64748B]">National ID</Label>
                    <Input
                      value={nationalIdInput}
                      onChange={e => { setNationalIdInput(e.target.value); setNationalIdClear(false); }}
                      placeholder={nationalIdMasked ?? "Not recorded"}
                      className="h-11 rounded-xl"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <p className="text-[10px] text-gray-400">
                      {nationalIdMasked ? `Saved ${nationalIdMasked}` : "Digits only — used for KIAMIS registration"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#64748B]">Premises registration no.</Label>
                    <Input value={premisesRegNo} onChange={e => setPremisesRegNo(e.target.value)} placeholder="Issued by the county" className="h-11 rounded-xl" autoComplete="off" />
                    <p className="text-[10px] text-gray-400">ANITRAC §18 — the holding's registration number</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#64748B]"><Crosshair className="h-3 w-3 inline mr-1" />Plot coordinates</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex min-h-[44px] items-center rounded-xl bg-gray-50 px-3 text-xs font-bold text-gray-700">
                      {gps ? `${gps.lat}, ${gps.lng}` : "Not captured"}
                    </span>
                    <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating} className="h-11 rounded-xl">
                      <Crosshair className="h-4 w-4 mr-1.5" /> {locating ? "Locating…" : gps ? "Update from GPS" : "Use my location"}
                    </Button>
                    {gps && (
                      <Button type="button" variant="ghost" onClick={clearGps} className="h-11 rounded-xl text-gray-500">Clear</Button>
                    )}
                    <Button type="button" variant="outline" onClick={downloadKiamis} className="h-11 rounded-xl">
                      <Download className="h-4 w-4 mr-1.5" /> KIAMIS export
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Captured by GPS, never typed. The export lists exactly which registration fields are still missing.
                    {nationalIdMasked && (
                      <button
                        type="button"
                        onClick={() => { setNationalIdClear(true); setNationalIdInput(""); }}
                        className="ml-2 underline text-gray-500 hover:text-red-600 cursor-pointer"
                      >
                        {nationalIdClear ? "ID will be removed on save" : "Remove ID"}
                      </button>
                    )}
                  </p>
                </div>
                <Button onClick={handleSaveProfile} className="bg-[#166534] hover:bg-[#14532D] cursor-pointer">{saved ? <><CheckCircle2 className="h-4 w-4 mr-2" /> Saved!</> : <><Save className="h-4 w-4 mr-2" /> Save Profile</>}</Button>
              </CardContent>
            </Card>
          )}

          {/* Farm Branding / Invoice Profile */}
          {activeTab === "farm_profile" && (
            <FarmProfileEditor />
          )}

          {/* Wangari */}
          {activeTab === "ai" && (
            <Card className="border border-[#E5E7EB]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><WangariMark size={22} /> Wangari</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl bg-wangari-green-50 border border-wangari-green-200 p-5">
                  <p className="text-sm font-bold text-[#0F172A]">Wangari works on your farm records</p>
                  <p className="text-xs text-[#64748B] mt-1">
                    Ask her a question and she reads your flocks, production, sales and money — and she can
                    record things for you, not just answer about them. Tell her things like
                    &ldquo;Record 200 eggs from flock 1 today&rdquo; or &ldquo;How is my farm doing this month?&rdquo;
                  </p>
                  <Link
                    href="/ai"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-wangari-green-800 hover:underline"
                  >
                    Open Wangari <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Biometric Devices */}
          {activeTab === "biometric" && (
            <BiometricSettings />
          )}

          {/* Modules */}
          {activeTab === "modules" && (
            <Card className="border border-[#E5E7EB]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Settings className="h-4 w-4 text-[#166534]" /> Module Control</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-[#94A3B8] mb-3">Toggle modules on or off. Disabled modules hide from the sidebar.</p>
                {MODULES.map(m => {
                  const enabled = getSetting(m.key, "true") === "true";
                  return (
                    <div key={m.key} className="flex items-center justify-between p-3 rounded-xl border border-[#E5E7EB] hover:bg-[#FAFBFC] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={enabled ? "flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0FDF4] text-[#166534]" : "flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-400"}>{MODULE_ICONS[m.icon as string]}</div>
                        <div><p className="text-sm font-bold text-[#0F172A]">{m.label}</p><p className="text-[10px] text-[#94A3B8]">{m.desc}</p></div>
                      </div>
                      <button onClick={() => setSetting(m.key, enabled ? "false" : "true")}
                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? "bg-[#166534]" : "bg-gray-300"}`}>
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
                      </button>
                    </div>
                  );
                })}
                <Button onClick={handleSaveSettings} className="w-full mt-3 bg-[#166534] hover:bg-[#14532D] cursor-pointer">{saved ? "Saved!" : "Save Module Settings"}</Button>
              </CardContent>
            </Card>
          )}

          {/* Notifications */}
          {activeTab === "notifications" && (
            <Card className="border border-[#E5E7EB]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Bell className="h-4 w-4 text-[#166534]" /> Notifications</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {NOTIFICATIONS.map(n => {
                  const enabled = getSetting(n.key, String(n.default)) === "true";
                  return (
                    <div key={n.key} className="flex items-center justify-between p-3 rounded-xl border border-[#E5E7EB] hover:bg-[#FAFBFC] transition-colors">
                      <div><p className="text-sm font-bold text-[#0F172A]">{n.label}</p><p className="text-[10px] text-[#94A3B8]">{n.desc}</p></div>
                      <button onClick={() => setSetting(n.key, enabled ? "false" : "true")}
                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? "bg-[#166534]" : "bg-gray-300"}`}>
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
                      </button>
                    </div>
                  );
                })}
                <Button onClick={handleSaveSettings} className="w-full mt-3 bg-[#166534] hover:bg-[#14532D] cursor-pointer">{saved ? <><CheckCircle2 className="h-4 w-4 mr-2" /> Saved!</> : <><Save className="h-4 w-4 mr-2" /> Save Notifications</>}</Button>
              </CardContent>
            </Card>
          )}

          {/* Preferences */}
          {activeTab === "preferences" && (
            <Card className="border border-[#E5E7EB]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Palette className="h-4 w-4 text-[#166534]" /> Preferences</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Currency</Label>
                  <select value={getSetting("currency", "KES")} onChange={e => setSetting("currency", e.target.value)} className="w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-sm">
                    <option value="KES">KES — Kenyan Shilling</option><option value="USD">USD — US Dollar</option><option value="UGX">UGX — Ugandan Shilling</option><option value="TZS">TZS — Tanzanian Shilling</option>
                  </select></div>
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Language</Label>
                  <select value={getSetting("language", "en")} onChange={e => setSetting("language", e.target.value)} className="w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-sm">
                    <option value="en">English</option><option value="sw">Swahili</option>
                  </select></div>
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Date Format</Label>
                  <select value={getSetting("date_format", "DD/MM/YYYY")} onChange={e => setSetting("date_format", e.target.value)} className="w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-sm">
                    <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
                  </select></div>
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Timezone</Label>
                  <select value={getSetting("timezone", "EAT")} onChange={e => setSetting("timezone", e.target.value)} className="w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-sm">
                    <option value="EAT">East Africa Time (EAT, UTC+3)</option><option value="UTC">Coordinated Universal Time (UTC)</option>
                  </select></div>
                <Button onClick={handleSaveSettings} className="bg-[#166534] hover:bg-[#14532D] cursor-pointer">{saved ? <><CheckCircle2 className="h-4 w-4 mr-2" /> Saved!</> : <><Save className="h-4 w-4 mr-2" /> Save Preferences</>}</Button>
              </CardContent>
            </Card>
          )}

          {/* Security */}
          {activeTab === "security" && (
            <Card className="border border-[#E5E7EB]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Shield className="h-4 w-4 text-[#166534]" /> Security</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Current Password</Label>
                  <div className="relative"><Input type={showPassword ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" className="h-11 rounded-xl pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] cursor-pointer">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">New Password</Label><Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" className="h-11 rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-xs font-semibold text-[#64748B]">Confirm New Password</Label><Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm password" className="h-11 rounded-xl" /></div>
                <Button onClick={handleChangePassword} className="bg-[#166534] hover:bg-[#14532D] cursor-pointer"><Lock className="h-4 w-4 mr-2" /> Update Password</Button>

                {/* One-time recovery codes display */}
                {recoveryCodes && (
                  <div className="rounded-xl bg-amber-50 border border-amber-300 p-4">
                    <p className="text-sm font-bold text-amber-900 mb-1">Save your recovery codes now</p>
                    <p className="text-[11px] text-amber-700 mb-3">
                      If you lose your phone, a recovery code is the only other way in.
                      Each works once. These are shown <strong>only this once</strong>.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {recoveryCodes.map((c) => (
                        <code key={c} className="bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-center font-mono text-xs text-amber-900 select-all">{c}</code>
                      ))}
                    </div>
                    <Button
                      onClick={() => { navigator.clipboard?.writeText(recoveryCodes.join("\n")); showToast("Recovery codes copied"); }}
                      variant="outline"
                      className="mt-3 border-amber-400 text-amber-800 hover:bg-amber-100 cursor-pointer"
                    >
                      Copy all codes
                    </Button>
                  </div>
                )}

                {/* Two-Factor Authentication — authenticator app */}
                <div className="border-t border-[#E5E7EB] pt-4 mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-[#0F172A]">Two-Factor Authentication</p>
                    {mfaEnabled !== null && (
                      <Badge className={mfaEnabled ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]" : "bg-gray-100 text-gray-500 border-gray-200"}>
                        {mfaEnabled ? "Enabled" : "Off"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-[#94A3B8] mb-3">
                    Add an extra lock on your account: after entering your password,
                    you&apos;ll type the 6-digit code from your authenticator app
                    (Google Authenticator, Authy, 1Password…). Even if someone steals
                    your password, they can&apos;t get in.
                  </p>

                  {mfaEnabled === null ? (
                    <p className="text-xs text-[#94A3B8]">Checking…</p>
                  ) : !mfaEnabled ? (
                    !mfaUri ? (
                      <Button
                        onClick={async () => {
                          setMfaBusy(true);
                          try {
                            const s = await mfaSetup();
                            setMfaUri(s.uri);
                            // Render QR locally (no external service — the secret never leaves the page)
                            const QRCode = (await import("qrcode")).default;
                            setMfaQr(await QRCode.toDataURL(s.uri, { width: 180, margin: 1 }));
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : "Failed to start 2FA setup");
                          } finally {
                            setMfaBusy(false);
                          }
                        }}
                        disabled={mfaBusy}
                        variant="outline"
                        className="border-[#166534] text-[#166534] hover:bg-[#F0FDF4] cursor-pointer"
                      >
                        <Shield className="h-4 w-4 mr-2" /> {mfaBusy ? "Preparing…" : "Enable Authenticator App"}
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                          {mfaQr && <img src={mfaQr} alt="Scan this QR code with your authenticator app" className="rounded-xl border border-[#E5E7EB]" />}
                          <div className="text-xs text-[#64748B] space-y-2">
                            <p className="font-bold text-[#0F172A]">1. Scan with your authenticator app</p>
                            <p>Can&apos;t scan? Enter this key manually:</p>
                            <code className="block bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-3 py-2 font-mono text-[11px] break-all select-all">
                              {mfaUri.match(/secret=([^&]+)/)?.[1] || ""}
                            </code>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-[#64748B]">2. Enter the 6-digit code to confirm</Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              value={mfaCode}
                              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="000000"
                              inputMode="numeric"
                              className="h-11 rounded-xl font-mono text-lg tracking-[0.3em] text-center max-w-[180px]"
                            />
                            <Button
                              onClick={async () => {
                                setMfaBusy(true);
                                try {
                                  const r = await mfaVerify(mfaCode);
                                  setMfaEnabled(true);
                                  setMfaUri("");
                                  setMfaQr("");
                                  setMfaCode("");
                                  setRecoveryCodes(r.recoveryCodes);
                                  showToast("Two-factor enabled — save your recovery codes!");
                                } catch (err) {
                                  showToast(err instanceof Error ? err.message : "Invalid code");
                                } finally {
                                  setMfaBusy(false);
                                }
                              }}
                              disabled={mfaBusy || mfaCode.length !== 6}
                              className="bg-[#166534] hover:bg-[#14532D] cursor-pointer"
                            >
                              {mfaBusy ? "Verifying…" : "Confirm & Enable"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-xs font-bold text-[#166534]">
                        ✓ Your account requires an authenticator code at every sign-in
                      </div>
                      <details className="text-xs">
                        <summary className="font-bold text-[#0F172A] cursor-pointer">Disable two-factor</summary>
                        <div className="mt-3 space-y-2">
                          <Input type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} placeholder="Current password" className="h-11 rounded-xl" />
                          <div className="flex gap-2">
                            <Input value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))} placeholder="Authenticator code" className="h-11 rounded-xl font-mono max-w-[180px]" />
                            <Button
                              onClick={async () => {
                                setMfaBusy(true);
                                try {
                                  await mfaDisable(disablePw, disableCode);
                                  setMfaEnabled(false);
                                  setDisablePw("");
                                  setDisableCode("");
                                  showToast("Two-factor disabled");
                                } catch (err) {
                                  showToast(err instanceof Error ? err.message : "Failed to disable");
                                } finally {
                                  setMfaBusy(false);
                                }
                              }}
                              disabled={mfaBusy || !disablePw || !disableCode}
                              variant="outline"
                              className="border-red-300 text-red-600 hover:bg-red-50 cursor-pointer"
                            >
                              Disable
                            </Button>
                          </div>
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                {/* Google Account Linking */}
                <div className="border-t border-[#E5E7EB] pt-4 mt-4">
                  <p className="text-sm font-bold text-[#0F172A] mb-1">Connected Accounts</p>
                  <p className="text-xs text-[#94A3B8] mb-3">Link your Google account for one-click sign-in and profile sync.</p>
                  {user?.googleId ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0]">
                      <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      <div>
                        <p className="text-xs font-bold text-[#166534]">✓ Google Connected</p>
                        <p className="text-[10px] text-[#64748B]">You can sign in with Google</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      id="google-link-btn"
                      onClick={async () => {
                        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                        if (!clientId) { showToast("Google sign-in not configured"); return; }
                        if (!window.google) { showToast("Google loading... please try again"); return; }
                        window.google.accounts.id.initialize({
                          client_id: clientId,
                          callback: async (response: any) => {
                            try {
                              await linkGoogleAccount(response.credential);
                              showToast("Google account connected!");
                              window.location.reload();
                            } catch (err) {
                              showToast(err instanceof Error ? err.message : "Failed to connect");
                            }
                          },
                        });
                        window.google.accounts.id.prompt();
                      }}
                      className="flex items-center gap-3 w-full p-3 rounded-xl border border-[#E5E7EB] hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      <div className="text-left">
                        <p className="text-xs font-bold text-[#0F172A]">Connect Google Account</p>
                        <p className="text-[10px] text-[#94A3B8]">One-click sign-in with your Gmail</p>
                      </div>
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Offline Sync */}
          {activeTab === "sync" && <SyncStatus />}

          {/* Data Management */}
          {activeTab === "data" && (
            <Card className="border border-[#E5E7EB]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Download className="h-4 w-4 text-[#166534]" /> Data Management</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-[#E5E7EB] p-4">
                  <p className="text-sm font-bold text-[#0F172A]">Export All Farm Data</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Download a complete backup of your farm data for loan applications or records.</p>
                  <Button onClick={handleExportAll} variant="outline" className="mt-3 border-[#166534] text-[#166534] hover:bg-[#F0FDF4] cursor-pointer"><Download className="h-4 w-4 mr-2" />Export Data</Button>
                </div>
                <div className="rounded-xl border border-[#E5E7EB] p-4">
                  <p className="text-sm font-bold text-[#0F172A]">Import Data</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Upload CSV files to import livestock, production, sales, and more.</p>
                  <Button onClick={() => window.location.href = "/import"} variant="outline" className="mt-3 border-[#166534] text-[#166534] hover:bg-[#F0FDF4] cursor-pointer"><Download className="h-4 w-4 mr-2" />Import Data</Button>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-bold text-red-700">Danger Zone</p>
                  <p className="text-xs text-red-500 mt-1">Permanently delete your account and all farm data. This cannot be undone.</p>
                  <Button variant="outline" className="mt-3 border-red-300 text-red-600 hover:bg-red-100 cursor-pointer"><Trash2 className="h-4 w-4 mr-2" />Delete Account</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
      {ToastComponent}
    </div>
  );
}
