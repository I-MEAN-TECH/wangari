"use client";

import * as React from "react";
import { Fingerprint, Plus, Trash2, CheckCircle2, Clock, Wifi, WifiOff, AlertTriangle, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

export function BiometricSettings() {
  const [devices, setDevices] = React.useState<any[]>([]);
  const [workers, setWorkers] = React.useState<any[]>([]);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [unmapped, setUnmapped] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [form, setForm] = React.useState({ serialNumber: "", name: "", model: "" });
  const { showToast, ToastComponent } = useToast();

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";

  const load = () => {
    Promise.all([
      api.get("/api/zkteco/devices"),
      api.get("/api/workers"),
      api.get("/api/zkteco/logs"),
      api.get("/api/zkteco/unmapped"),
    ]).then(([d, w, l, u]) => {
      setDevices(Array.isArray(d) ? d : []);
      setWorkers(Array.isArray(w) ? w : []);
      setLogs(Array.isArray(l) ? l : []);
      setUnmapped(Array.isArray(u) ? u : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  const handleAddDevice = async () => {
    if (!form.serialNumber) return;
    try {
      await api.post("/api/zkteco/devices", form);
      showToast("Device registered!");
      setForm({ serialNumber: "", name: "", model: "" });
      setShowAddForm(false);
      load();
    } catch (e: any) {
      showToast(e?.message || "Failed to register device");
    }
  };

  const handleDeleteDevice = async (id: number) => {
    if (!confirm("Remove this device?")) return;
    await api.delete(`/api/zkteco/devices/${id}`);
    showToast("Device removed");
    load();
  };

  const handleMapWorker = async (logId: number, workerId: number) => {
    await api.patch(`/api/zkteco/logs/${logId}/map`, { workerId });
    showToast("Worker mapped!");
    load();
  };

  const pushUrl = `${serverUrl}/api/zkteco/push`;

  if (loading) return <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-4">
      {/* How it works */}
      <Card className="border border-wangari-border">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Fingerprint className="h-4 w-4 text-wangari-green-800" /> ZKTeco Biometric Setup</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-wangari-green-50 border border-wangari-green-200 p-4">
            <p className="text-sm font-bold text-wangari-heading mb-2">How it works</p>
            <div className="space-y-2 text-xs text-wangari-muted">
              <p>1. Register your ZKTeco device serial number below</p>
              <p>2. Configure the device to push data to your Wangari URL</p>
              <p>3. Map device user IDs to your workers</p>
              <p>4. Attendance auto-records when workers scan their fingerprint</p>
            </div>
          </div>

          {/* Push URL */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-wangari-muted">Your Push URL (enter this in the device)</Label>
            <div className="flex gap-2">
              <Input value={pushUrl} readOnly className="h-10 rounded-xl text-xs font-mono bg-tone-neutral-bg" />
              <button onClick={() => { navigator.clipboard.writeText(pushUrl); showToast("Copied!"); }}
                className="px-3 py-2 rounded-xl bg-wangari-green-800 text-white text-xs font-bold cursor-pointer">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registered devices */}
      <Card className="border border-wangari-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold">Registered Devices ({devices.length})</CardTitle>
            <Button onClick={() => setShowAddForm(!showAddForm)} size="sm" className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">
              <Plus className="h-3.5 w-3.5 mr-1" />Add Device
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddForm && (
            <div className="p-4 rounded-xl border border-wangari-border bg-tone-neutral-bg space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-wangari-muted">Serial Number *</Label>
                <Input placeholder="e.g. K40F20230123456" value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} className="h-10 rounded-xl text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-wangari-muted">Device Name</Label>
                  <Input placeholder="e.g. Main Gate" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-10 rounded-xl text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-wangari-muted">Model</Label>
                  <Input placeholder="e.g. K40, K50, uFace800" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="h-10 rounded-xl text-sm" />
                </div>
              </div>
              <Button onClick={handleAddDevice} disabled={!form.serialNumber} className="w-full bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer">Register Device</Button>
            </div>
          )}

          {devices.length === 0 && !showAddForm && (
            <div className="text-center py-6">
              <Fingerprint className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No devices registered yet</p>
              <p className="text-xs text-gray-300 mt-1">Add your ZKTeco device to enable biometric attendance</p>
            </div>
          )}

          {devices.map((device: any) => (
            <div key={device.id} className="flex items-center justify-between p-3 rounded-xl border border-wangari-border">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${device.lastSyncAt ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                  {device.lastSyncAt ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-wangari-heading">{device.name || device.serialNumber}</p>
                  <p className="text-[10px] text-wangari-subtle">{device.model || "ZKTeco"} • {device.serialNumber}</p>
                  {device.lastSyncAt && (
                    <p className="text-[10px] text-emerald-600">Last sync: {new Date(device.lastSyncAt).toLocaleString()}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={device.lastSyncAt ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500"}>
                  {device.lastSyncAt ? "Connected" : "Waiting"}
                </Badge>
                <span className="text-[10px] text-wangari-subtle">{device._count?.logs || 0} logs</span>
                <button onClick={() => handleDeleteDevice(device.id)} className="text-wangari-subtle hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Unmapped users */}
      {unmapped.length > 0 && (
        <Card className="border border-tone-warn-border bg-tone-warn-bg">
          <CardHeader><CardTitle className="text-sm font-bold text-amber-800">⚠️ Unmapped Device Users ({unmapped.length})</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-tone-warn-text mb-3">These device user IDs need to be mapped to workers in your system</p>
            <div className="space-y-2">
              {unmapped.map((log: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-100">
                  <div>
                    <p className="text-xs font-bold text-wangari-heading">Device ID: {log.deviceUserId}</p>
                    <p className="text-[10px] text-wangari-subtle">Device: {log.device?.name || "Unknown"}</p>
                  </div>
                  <select onChange={e => handleMapWorker(log.id, Number(e.target.value))} className="h-8 rounded-lg border border-tone-warn-border px-2 text-xs">
                    <option value="">Select worker...</option>
                    {workers.filter(w => w.status === "active").map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent biometric logs */}
      {logs.length > 0 && (
        <Card className="border border-wangari-border">
          <CardHeader><CardTitle className="text-sm font-bold">Recent Biometric Entries</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {logs.slice(0, 20).map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-2 rounded-lg bg-tone-neutral-bg text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <div>
                      <p className="font-bold text-wangari-heading">{log.worker?.name || `Device ID: ${log.deviceUserId}`}</p>
                      <p className="text-[10px] text-wangari-subtle">{log.verifyType || "fingerprint"} • {log.device?.name || "Unknown device"}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-wangari-subtle">{new Date(log.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup instructions */}
      <Card className="border border-wangari-border">
        <CardHeader><CardTitle className="text-sm font-bold">Setup Instructions</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-xs text-wangari-muted">
          <div className="space-y-2">
            <p className="font-bold text-wangari-heading">Step 1: Register the device above</p>
            <p>Enter the serial number found on the back of your ZKTeco device or in Menu → Device Info</p>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-wangari-heading">Step 2: Configure the device</p>
            <p>On the ZKTeco device: Menu → Communication → Cloud Server → Enable</p>
            <p>Server URL: <span className="font-mono bg-wangari-green-50 px-1 rounded">{pushUrl}</span></p>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-wangari-heading">Step 3: Enroll workers</p>
            <p>On the device: Menu → User Mgmt → Add User → Set ID, Name, Fingerprint</p>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-wangari-heading">Step 4: Map device IDs to workers</p>
            <p>When the first scan comes in, map the device user ID to the corresponding worker above</p>
          </div>
        </CardContent>
      </Card>

      {ToastComponent}
    </div>
  );
}
