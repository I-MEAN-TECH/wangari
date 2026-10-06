"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Check, KeyRound, UserCog, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api-client";

export interface WorkerProfile {
  id: number;
  name: string;
  phone: string | null;
  role: string;
  farmName: string | null;
  farmCode: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  profile: WorkerProfile | null;
  onSaved: (p: WorkerProfile) => void;
}

export function WorkerProfileModal({ open, onClose, profile, onSaved }: Props) {
  const [tab, setTab] = React.useState<"profile" | "pin">("profile");

  // Profile form
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileMsg, setProfileMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  // PIN form
  const [currentPin, setCurrentPin] = React.useState("");
  const [newPin, setNewPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [savingPin, setSavingPin] = React.useState(false);
  const [pinMsg, setPinMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    if (open && profile) {
      setName(profile.name || "");
      setPhone(profile.phone || "");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setProfileMsg(null);
      setPinMsg(null);
      setTab("profile");
    }
  }, [open, profile]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await api.patch("/api/worker/me", { name, phone: phone || null });
      setProfileMsg({ ok: true, text: "Profile saved" });
      onSaved(res);
      setTimeout(() => setProfileMsg(null), 2500);
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err?.message || "Failed to save profile" });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      setPinMsg({ ok: false, text: "New PINs do not match" });
      return;
    }
    setSavingPin(true);
    setPinMsg(null);
    try {
      await api.post("/api/worker/change-pin", { currentPin, newPin });
      setPinMsg({ ok: true, text: "PIN changed — use it next login" });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setPinMsg({ ok: false, text: err?.message || "Failed to change PIN" });
    } finally {
      setSavingPin(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 flex items-center justify-between bg-wangari-green-800 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-white/20">
                <UserCog className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black">My Profile</h3>
                <p className="text-xs text-white/80 font-medium">
                  {profile?.farmName || "Farm"} • {profile?.farmCode || "—"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 p-1.5 bg-gray-100 gap-1 m-4 mb-0 rounded-2xl">
            <button
              onClick={() => setTab("profile")}
              className={`py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                tab === "profile" ? "bg-wangari-green-800 text-white shadow-md" : "text-wangari-muted"
              }`}
            >
              EDIT DETAILS
            </button>
            <button
              onClick={() => setTab("pin")}
              className={`py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                tab === "pin" ? "bg-wangari-green-800 text-white shadow-md" : "text-wangari-muted"
              }`}
            >
              CHANGE PIN
            </button>
          </div>

          <div className="p-5 space-y-4">
            {tab === "profile" && (
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-wangari-text">Full Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                    className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-wangari-text flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> Phone (for phone + PIN login)
                  </Label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712345678"
                    className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 font-semibold"
                  />
                </div>
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-wangari-muted">
                  Role: <span className="font-bold text-wangari-heading">{profile?.role || "Farm Worker"}</span>
                  {" "}• Managed by your farm owner
                </div>

                {profileMsg && (
                  <p className={`text-xs font-bold ${profileMsg.ok ? "text-emerald-700" : "text-rose-700"}`}>
                    {profileMsg.text}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full h-12 rounded-2xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-black cursor-pointer"
                >
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  {savingProfile ? "SAVING..." : "SAVE PROFILE"}
                </Button>
              </form>
            )}

            {tab === "pin" && (
              <form onSubmit={changePin} className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 flex items-start gap-2">
                  <KeyRound className="h-4 w-4 shrink-0 mt-0.5" />
                  Changing your PIN signs you out of nothing — it takes effect at your next login.
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-wangari-text">Current PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                    required
                    className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 font-black tracking-widest text-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-wangari-text">New 4-Digit PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    required
                    className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 font-black tracking-widest text-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-wangari-text">Confirm New PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    required
                    className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 font-black tracking-widest text-lg"
                  />
                </div>

                {pinMsg && (
                  <p className={`text-xs font-bold ${pinMsg.ok ? "text-emerald-700" : "text-rose-700"}`}>
                    {pinMsg.text}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={savingPin || newPin.length !== 4}
                  className="w-full h-12 rounded-2xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-black cursor-pointer disabled:opacity-50"
                >
                  {savingPin ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                  {savingPin ? "CHANGING..." : "CHANGE PIN"}
                </Button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
