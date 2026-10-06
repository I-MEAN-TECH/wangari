"use client";

import * as React from "react";
import { Check, Clock, Wheat, Egg, Milk, Heart, Sparkles, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface WorkerTaskCardProps {
  task: {
    id: number;
    title: string;
    description?: string | null;
    category?: string;
    isCompleted: boolean;
  };
  onToggleComplete: (id: number) => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  feed: Wheat,
  eggs: Egg,
  milk: Milk,
  health: Heart,
  cleaning: Sparkles,
  general: AlertCircle,
};

export function WorkerTaskCard({ task, onToggleComplete }: WorkerTaskCardProps) {
  const Icon = CATEGORY_ICONS[task.category || "general"] || AlertCircle;

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={() => onToggleComplete(task.id)}
      className={`p-5 rounded-3xl border-3 transition-all cursor-pointer shadow-sm flex items-center justify-between gap-4 ${
        task.isCompleted
          ? "bg-emerald-50/60 border-emerald-300 text-emerald-950"
          : "bg-white border-gray-200 hover:border-emerald-500 text-wangari-heading"
      }`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
            task.isCompleted
              ? "bg-emerald-600 text-white"
              : "bg-gray-100 text-wangari-muted"
          }`}
        >
          <Icon className="h-6 w-6 stroke-[2.5]" />
        </div>
        <div className="min-w-0">
          <h4
            className={`text-base font-extrabold truncate ${
              task.isCompleted ? "line-through text-emerald-800" : "text-wangari-heading"
            }`}
          >
            {task.title}
          </h4>
          {task.description && (
            <p className="text-xs text-wangari-muted truncate mt-0.5">{task.description}</p>
          )}
        </div>
      </div>

      <div
        className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-all ${
          task.isCompleted
            ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
            : "bg-gray-50 border-gray-300 text-transparent hover:border-emerald-500"
        }`}
      >
        <Check className="h-6 w-6 stroke-[3]" />
      </div>
    </motion.div>
  );
}
