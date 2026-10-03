"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Check,
  Camera,
  Syringe,
  Wheat,
  Heart,
  ClipboardList,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { speciesFor } from "@/lib/species-resolve";
import Link from "next/link";

interface FlockSetupProgressProps {
  flock: any;
}

interface SetupItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  href: string;
  icon: any;
}

export function FlockSetupProgress({ flock }: FlockSetupProgressProps) {
  const [dismissed, setDismissed] = React.useState(false);

  // Only show for first 7 days
  const ageDays = flock.hatchDate
    ? Math.floor((Date.now() - new Date(flock.hatchDate).getTime()) / 86400000)
    : 0;
  const createdDays = flock.createdAt
    ? Math.floor((Date.now() - new Date(flock.createdAt).getTime()) / 86400000)
    : 0;

  // Show for 7 days from creation OR 7 days from hatch (whichever is more recent)
  const showForDays = Math.min(7, createdDays);
  const shouldShow = !dismissed && showForDays < 7 && flock.status === "active";

  if (!shouldShow) return null;

  const species = speciesFor(flock);
  const vaccinations = flock.vaccinations || [];
  const hasVaccinations = vaccinations.length > 0;
  const hasProduction = (flock.production || []).length > 0;
  const hasPhoto = !!flock.photoUrl;
  const hasVetContact = !!(flock.vetName || flock.vetPhone);
  const hasFeedPlan = !!(flock.feedType || flock.feedSupplier);
  const hasCostData = !!(flock.costPerAnimal || flock.totalInvestment);

  const items: SetupItem[] = [
    {
      id: "vaccinations",
      label: "Vaccination schedule",
      description: hasVaccinations
        ? `${vaccinations.length} vaccinations scheduled`
        : "Auto-schedule vaccines",
      completed: hasVaccinations,
      href: "/vaccinations",
      icon: Syringe,
    },
    {
      id: "feed",
      label: "Feed plan",
      description: hasFeedPlan
        ? `${flock.feedType || "Feed configured"}`
        : "Set up feed types & supplier",
      completed: hasFeedPlan,
      href: "/inventory",
      icon: Wheat,
    },
    {
      id: "vet",
      label: "Vet contact",
      description: hasVetContact ? `Dr. ${flock.vetName}` : "Add veterinarian info",
      completed: hasVetContact,
      href: `/flocks`,
      icon: Heart,
    },
    {
      id: "production",
      label: "First production record",
      description: hasProduction ? "Recorded!" : "Log your first day's output",
      completed: hasProduction,
      href: "/production",
      icon: ClipboardList,
    },
    {
      id: "photo",
      label: "Add photo",
      description: hasPhoto ? "Photo uploaded" : "Take a photo of your setup",
      completed: hasPhoto,
      href: `/flocks`,
      icon: Camera,
    },
  ];

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isAllDone = completedCount === totalCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-white">
        <CardContent className="p-5">
          {isAllDone ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-emerald-800">
                  🎉 Setup complete!
                </p>
                <p className="text-xs text-emerald-600">
                  {flock.name} is fully configured. Great work!
                </p>
              </div>
              <button
                onClick={() => setDismissed(true)}
                className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold text-gray-700">
                    Setup Progress
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {completedCount} of {totalCount} completed
                  </p>
                </div>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              {/* Progress bar */}
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 mb-4">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full bg-emerald-500"
                />
              </div>

              {/* Checklist */}
              <div className="space-y-2">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                        item.completed
                          ? "bg-emerald-50/50"
                          : "bg-white border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30"
                      }`}
                    >
                      <div
                        className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          item.completed
                            ? "bg-emerald-500 text-white"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {item.completed ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Icon className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs font-semibold ${
                            item.completed ? "text-emerald-700" : "text-gray-700"
                          }`}
                        >
                          {item.label}
                        </p>
                        <p className="text-[10px] text-gray-400">{item.description}</p>
                      </div>
                      {!item.completed && (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
