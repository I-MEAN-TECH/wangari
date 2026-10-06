"use client";

import * as React from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Database,
  Plus,
  Trash2,
  Eye,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskItem {
  id: string;
  toolName: string;
  args: Record<string, any>;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  timestamp: number;
}

interface TaskPanelProps {
  tasks: TaskItem[];
  onClear: () => void;
}

const toolIcons: Record<string, React.ReactNode> = {
  list_flocks: <Eye className="h-3.5 w-3.5" />,
  create_flock: <Plus className="h-3.5 w-3.5" />,
  delete_flock: <Trash2 className="h-3.5 w-3.5" />,
  list_production: <Eye className="h-3.5 w-3.5" />,
  record_production: <Plus className="h-3.5 w-3.5" />,
  list_transactions: <Eye className="h-3.5 w-3.5" />,
  create_transaction: <Plus className="h-3.5 w-3.5" />,
  list_sales: <Eye className="h-3.5 w-3.5" />,
  create_sale: <Plus className="h-3.5 w-3.5" />,
  list_inventory: <Eye className="h-3.5 w-3.5" />,
  create_inventory_item: <Plus className="h-3.5 w-3.5" />,
  list_workers: <Eye className="h-3.5 w-3.5" />,
  create_worker: <Plus className="h-3.5 w-3.5" />,
  list_customers: <Eye className="h-3.5 w-3.5" />,
  create_customer: <Plus className="h-3.5 w-3.5" />,
  list_vaccinations: <Eye className="h-3.5 w-3.5" />,
  create_vaccination: <Plus className="h-3.5 w-3.5" />,
  list_attendance: <Eye className="h-3.5 w-3.5" />,
  record_attendance: <Plus className="h-3.5 w-3.5" />,
  get_weather: <Zap className="h-3.5 w-3.5" />,
  get_dashboard: <Database className="h-3.5 w-3.5" />,
  navigate_to: <ChevronRight className="h-3.5 w-3.5" />,
};

function formatToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatArgs(args: Record<string, any>): string {
  const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ");
}

export function TaskPanel({ tasks, onClear }: TaskPanelProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-600 mb-3">
          <Zap className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-wangari-heading">AI Actions</p>
        <p className="text-xs text-wangari-muted mt-1 max-w-[200px]">
          When the AI performs operations, they&apos;ll appear here in real-time
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-wangari-border">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-wangari-muted">
            Actions ({tasks.length})
          </p>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-wangari-green-500 animate-pulse" />
        </div>
        <button
          onClick={onClear}
          className="text-[11px] text-wangari-muted hover:text-wangari-heading transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              "rounded-lg border transition-all",
              task.status === "completed" && "border-wangari-green-200 bg-wangari-green-50/50",
              task.status === "failed" && "border-tone-bad-border bg-tone-bad-bg/50",
              task.status === "running" && "border-blue-200 bg-blue-50/50",
              task.status === "pending" && "border-wangari-border bg-white"
            )}
          >
            <button
              onClick={() => toggleExpand(task.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-left"
            >
              {/* Status icon */}
              <div className="shrink-0">
                {task.status === "completed" && <CheckCircle className="h-4 w-4 text-wangari-green-600" />}
                {task.status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                {task.status === "running" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                {task.status === "pending" && <Clock className="h-4 w-4 text-wangari-muted" />}
              </div>

              {/* Tool icon */}
              <div className="shrink-0 text-wangari-muted">
                {toolIcons[task.toolName] || <Database className="h-3.5 w-3.5" />}
              </div>

              {/* Tool name */}
              <span className="text-xs font-medium text-wangari-heading flex-1 truncate">
                {formatToolName(task.toolName)}
              </span>

              {/* Expand */}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-wangari-muted transition-transform",
                  expanded[task.id] ? "rotate-180" : ""
                )}
              />
            </button>

            {/* Expanded details */}
            {expanded[task.id] && (
              <div className="px-3 pb-2 space-y-1.5">
                {task.args && Object.keys(task.args).length > 0 && (
                  <p className="text-[11px] text-wangari-muted font-mono bg-white rounded px-2 py-1 border border-wangari-border">
                    {formatArgs(task.args)}
                  </p>
                )}
                {task.result && (
                  <div className="text-[11px] text-wangari-heading bg-white rounded px-2 py-1.5 border border-wangari-border whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {task.result}
                  </div>
                )}
                {task.error && (
                  <p className="text-[11px] text-red-600 bg-tone-bad-bg rounded px-2 py-1">
                    {task.error}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
