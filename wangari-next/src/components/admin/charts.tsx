"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { pieSeries as PIE_COLORS } from "@/lib/chart-series";

const GREEN = "#16A34A";
const GREEN_LIGHT = "#4ADE80";

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
    fontSize: 12,
  },
};

function ChartCard({
  title,
  subtitle,
  children,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-wangari-heading">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-wangari-muted">{subtitle}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </Card>
  );
}

// ─── Revenue / activity area chart ────────────────────────
export function TrendAreaChart({
  title,
  subtitle,
  data,
  dataKey,
  labelFormatter,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  data: Record<string, any>[];
  dataKey: string;
  labelFormatter?: (v: string) => string;
  height?: number;
}) {
  return (
    <ChartCard title={title} subtitle={subtitle} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="adminAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.25} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#5F6E85" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => labelFormatter ? labelFormatter(v) : v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11, fill: "#5F6E85" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey={dataKey} stroke={GREEN} strokeWidth={2.5} fill="url(#adminAreaFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Horizontal comparison bar chart ──────────────────────
export function ComparisonBarChart({
  title,
  subtitle,
  data,
  dataKey,
  nameKey = "name",
  height = 260,
}: {
  title: string;
  subtitle?: string;
  data: Record<string, any>[];
  dataKey: string;
  nameKey?: string;
  height?: number;
}) {
  return (
    <ChartCard title={title} subtitle={subtitle} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#5F6E85" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey={nameKey}
            width={110}
            tick={{ fontSize: 12, fill: "#334155" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(22,163,74,0.04)" }} />
          <Bar dataKey={dataKey} fill={GREEN} radius={[0, 6, 6, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Vertical daily bar chart (e.g. signups) ──────────────
export function DailyBarChart({
  title,
  subtitle,
  data,
  dataKey,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  data: Record<string, any>[];
  dataKey: string;
  height?: number;
}) {
  return (
    <ChartCard title={title} subtitle={subtitle} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#5F6E85" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11, fill: "#5F6E85" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(22,163,74,0.04)" }} />
          <Bar dataKey={dataKey} fill={GREEN_LIGHT} radius={[6, 6, 0, 0]} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Donut chart (plan distribution, ticket split, etc.) ──
export function DonutChart({
  title,
  subtitle,
  data,
  dataKey = "value",
  nameKey = "name",
  height = 260,
}: {
  title: string;
  subtitle?: string;
  data: { name: string; value: number }[];
  dataKey?: string;
  nameKey?: string;
  height?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ChartCard title={title} subtitle={subtitle} height={height}>
      {total === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-wangari-subtle">No data yet</div>
      ) : (
        <div className="relative h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey={dataKey}
                nameKey={nameKey}
                innerRadius="62%"
                outerRadius="88%"
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold text-wangari-heading">{total.toLocaleString()}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-wangari-subtle">total</div>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-3">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-wangari-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name} · {d.value}
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}
