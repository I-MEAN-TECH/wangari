"use client";

import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CARD_RAISED } from "@/components/ui/patterns";

// ─── Custom Tooltip ───────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={CARD_RAISED}>
      <p className="text-xs font-semibold text-wangari-muted">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-bold text-wangari-heading">
          {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
};

// ─── Production Trend Chart ───────────────────────────────
interface ProductionChartProps {
  data: { date: string; eggs: number; mortality: number }[];
}

export function ProductionChart({ data }: ProductionChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-wangari-heading">
                Production Trend
              </CardTitle>
              <p className="text-xs text-wangari-muted">
                Daily egg collection & mortality
              </p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-wangari-green-500" />
                <span className="text-[11px] text-wangari-muted">Eggs</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-wangari-subtle" />
                <span className="text-[11px] text-wangari-muted">Mortality</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eggsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#5F6E85" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5F6E85" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="eggs"
                  stroke="#16A34A"
                  strokeWidth={2}
                  fill="url(#eggsFill)"
                />
                <Area
                  type="monotone"
                  dataKey="mortality"
                  stroke="#CBD5E1"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────
interface RevenueChartProps {
  data: { month: string; income: number; expenses: number }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div>
            <CardTitle className="text-base font-bold text-wangari-heading">
              Revenue Overview
            </CardTitle>
            <p className="text-xs text-wangari-muted">Monthly income vs expenses</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#5F6E85" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5F6E85" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="income" fill="#16A34A" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" fill="#E5E7EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Flock Distribution Chart ─────────────────────────────
interface FlockChartProps {
  data: { name: string; value: number }[];
}

const FLOCK_COLORS = ["#166534", "#16A34A", "#4ADE80", "#86EFAC", "#BBF7D0"];

export function FlockChart({ data }: FlockChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div>
            <CardTitle className="text-base font-bold text-wangari-heading">
              Flock Distribution
            </CardTitle>
            <p className="text-xs text-wangari-muted">Birds by flock</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {data.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={FLOCK_COLORS[index % FLOCK_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {data.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: FLOCK_COLORS[i % FLOCK_COLORS.length] }}
                />
                <span className="text-[11px] text-wangari-muted">{entry.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── HDP Trend Chart ────────────────────────────────────
interface HDPTrendChartProps {
  data: { date: string; hdp: number }[];
}

export function HDPTrendChart({ data }: HDPTrendChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-wangari-heading">
                Hen-Day Production
              </CardTitle>
              <p className="text-xs text-wangari-muted">
                % of hens laying each day
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-wangari-heading">
                {data.length > 0 ? data[data.length - 1].hdp : 0}%
              </p>
              <p className="text-[11px] text-wangari-muted">Today</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hdpFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#5F6E85" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => new Date(val).toLocaleDateString("en-KE", { weekday: "short" })}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5F6E85" }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    return (
                      <div className={CARD_RAISED}>
                        <p className="text-xs font-semibold text-wangari-muted">
                          {new Date(String(label)).toLocaleDateString("en-KE", { weekday: "long", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-lg font-bold text-wangari-heading">
                          {payload[0].value}%
                        </p>
                        <p className="text-[11px] text-wangari-muted">Hen-Day Production</p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="hdp"
                  stroke="#16A34A"
                  strokeWidth={2}
                  fill="url(#hdpFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 bg-wangari-green-500" />
              <span className="text-[11px] text-wangari-muted">HDP %</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-wangari-muted">Target: 85%+</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
