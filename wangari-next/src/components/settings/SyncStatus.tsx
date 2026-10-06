"use client";

import * as React from "react";
import { CloudUpload, RefreshCw, Clock, FileText, CheckCircle2, CloudOff, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { peekQueue, flushQueue, queueSize, type QueuedWrite } from "@/lib/offline-queue";
import { API_BASE } from "@/lib/api-client";
import { getToken } from "@/lib/auth-client";
import { useToast } from "@/components/shared/toast";

/**
 * Sync status screen — full visibility into the offline write queue.
 * Shows every pending record with its age, a manual "Sync now" button,
 * and live status while syncing.
 */
export function SyncStatus() {
  const [items, setItems] = React.useState<QueuedWrite[]>([]);
  const [online, setOnline] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const { showToast } = useToast();

  const refresh = React.useCallback(() => setItems(peekQueue()), []);

  React.useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    const goOnline = () => { setOnline(true); refresh(); };
    const goOffline = () => setOnline(false);
    const onChanged = () => refresh();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("wangari:queue_changed", onChanged as EventListener);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("wangari:queue_changed", onChanged as EventListener);
    };
  }, [refresh]);

  async function syncNow() {
    setSyncing(true);
    try {
      const { sent, failed } = await flushQueue(async (path, method, body, clientId) => {
        const res = await fetch(`${API_BASE}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          body: JSON.stringify({ ...(body as object), clientId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const err = new Error(data.error || `Sync failed: ${res.status}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
      });
      refresh();
      if (sent > 0) {
        showToast(`${sent} record${sent === 1 ? "" : "s"} synced successfully`);
        window.dispatchEvent(new CustomEvent("wangari:data_synced"));
      }
      if (failed > 0) showToast(`${failed} record${failed === 1 ? "" : "s"} couldn't be synced (invalid data) and was removed`, "error");
      if (sent === 0 && failed === 0) showToast("Everything is already synced");
    } finally {
      setSyncing(false);
    }
  }

  function ageLabel(queuedAt: number): string {
    const mins = Math.floor((Date.now() - queuedAt) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
    return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? "" : "s"} ago`;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <CloudUpload className="h-4 w-4 text-wangari-green-800" /> Offline Sync
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${online ? "bg-wangari-green-50" : "bg-tone-warn-bg"}`}>
                {online ? <CheckCircle2 className="h-5 w-5 text-wangari-green-600" /> : <CloudOff className="h-5 w-5 text-amber-600" />}
              </div>
              <div>
                <p className="text-sm font-bold text-wangari-heading">
                  {online ? "Connected" : "Offline"}
                </p>
                <p className="text-xs text-wangari-muted">
                  {items.length === 0
                    ? "All records are synced to the cloud"
                    : `${items.length} record${items.length === 1 ? "" : "s"} saved on this device, waiting to sync`}
                </p>
              </div>
            </div>
            <Button
              onClick={syncNow}
              disabled={syncing || items.length === 0 || !online}
              className="gap-2 bg-wangari-green-800 hover:bg-wangari-green-900"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <FileText className="h-4 w-4 text-wangari-green-800" /> Pending records
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-wangari-green-600" />
              <p className="text-sm font-semibold text-wangari-heading">Nothing pending</p>
              <p className="max-w-xs text-xs text-wangari-muted">
                Records you create while offline appear here and sync automatically when you&apos;re back online.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-tone-neutral-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-wangari-heading">{item.label}</p>
                    <p className="flex items-center gap-1 text-xs text-wangari-muted">
                      <Clock className="h-3 w-3" /> {ageLabel(item.queuedAt)}
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-amber-100 text-amber-800 hover:bg-amber-100">Waiting</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
