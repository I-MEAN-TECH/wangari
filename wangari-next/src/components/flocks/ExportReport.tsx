"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Download, FileText, Table, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BTN_CANCEL, BTN_TOOL } from "@/components/ui/patterns";

interface ExportReportProps {
  flock: any;
  onClose: () => void;
}

export function ExportReport({ flock, onClose }: ExportReportProps) {
  const [downloading, setDownloading] = React.useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.wangari.imeantech.com";

  const handleExport = async (format: "csv" | "json") => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("wangari_token");
      const res = await fetch(`${API_BASE}/api/flocks/${flock.id}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Export failed");

      if (format === "json") {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${flock.name.replace(/[^a-zA-Z0-9]/g, "_")}_report.json`);
      } else {
        const text = await res.text();
        const blob = new Blob([text], { type: "text/csv" });
        downloadBlob(blob, `${flock.name.replace(/[^a-zA-Z0-9]/g, "_")}_report.csv`);
      }
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setDownloading(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const species = flock.species;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Export Report</h2>
          <button onClick={onClose} className={BTN_TOOL}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          <p className="text-sm text-gray-500">
            Export <strong>{flock.name}</strong> data ({flock.breed || species?.name || flock.type})
          </p>

          <button
            onClick={() => handleExport("csv")}
            disabled={downloading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all cursor-pointer text-left"
          >
            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Table className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">CSV Spreadsheet</p>
              <p className="text-xs text-gray-400">Opens in Excel, Google Sheets, Numbers</p>
              <p className="text-[10px] text-gray-300 mt-1">Basic info + production data + vaccination schedule</p>
            </div>
          </button>

          <button
            onClick={() => handleExport("json")}
            disabled={downloading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all cursor-pointer text-left"
          >
            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">JSON Data</p>
              <p className="text-xs text-gray-400">Full raw data for developers or backup</p>
              <p className="text-[10px] text-gray-300 mt-1">Complete flock record with all fields</p>
            </div>
          </button>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className={BTN_CANCEL}>
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
