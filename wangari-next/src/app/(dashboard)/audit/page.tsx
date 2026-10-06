"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  History,
  User,
  Plus,
  Trash2,
  Edit3,
  Eye,
  LogIn,
  Settings,
  RefreshCw,
  Filter,
  Search,
} from "lucide-react";
import api from "@/lib/api-client";

interface AuditEntry {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: any;
  userName: string;
  createdAt: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

function getActionIcon(action: string) {
  switch (action.toLowerCase()) {
    case "create": return <Plus className="h-4 w-4 text-wangari-green-500" />;
    case "delete": return <Trash2 className="h-4 w-4 text-wangari-red-500" />;
    case "update": return <Edit3 className="h-4 w-4 text-wangari-amber-500" />;
    case "view": return <Eye className="h-4 w-4 text-wangari-blue-500" />;
    case "login": return <LogIn className="h-4 w-4 text-wangari-violet-500" />;
    default: return <Settings className="h-4 w-4 text-wangari-gray-500" />;
  }
}

function getActionColor(action: string) {
  switch (action.toLowerCase()) {
    case "create": return "bg-wangari-green-50 text-wangari-green-700 border-wangari-green-200";
    case "delete": return "bg-tone-bad-bg text-badge-red-text border-tone-bad-border";
    case "update": return "bg-tone-warn-bg text-tone-warn-text border-tone-warn-border";
    case "view": return "bg-wangari-blue-50 text-badge-blue-text border-wangari-blue-200";
    case "login": return "bg-wangari-violet-50 text-wangari-violet-700 border-wangari-violet-200";
    default: return "bg-wangari-gray-50 text-wangari-gray-700 border-wangari-border";
  }
}

export default function AuditPage() {
  const [logs, setLogs] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [filterAction, setFilterAction] = React.useState("all");

  React.useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.get<any[]>('/api/audit');
        setLogs(Array.isArray(data) ? data : []);
      } catch {
        // Use empty array
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filtered = logs.filter((log) => {
    const matchesSearch = !search ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (log.entityType || "").toLowerCase().includes(search.toLowerCase()) ||
      log.userName.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterAction === "all" || log.action.toLowerCase() === filterAction;
    return matchesSearch && matchesFilter;
  });

  const actionCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((log) => {
      counts[log.action.toLowerCase()] = (counts[log.action.toLowerCase()] || 0) + 1;
    });
    return counts;
  }, [logs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-8 w-8 text-wangari-green-800 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-wangari-heading">Activity Log</h1>
        <p className="text-sm text-wangari-muted mt-1">Track all changes and actions across your farm</p>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {["create", "update", "delete", "view", "login"].map((action) => (
          <button
            key={action}
            onClick={() => setFilterAction(filterAction === action ? "all" : action)}
            className={`rounded-xl p-4 border text-center transition-all ${filterAction === action ? getActionColor(action) : "bg-white border-wangari-border hover:bg-wangari-gray-50"}`}
          >
            <div className="flex justify-center mb-2">{getActionIcon(action)}</div>
            <p className="text-2xl font-bold">{actionCounts[action] || 0}</p>
            <p className="text-xs font-medium capitalize mt-1">{action}s</p>
          </button>
        ))}
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUp} className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-muted" />
          <input
            type="text"
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-wangari-border text-sm focus:outline-none focus:ring-2 focus:ring-wangari-green-800/20 focus:border-wangari-green-800"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-wangari-muted">
          <Filter className="h-4 w-4" />
          {filtered.length} of {logs.length} activities
        </div>
      </motion.div>

      {/* Activity Timeline */}
      <motion.div variants={fadeUp} className="rounded-2xl border border-wangari-border bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <History className="h-12 w-12 text-wangari-border mx-auto mb-3" />
            <p className="text-sm font-medium text-wangari-muted">No activities found</p>
            <p className="text-xs text-wangari-subtle mt-1">Actions will appear here as you use the system</p>
          </div>
        ) : (
          <div className="divide-y divide-wangari-border">
            {filtered.map((log, i) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-6 py-4 hover:bg-wangari-gray-50 transition-colors"
              >
                <div className="shrink-0">{getActionIcon(log.action)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                    {log.entityType && (
                      <span className="text-sm font-medium text-wangari-heading capitalize">{log.entityType}</span>
                    )}
                    {log.entityId && (
                      <span className="text-xs text-wangari-subtle">#{log.entityId}</span>
                    )}
                  </div>
                  {log.details && typeof log.details === "object" && (
                    <p className="text-xs text-wangari-muted mt-1 truncate">
                      {JSON.stringify(log.details).slice(0, 100)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="flex items-center gap-1.5 text-xs text-wangari-muted">
                    <User className="h-3 w-3" />
                    {log.userName}
                  </div>
                  <p className="text-[11px] text-wangari-subtle mt-0.5">
                    {new Date(log.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
