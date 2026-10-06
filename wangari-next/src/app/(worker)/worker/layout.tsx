"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, LogOut, HardHat, UserCog, ChevronDown } from "lucide-react";
import { isWorkerSession, getUser, logout } from "@/lib/auth-client";
import { Avatar } from "@/components/ui/avatar";
import { WorkerProfileModal, WorkerProfile } from "@/components/worker/WorkerProfileModal";
import { WorkerLockout } from "@/components/worker/worker-lockout";
import api from "@/lib/api-client";

/**
 * Isolated worker shell — no owner sidebar, no owner navigation.
 * Workers who are not authenticated get bounced to /login.
 * Owner tokens hitting /worker get bounced to /dashboard.
 * Desktop header mirrors the owner Topbar (glass blur, avatar, role line).
 */
export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<WorkerProfile | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isWorkerSession() && !getUser()) {
      // Not authenticated at all: go to login.
      router.replace("/login");
      return;
    }
    // Owner tokens are allowed to stay: "Worker View" in the owner sidebar
    // links here as a preview of the worker portal (previously owners were
    // bounced straight back to /dashboard, so the link appeared dead).
    setChecked(true);
  }, [router]);

  const worker = getUser();

  const openProfile = async () => {
    setMenuOpen(false);
    setProfileOpen(true);
    try {
      const me = await api.get<WorkerProfile>("/api/worker/me");
      setProfile(me);
    } catch {
      // Fall back to stored identity so the modal still opens
      setProfile({
        id: worker?.id ?? 0,
        name: worker?.name || "Worker",
        phone: worker?.email || null,
        role: "Farm Worker",
        farmName: null,
        farmCode: null,
      });
    }
  };

  if (!checked) {
    return (
      <div className="min-h-screen bg-wangari-cream flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-wangari-green-800 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-wangari-cream">
      {/* Farm locked (owner's trial/subscription expired): full-screen notice
          overlaying the portal. Any 403 trialExpired API response flips it on. */}
      <WorkerLockout />
      {/* Minimal worker topbar — no farm switcher, no owner nav, no finance links.
          Visual language matches the owner Topbar (glass blur, avatar, role line). */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-wangari-border px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-wangari-green-800 flex items-center justify-center shrink-0">
            <HardHat className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-wangari-subtle hidden sm:block">
              Wangari
            </p>
            <h1 className="text-base sm:text-lg font-bold text-wangari-heading truncate">Worker Portal</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-wangari-heading max-w-[160px] truncate">
              {worker?.name || "Worker"}
            </p>
            <p className="text-[11px] text-wangari-muted capitalize">Worker</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Open profile menu"
              className="flex items-center gap-1 pl-2 sm:pl-3 border-l border-wangari-border py-1.5 cursor-pointer rounded-xl hover:bg-wangari-green-50 transition-colors"
            >
              <Avatar name={worker?.name || "Worker"} size="sm" />
              <ChevronDown className="h-4 w-4 text-wangari-muted" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-wangari-border overflow-hidden z-50 animate-fade-in">
                  <div className="px-4 py-3 border-b border-wangari-border">
                    <p className="text-sm font-bold text-wangari-heading truncate">{worker?.name || "Worker"}</p>
                    <p className="text-[11px] text-wangari-muted capitalize">Worker</p>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={openProfile}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-wangari-green-50 transition-colors cursor-pointer"
                    >
                      <UserCog className="h-4 w-4 text-wangari-muted" />
                      <span className="text-sm font-medium text-wangari-heading">My Profile</span>
                    </button>
                  </div>
                  <div className="border-t border-wangari-border p-1.5">
                    <button
                      onClick={() => logout()}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-tone-bad-bg transition-colors cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-red-600">Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:py-8">{children}</main>

      <WorkerProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={profile}
        onSaved={(p) => setProfile(p)}
      />
    </div>
  );
}
