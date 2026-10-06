"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Inbox } from "lucide-react";

// ─── Page header ──────────────────────────────────────────
export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-wangari-heading sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-sm text-wangari-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Panel (content card with optional title row) ──────────
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-wangari-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold text-wangari-heading">{title}</h2>}
            {description && <p className="mt-0.5 truncate text-xs text-wangari-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </Card>
  );
}

// ─── Stat card (icon tile + value + label + hint) ──────────
const statAccents = {
  green: "bg-wangari-green-50 text-wangari-green-700",
  blue: "bg-badge-blue-bg text-badge-blue-text",
  amber: "bg-badge-yellow-bg text-badge-yellow-text",
  red: "bg-badge-red-bg text-badge-red-text",
  violet: "bg-[#F3E8FF] text-[#7E22CE]",
  slate: "bg-wangari-sunken text-wangari-muted",
} as const;

export function StatCard({
  label,
  value,
  icon,
  accent = "green",
  hint,
  className,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: keyof typeof statAccents;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-wangari-heading sm:text-[26px]">{value}</p>
          {hint && <div className="mt-1 text-xs text-wangari-muted">{hint}</div>}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", statAccents[accent])}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ─── Data table shell (scrolls horizontally on narrow screens) ──
export function TableShell({ children, minWidth = 640 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("whitespace-nowrap border-b border-wangari-border bg-wangari-green-50/50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-wangari-muted", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-wangari-border px-4 py-3 align-middle text-wangari-text", className)}>{children}</td>;
}

// ─── Toolbar (search + filters row) ───────────────────────
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-9 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm text-wangari-heading placeholder:text-wangari-subtle focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20 sm:w-56",
        className
      )}
    />
  );
}

export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-wangari-green-800 text-white"
          : "bg-white text-wangari-muted ring-1 ring-wangari-border hover:bg-wangari-green-50 hover:text-wangari-green-800"
      )}
    >
      {children}
    </button>
  );
}

// ─── States ───────────────────────────────────────────────
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-wangari-muted">
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-wangari-green-200 border-t-wangari-green-600" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-tone-bad-border bg-badge-red-bg px-4 py-3 text-sm font-medium text-badge-red-text">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wangari-cream text-wangari-subtle">
        {icon || <Inbox className="h-5 w-5" />}
      </div>
      <div className="mt-3 text-sm font-semibold text-wangari-heading">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-xs text-wangari-muted">{hint}</div>}
    </div>
  );
}

// ─── Flash / feedback ─────────────────────────────────────
export function Flash({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-wangari-green-200 bg-wangari-green-50 px-4 py-3 text-sm font-medium text-wangari-green-800">
      {message}
    </div>
  );
}

// ─── Primary/secondary buttons (match farm app tokens) ────
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg bg-wangari-green-800 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-wangari-green-700 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border border-wangari-border bg-white px-3 text-sm font-medium text-wangari-text transition-colors hover:bg-wangari-green-50 hover:text-wangari-green-800 disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

// ─── Modal shell ──────────────────────────────────────────
export function Modal({
  title,
  onClose,
  children,
  width = "max-w-md",
  open = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  open?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className={cn("max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-wangari-border bg-white p-6 shadow-xl", width)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-wangari-heading">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-wangari-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-wangari-subtle">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-wangari-border bg-white px-3 text-sm text-wangari-heading focus:border-wangari-green-500 focus:outline-none focus:ring-2 focus:ring-wangari-green-500/20";
