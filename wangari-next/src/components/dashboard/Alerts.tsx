"use client";

import { motion } from "framer-motion";
import { Package, Syringe, TrendingDown, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CARD_ROW_ICON } from "@/components/ui/patterns";

// ─── Mortality Alert ──────────────────────────────────────
interface MortalityAlertProps {
  flockName: string;
  mortalityRate: number;
  totalMortality: number;
}

export function MortalityAlert({ flockName, mortalityRate, totalMortality }: MortalityAlertProps) {
  const isHigh = mortalityRate > 5;

  return (
    <div className={CARD_ROW_ICON}>
      <div className={`rounded-lg p-2 ${isHigh ? "bg-badge-red-bg" : "bg-badge-yellow-bg"}`}>
        <TrendingDown className={`h-4 w-4 ${isHigh ? "text-badge-red-text" : "text-badge-yellow-text"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-wangari-heading truncate">{flockName}</p>
        <p className="text-xs text-wangari-muted">
          {totalMortality} birds lost ({mortalityRate}%)
        </p>
      </div>
      <Badge variant={isHigh ? "danger" : "warning"}>
        {isHigh ? "Critical" : "Watch"}
      </Badge>
    </div>
  );
}

// ─── Low Stock Alert ──────────────────────────────────────
interface LowStockAlertProps {
  itemName: string;
  currentStock: number;
  unit: string;
  reorderLevel: number;
}

export function LowStockAlert({ itemName, currentStock, unit, reorderLevel }: LowStockAlertProps) {
  const percentage = reorderLevel > 0 ? (currentStock / reorderLevel) * 100 : 0;

  return (
    <div className={CARD_ROW_ICON}>
      <div className="rounded-lg bg-badge-yellow-bg p-2">
        <Package className="h-4 w-4 text-badge-yellow-text" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-wangari-heading truncate">{itemName}</p>
        <p className="text-xs text-wangari-muted">
          {currentStock} {unit} left (reorder at {reorderLevel})
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wangari-border">
          <div
            className="h-full rounded-full bg-wangari-green-500"
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
      <Badge variant="warning">Low</Badge>
    </div>
  );
}

// ─── Upcoming Vaccination ─────────────────────────────────
interface VaccinationAlertProps {
  flockName: string;
  vaccineName: string;
  dueDate: string;
}

export function VaccinationAlert({ flockName, vaccineName, dueDate }: VaccinationAlertProps) {
  const daysUntil = Math.ceil(
    (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isUrgent = daysUntil <= 3;

  return (
    <div className={CARD_ROW_ICON}>
      <div className={`rounded-lg p-2 ${isUrgent ? "bg-badge-red-bg" : "bg-badge-blue-bg"}`}>
        <Syringe className={`h-4 w-4 ${isUrgent ? "text-badge-red-text" : "text-badge-blue-text"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-wangari-heading truncate">{flockName}</p>
        <p className="text-xs text-wangari-muted">
          {vaccineName} — {daysUntil <= 0 ? "Overdue" : `in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`}
        </p>
      </div>
      <Badge variant={isUrgent ? "danger" : "info"}>
        {daysUntil <= 0 ? "Overdue" : `${daysUntil}d`}
      </Badge>
    </div>
  );
}

// ─── Alerts Card ──────────────────────────────────────────
interface AlertsCardProps {
  mortalityAlerts: MortalityAlertProps[];
  stockAlerts: LowStockAlertProps[];
  vaccinationAlerts: VaccinationAlertProps[];
}

export function AlertsCard({ mortalityAlerts, stockAlerts, vaccinationAlerts }: AlertsCardProps) {
  const totalAlerts = mortalityAlerts.length + stockAlerts.length + vaccinationAlerts.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-wangari-heading">
                Alerts
              </CardTitle>
              <p className="text-xs text-wangari-muted">
                {totalAlerts === 0
                  ? "All systems healthy"
                  : `${totalAlerts} item${totalAlerts !== 1 ? "s" : ""} need attention`}
              </p>
            </div>
            {totalAlerts > 0 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-badge-red-bg">
                <span className="text-[11px] font-bold text-badge-red-text">{totalAlerts}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {mortalityAlerts.map((alert, i) => (
              <MortalityAlert key={`m-${i}`} {...alert} />
            ))}
            {stockAlerts.map((alert, i) => (
              <LowStockAlert key={`s-${i}`} {...alert} />
            ))}
            {vaccinationAlerts.map((alert, i) => (
              <VaccinationAlert key={`v-${i}`} {...alert} />
            ))}
            {totalAlerts === 0 && (
              <div className="flex flex-col items-center py-8">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-wangari-green-50">
                  <CheckCircle className="h-5 w-5 text-wangari-green-600" />
                </div>
                <p className="text-sm font-medium text-wangari-heading">All clear</p>
                <p className="text-xs text-wangari-muted">No alerts right now</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
