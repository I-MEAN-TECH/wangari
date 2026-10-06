"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

interface GrowthChartProps {
  production: Array<{
    date: string;
    avgWeight?: number | null;
    weightGain?: number | null;
  }>;
  expectedWeight?: string;
}

export function GrowthChart({ production, expectedWeight }: GrowthChartProps) {
  // Filter records that have weight data
  const weightData = production
    .filter((p) => p.avgWeight && Number(p.avgWeight) > 0)
    .slice(0, 30)
    .reverse();

  if (weightData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Scale className="h-8 w-8 text-wangari-border mb-2" />
        <p className="text-xs text-wangari-gray-400">No weight data recorded yet</p>
        <p className="text-[10px] text-wangari-gray-300 mt-1">Record weights in daily production to see growth trends</p>
      </div>
    );
  }

  const weights = weightData.map((d) => Number(d.avgWeight));
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;

  // Calculate stats
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];
  const totalGain = lastWeight - firstWeight;
  const days = weightData.length;
  const dailyGain = days > 1 ? totalGain / (days - 1) : 0;

  // Parse expected weight for target line
  const expectedMatch = expectedWeight?.match(/[\d.]+/);
  const expectedVal = expectedMatch ? parseFloat(expectedMatch[0]) : null;

  // Chart dimensions
  const chartWidth = 100;
  const chartHeight = 60;
  const padding = { top: 5, right: 5, bottom: 5, left: 5 };

  // Build SVG path
  const points = weights.map((w, i) => {
    const x = padding.left + (i / Math.max(weights.length - 1, 1)) * (chartWidth - padding.left - padding.right);
    const y = padding.top + (1 - (w - minW) / range) * (chartHeight - padding.top - padding.bottom);
    return { x, y, weight: w };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

  // Target line Y position
  const targetY = expectedVal
    ? padding.top + (1 - (expectedVal - minW) / range) * (chartHeight - padding.top - padding.bottom)
    : null;

  return (
    <div className="space-y-3">
      {/* Stats Row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 text-wangari-gray-400" />
          <span className="text-xs text-wangari-gray-400">Current:</span>
          <span className="text-xs font-bold text-wangari-gray-900">{lastWeight} kg</span>
        </div>
        <div className="flex items-center gap-1.5">
          {totalGain > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-wangari-green-500" />
          ) : totalGain < 0 ? (
            <TrendingDown className="h-3.5 w-3.5 text-wangari-red-500" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-wangari-gray-400" />
          )}
          <span className="text-xs text-wangari-gray-400">Gain:</span>
          <span className={cn("text-xs font-bold", totalGain > 0 ? "text-wangari-green-600" : totalGain < 0 ? "text-wangari-red-600" : "text-wangari-gray-500")}>
            {totalGain > 0 ? "+" : ""}{totalGain.toFixed(2)} kg
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-wangari-gray-400">Daily:</span>
          <span className={cn("text-xs font-bold", dailyGain > 0 ? "text-wangari-green-600" : "text-wangari-gray-500")}>
            {dailyGain > 0 ? "+" : ""}{dailyGain.toFixed(3)} kg/day
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative bg-wangari-gray-50 rounded-xl p-3">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padding.top + pct * (chartHeight - padding.top - padding.bottom);
            const val = maxW - pct * range;
            return (
              <g key={pct}>
                <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="0.3" />
                <text x={padding.left - 0.5} y={y + 1} fontSize="2.5" fill="#9ca3af" textAnchor="end">
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Target line */}
          {targetY && targetY >= padding.top && targetY <= chartHeight - padding.bottom && (
            <>
              <line
                x1={padding.left}
                y1={targetY}
                x2={chartWidth - padding.right}
                y2={targetY}
                stroke="#f59e0b"
                strokeWidth="0.4"
                strokeDasharray="1.5 1"
              />
              <text x={chartWidth - padding.right} y={targetY - 1} fontSize="2.5" fill="#f59e0b" textAnchor="end">
                Target: {expectedVal}kg
              </text>
            </>
          )}

          {/* Area fill */}
          <path d={areaD} fill="url(#growthGradient)" opacity="0.3" />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#059669" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1.2" fill="#059669" stroke="white" strokeWidth="0.5" />
          ))}
        </svg>

        {/* Gradient definition */}
        <svg className="hidden">
          <defs>
            <linearGradient id="growthGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Date labels */}
        <div className="flex justify-between mt-1">
          {weightData.length > 0 && (
            <>
              <span className="text-[9px] text-wangari-gray-300">
                {new Date(weightData[0].date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              <span className="text-[9px] text-wangari-gray-300">
                {new Date(weightData[weightData.length - 1].date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Recent Weights */}
      <div className="space-y-1">
        {weightData.slice(-5).reverse().map((d, i) => {
          const prevWeight = i < weightData.length - 1 ? Number(weightData[weightData.length - 1 - i - 1]?.avgWeight) : null;
          const gain = prevWeight ? Number(d.avgWeight) - prevWeight : null;
          return (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-wangari-gray-400">
                {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-wangari-gray-700">{d.avgWeight} kg</span>
                {gain !== null && (
                  <span className={cn("text-[10px]", gain > 0 ? "text-wangari-green-600" : gain < 0 ? "text-wangari-red-600" : "text-wangari-gray-400")}>
                    {gain > 0 ? "+" : ""}{gain.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
