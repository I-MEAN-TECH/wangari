"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Check,
  Wheat,
  Syringe,
  Target,
  ChevronRight,
  Calendar,
  DollarSign,
  AlertTriangle,
  Bell,
  Sparkles,
  Bird,
  Beef,
  Droplets,
  Flower,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { speciesTemplates, type SpeciesTemplate } from "@/lib/species-templates";

const iconMap: Record<string, any> = { bird: Bird, beef: Beef, droplets: Droplets, flower: Flower };

interface PostCreateWizardProps {
  flock: any;
  /**
   * Null when we could not tell what species this is.
   *
   * This used to be optional-with-a-default: the caller passed
   * `speciesTemplates[type] || speciesTemplates.layers`, so a dairy herd whose
   * type was missing got Layers feed advice with complete confidence. Feed,
   * vaccine and dosage advice for the wrong animal is worse than no advice, so
   * a null species now renders an honest "we don't know yet" instead.
   */
  species: SpeciesTemplate | null;
  onComplete: () => void;
  onSkip: () => void;
}

export function PostCreateWizard({ flock, species, onComplete, onSkip }: PostCreateWizardProps) {
  const [step, setStep] = React.useState(0); // 0=feed, 1=vaccine, 2=milestone
  const [feedSupplier, setFeedSupplier] = React.useState("");
  const [addToInventory, setAddToInventory] = React.useState(false);
  const [showSchedule, setShowSchedule] = React.useState(true);

  // An unidentifiable species gets a different wizard entirely: confirmation
  // that the group was saved, and an invitation to name the species. It does
  // NOT get someone else's feed plan.
  if (!species) {
    return (
      <Card className="border-2 border-tone-warn-border bg-tone-warn-bg/40 shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {flock.name} added
              </p>
              <p className="text-xs text-tone-warn-text">
                {flock.initialCount} animals recorded
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-amber-900">
            We could not tell what kind of animal this is, so we are not going to guess.
            Feed, vaccine and treatment advice for the wrong animal costs more than no
            advice at all.
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Open the group and set the species to get the right feed plan, vaccine
            schedule and daily rates.
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={onComplete}>Open {flock.name}</Button>
            <Button variant="outline" onClick={onSkip}>Done</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthlyFeedCost = (Number(species.feedCostEstimate) || 0) * (flock.initialCount || 0);
  const hatchDate = flock.hatchDate ? new Date(flock.hatchDate) : new Date();
  const vaccinations = species.vaccinationSchedule || [];

  // Calculate next vaccination date
  const now = new Date();
  const nextVax = vaccinations.find((v) => {
    const d = new Date(hatchDate);
    d.setDate(d.getDate() + v.daysFromStart);
    return d > now;
  });
  const nextVaxDate = nextVax
    ? new Date(hatchDate.getTime() + nextVax.daysFromStart * 86400000)
    : null;

  // Calculate first production milestone
  const firstProdDays = species.growthCycleDays || 180;
  const milestoneDate = new Date(hatchDate.getTime() + firstProdDays * 86400000);
  const breakEvenDate = new Date(hatchDate.getTime() + (species.breakEvenMonths || 6) * 30 * 86400000);

  const steps = [
    { label: "Feed Plan", icon: Wheat },
    { label: "Vaccinations", icon: Syringe },
    { label: "Milestone", icon: Target },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="border-2 border-emerald-200 bg-gradient-to-br from-white to-emerald-50/30 shadow-xl">
        <CardContent className="p-6">
          {/* Success banner */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-3 mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-100"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-900">
                🎉 {flock.name} added!
              </p>
              <p className="text-xs text-emerald-700">
                {flock.initialCount} {species.name} • Complete setup in 3 quick steps
              </p>
            </div>
          </motion.div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {steps.map((s, i) => (
              <React.Fragment key={s.label}>
                <div
                  className={`flex items-center gap-1.5 text-xs font-semibold ${
                    i <= step ? "text-emerald-700" : "text-gray-300"
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                      i < step
                        ? "bg-emerald-500 text-white"
                        : i === step
                        ? "bg-emerald-600 text-white ring-2 ring-emerald-200"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < 2 && (
                  <div
                    className={`flex-1 h-0.5 rounded ${
                      i < step ? "bg-emerald-400" : "bg-gray-100"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step panels.
              This was wrapped in <AnimatePresence mode="wait"> so each step slid
              out before the next slid in. In production it DEADLOCKED: clicking
              "Next: Vaccinations" advanced the step indicator but left the Feed
              Plan panel on screen, because mode="wait" refuses to mount the next
              child until the previous one has finished exiting, and the exit
              never completed. The wizard was stuck on step 0 with no way forward
              except "Skip all".
              The enter animation is kept — the `key` still remounts each panel so
              it slides in. Only the exit animation is dropped, because a wizard
              that cannot advance is worse than a wizard that cuts. */}
          <div key={step}>
            {step === 0 && (
              <motion.div
                key="feed"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <Wheat className="h-5 w-5 text-amber-600" />
                      Feed Plan
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Based on {species.name} requirements
                    </p>
                  </div>

                  {/* Feed info cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-tone-warn-bg border border-amber-100">
                      <p className="text-[10px] font-bold uppercase text-amber-600">Feed Type</p>
                      <p className="text-sm font-bold text-amber-900 mt-1">
                        {species.feedTypes[0] || "—"}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-tone-warn-bg border border-amber-100">
                      <p className="text-[10px] font-bold uppercase text-amber-600">Per Animal/Day</p>
                      <p className="text-sm font-bold text-amber-900 mt-1">
                        {species.feedPerDay}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-tone-warn-bg border border-amber-100">
                      <p className="text-[10px] font-bold uppercase text-amber-600">Water/Day</p>
                      <p className="text-sm font-bold text-amber-900 mt-1">
                        {species.waterPerDay}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <p className="text-[10px] font-bold uppercase text-emerald-600">Monthly Budget</p>
                      <p className="text-sm font-bold text-emerald-900 mt-1">
                        KES {monthlyFeedCost.toLocaleString()}
                      </p>
                      <p className="text-[9px] text-emerald-600">
                        {flock.initialCount} × KES {species.feedCostEstimate.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Feed type list */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">Feed Stages:</p>
                    <div className="space-y-1.5">
                      {species.feedTypes.map((ft, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-xs"
                        >
                          <div className="h-5 w-5 rounded-full bg-amber-100 text-tone-warn-text flex items-center justify-center text-[9px] font-bold">
                            {i + 1}
                          </div>
                          <span className="text-gray-700">{ft}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Optional: supplier */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-500">
                      Feed Supplier (optional)
                    </Label>
                    <Input
                      placeholder="e.g. Kenchic Supplies"
                      value={feedSupplier}
                      onChange={(e) => setFeedSupplier(e.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </div>

                  {/* Auto-add to inventory */}
                  <label className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={addToInventory}
                      onChange={(e) => setAddToInventory(e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">Auto-add to inventory</p>
                      <p className="text-[10px] text-gray-400">
                        Create a feed stock entry for {species.feedTypes[0] || "feed"}
                      </p>
                    </div>
                  </label>
                </div>

                <div className="mt-6 flex gap-2">
                  <Button
                    onClick={() => setStep(1)}
                    className="bg-emerald-700 hover:bg-emerald-800 cursor-pointer"
                  >
                    Next: Vaccinations <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button variant="ghost" onClick={onSkip} className="text-gray-400 cursor-pointer">
                    Skip all
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 1: Vaccination Review */}
            {step === 1 && (
              <motion.div
                key="vaccine"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <Syringe className="h-5 w-5 text-blue-600" />
                      Vaccination Schedule
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {vaccinations.length} vaccinations auto-scheduled from your species template
                    </p>
                  </div>

                  {/* Next vaccination highlight */}
                  {nextVax && nextVaxDate && (
                    <div className="p-4 rounded-xl bg-blue-50 border border-badge-blue-bg">
                      <div className="flex items-center gap-2 mb-1">
                        <Bell className="h-4 w-4 text-blue-600" />
                        <p className="text-xs font-bold text-blue-800">First vaccination due:</p>
                      </div>
                      <p className="text-lg font-bold text-blue-900">
                        {nextVax.vaccine}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        {nextVax.ageLabel} •{" "}
                        {nextVaxDate.toLocaleDateString("en-KE", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                        • ~KES {nextVax.cost} per dose
                      </p>
                    </div>
                  )}

                  {/* Full schedule */}
                  <div className="max-h-64 overflow-y-auto space-y-1.5">
                    {vaccinations.map((vax, i) => {
                      const vaxDate = new Date(hatchDate.getTime() + vax.daysFromStart * 86400000);
                      const isPast = vaxDate < now;
                      const isNext = nextVax && vax.vaccine === nextVax.vaccine;
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 p-2.5 rounded-xl text-xs transition-all ${
                            isNext
                              ? "bg-blue-50 border border-blue-200 ring-1 ring-badge-blue-bg"
                              : isPast
                              ? "bg-gray-50 opacity-60"
                              : "bg-gray-50"
                          }`}
                        >
                          <div
                            className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isPast
                                ? "bg-wangari-border text-gray-500"
                                : isNext
                                ? "bg-blue-500 text-white"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {isPast ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Syringe className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800">{vax.vaccine}</p>
                            <p className="text-[10px] text-gray-400">{vax.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-gray-700">
                              {vaxDate.toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                            </p>
                            <p className="text-[9px] text-gray-400">{vax.ageLabel}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-xl bg-tone-warn-bg border border-amber-100">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-800">Important</p>
                        <p className="text-[11px] text-tone-warn-text mt-0.5">
                          Vaccinations are auto-scheduled based on{" "}
                          {flock.hatchDate ? "the hatch date" : "today"}. You can adjust dates
                          anytime from the Vaccinations page.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                  <Button
                    onClick={() => setStep(2)}
                    className="bg-emerald-700 hover:bg-emerald-800 cursor-pointer"
                  >
                    Next: Milestone <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep(0)}
                    className="cursor-pointer"
                  >
                    Back
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: First Milestone */}
            {step === 2 && (
              <motion.div
                key="milestone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <Target className="h-5 w-5 text-purple-600" />
                      Your First Milestone
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Here&apos;s what to expect with your {species.name}
                    </p>
                  </div>

                  {/* Timeline cards */}
                  <div className="space-y-3">
                    {/* First production */}
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
                          <Target className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-800">
                            First {species.productionMetric} Expected
                          </p>
                          <p className="text-[10px] text-emerald-600">
                            {species.expectedYield}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                        <p className="text-sm font-bold text-emerald-900">
                          {milestoneDate.toLocaleDateString("en-KE", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">
                          ~{Math.round(firstProdDays / 30)} months
                        </Badge>
                      </div>
                    </div>

                    {/* Break-even */}
                    <div className="p-4 rounded-xl bg-blue-50 border border-badge-blue-bg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-8 w-8 rounded-lg bg-blue-500 text-white flex items-center justify-center">
                          <DollarSign className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-blue-800">Break-even Point</p>
                          <p className="text-[10px] text-blue-600">
                            {species.revenuePerUnit}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Calendar className="h-3.5 w-3.5 text-blue-600" />
                        <p className="text-sm font-bold text-blue-900">
                          {breakEvenDate.toLocaleDateString("en-KE", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <Badge className="bg-badge-blue-bg text-badge-blue-text border-blue-200 text-[9px]">
                          ~{species.breakEvenMonths} months
                        </Badge>
                      </div>
                    </div>

                    {/* Investment summary */}
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs font-bold text-gray-600 mb-2">Investment Summary</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Purchase cost</span>
                          <span className="font-bold text-gray-700">
                            KES {flock.totalInvestment ? Number(flock.totalInvestment).toLocaleString() : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Monthly feed cost</span>
                          <span className="font-bold text-gray-700">
                            KES {monthlyFeedCost.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Expected monthly revenue</span>
                          <span className="font-bold text-emerald-700">
                            {species.revenuePerUnit || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-wangari-border pt-1.5">
                          <span className="text-gray-400">Skill level</span>
                          <span className="font-bold text-gray-700">{species.skillLevel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Health alerts */}
                    <div className="p-3 rounded-xl bg-tone-warn-bg border border-amber-100">
                      <p className="text-[10px] font-bold uppercase text-amber-600 mb-1.5">
                        Common Health Issues to Watch
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {species.commonHealthIssues.slice(0, 4).map((issue, i) => (
                          <Badge
                            key={i}
                            className="bg-amber-100 text-tone-warn-text border-tone-warn-border text-[9px]"
                          >
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                  <Button
                    onClick={onComplete}
                    className="bg-emerald-700 hover:bg-emerald-800 cursor-pointer"
                  >
                    <Check className="h-4 w-4 mr-2" /> Done — View {flock.name}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="cursor-pointer"
                  >
                    Back
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
