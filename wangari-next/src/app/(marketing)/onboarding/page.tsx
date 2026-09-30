"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bird,
  BarChart3,
  Package,
  Users,
  Egg,
  DollarSign,
  Warehouse,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  MapPin,
  Phone,
  Building2,
} from "lucide-react";
import api from "@/lib/api-client";

const hubs = [
  { id: "livestock", icon: Bird, name: "My Animals", desc: "Cattle, poultry, goats, fish — track every animal", color: "from-emerald-500 to-green-600" },
  { id: "crops", icon: Package, name: "My Crops", desc: "Fields, planting, harvest, and costs", color: "from-amber-500 to-orange-600" },
  { id: "finance", icon: DollarSign, name: "My Money", desc: "Cashbook, expenses, and profit tracking", color: "from-violet-500 to-purple-600" },
  { id: "sales", icon: BarChart3, name: "My Sales", desc: "Customers, orders, and revenue", color: "from-pink-500 to-rose-600" },
  { id: "team", icon: Users, name: "My Team", desc: "Workers, attendance, and wages", color: "from-teal-500 to-cyan-600" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0); // 0=goal, 1=farm info, 2=first entry, 3=done
  const [selectedHub, setSelectedHub] = React.useState("");
  const [farmName, setFarmName] = React.useState("");
  const [farmLocation, setFarmLocation] = React.useState("");
  const [farmPhone, setFarmPhone] = React.useState("");
  const [farmType, setFarmType] = React.useState("");
  const [firstEntry, setFirstEntry] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const selected = hubs.find((h) => h.id === selectedHub);

  const handleGoalSelect = (hubId: string) => {
    setSelectedHub(hubId);
    setStep(1);
  };

  const handleFarmInfoSubmit = () => {
    if (!farmName) return;
    setStep(2);
  };

  const handleFirstEntry = async () => {
    setSaving(true);
    // Save onboarding data
    try {
      await api.post("/api/user-preferences", {
        activeHubs: [selectedHub],
        farmName,
        farmLocation,
        farmPhone,
        farmType: selectedHub,
        onboardedAt: new Date().toISOString(),
      });
    } catch {
      // Continue anyway
    }
    setStep(3);
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1220] via-[#14532D] to-[#166534] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl"
      >
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {[0, 1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${s <= step ? "bg-white" : "bg-white/20"}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Goal Picker */}
          {step === 0 && (
            <motion.div key="goal" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
              <div className="text-center mb-10">
                <motion.div variants={stagger} initial="hidden" animate="visible">
                  <motion.p variants={fadeUp} className="text-white/60 text-sm font-medium mb-3">Welcome to Wangari</motion.p>
                  <motion.h1 variants={fadeUp} className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                    What&apos;s the #1 thing<br />you want to track?
                  </motion.h1>
                  <motion.p variants={fadeUp} className="text-white/50 text-sm mt-3">
                    Pick one. You can always add more later.
                  </motion.p>
                </motion.div>
              </div>

              <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {hubs.map((hub) => (
                  <motion.button
                    key={hub.id}
                    variants={fadeUp}
                    whileHover={{ scale: 1.05, y: -4 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleGoalSelect(hub.id)}
                    className="group relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 text-left hover:bg-white/20 hover:border-white/40 transition-all duration-300 cursor-pointer"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${hub.color} text-white mb-4 group-hover:scale-110 transition-transform`}>
                      <hub.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-white font-bold text-sm">{hub.name}</h3>
                    <p className="text-white/50 text-xs mt-1 leading-relaxed">{hub.desc}</p>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* Step 1: Farm Info */}
          {step === 1 && (
            <motion.div key="info" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
              <div className="text-center mb-8">
                <p className="text-white/60 text-sm font-medium mb-2">Step 1 of 3</p>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  Tell us about your farm
                </h1>
                <p className="text-white/50 text-sm mt-2">This takes less than 2 minutes</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-8 space-y-5">
                <div>
                  <label className="text-white/80 text-sm font-medium mb-1.5 block">Farm Name *</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="e.g. Green Valley Farm"
                      value={farmName}
                      onChange={(e) => setFarmName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-white/80 text-sm font-medium mb-1.5 block">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="e.g. Kiambu, Kenya"
                      value={farmLocation}
                      onChange={(e) => setFarmLocation(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-white/80 text-sm font-medium mb-1.5 block">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                      type="tel"
                      placeholder="+254 7XX XXX XXX"
                      value={farmPhone}
                      onChange={(e) => setFarmPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(0)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={handleFarmInfoSubmit}
                    disabled={!farmName}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-[#166534] text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: First Entry */}
          {step === 2 && (
            <motion.div key="entry" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
              <div className="text-center mb-8">
                <p className="text-white/60 text-sm font-medium mb-2">Step 2 of 3</p>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  Enter your first data
                </h1>
                <p className="text-white/50 text-sm mt-2">
                  {selectedHub === "livestock" && "How many animals do you currently have?"}
                  {selectedHub === "crops" && "What crops are you currently growing?"}
                  {selectedHub === "inventory" && "What&apos;s your main inventory item?"}
                  {selectedHub === "finance" && "What was last month&apos;s approximate revenue?"}
                  {selectedHub === "sales" && "Who are your main customers?"}
                  {selectedHub === "team" && "How many workers do you have?"}
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-8 space-y-5">
                <div>
                  <label className="text-white/80 text-sm font-medium mb-1.5 block">
                    {selectedHub === "livestock" && "Current animal count"}
                    {selectedHub === "crops" && "Crop details"}
                    {selectedHub === "inventory" && "Main item and quantity"}
                    {selectedHub === "finance" && "Last month revenue (KES)"}
                    {selectedHub === "sales" && "Customer names"}
                    {selectedHub === "team" && "Number of workers"}
                  </label>
                  <textarea
                    placeholder={
                      selectedHub === "poultry" ? "e.g. 500 layers, 3 months old" :
                      selectedHub === "crops" ? "e.g. Maize 2 acres, tomatoes 0.5 acres" :
                      selectedHub === "inventory" ? "e.g. Layers mash 50 bags" :
                      selectedHub === "finance" ? "e.g. 75000" :
                      selectedHub === "sales" ? "e.g. John Kamau, Mary Wanjiku" :
                      "e.g. 3 workers"
                    }
                    value={firstEntry}
                    onChange={(e) => setFirstEntry(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={handleFirstEntry}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-[#166534] text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving..." : "Finish Setup"}
                    {!saving && <Check className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <motion.div key="done" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 mx-auto mb-6"
                >
                  <Check className="h-10 w-10 text-white" />
                </motion.div>

                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-3">
                  You&apos;re all set!
                </h1>
                <p className="text-white/60 text-lg max-w-md mx-auto mb-2">
                  Welcome to Wangari, <span className="text-white font-semibold">{farmName}</span>!
                </p>
                <p className="text-white/40 text-sm max-w-md mx-auto mb-10">
                  Your {selected?.name} hub is ready. Start entering daily data and watch your farm come alive.
                </p>

                <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-6 max-w-sm mx-auto mb-8">
                  <p className="text-white/60 text-xs font-medium mb-3 uppercase tracking-wider">Quick Tip</p>
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-[#4ADE80] shrink-0 mt-0.5" />
                    <p className="text-white/80 text-sm leading-relaxed">
                      {selectedHub === "livestock" && "Send a WhatsApp message anytime: \"milk 20, eggs 40, mortality 1, feed 3 bags\" — it logs automatically!"}
                      {selectedHub === "crops" && "Log your daily activities: planting, watering, fertilizing. Wangari tracks costs per crop."}
                      {selectedHub === "inventory" && "Set reorder alerts so you never run out. Wangari warns you 3 days before stockout."}
                      {selectedHub === "finance" && "Log every income and expense. Wangari calculates your real profit automatically."}
                      {selectedHub === "sales" && "Record sales and track who owes you. Wangari sends payment reminders."}
                      {selectedHub === "team" && "Track attendance and wages. Wangari calculates monthly payroll."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white text-[#166534] text-sm font-bold hover:bg-white/90 transition-colors"
                  >
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/dashboard/whatsapp"
                    className="flex items-center gap-2 px-8 py-3.5 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/10 transition-colors"
                  >
                    Set Up WhatsApp Bot
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
