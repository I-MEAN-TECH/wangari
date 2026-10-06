"use client";

import * as React from "react";
import { LifeBuoy, X, Send, CheckCircle2 } from "lucide-react";
import api from "@/lib/api-client";
import { ALERT_DANGER_SM } from "@/components/ui/patterns";

/**
 * Customer help modal — opens a support ticket straight into the admin
 * console's Tickets module. Shows the user's recent tickets with status.
 */
export function HelpModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [priority, setPriority] = React.useState("normal");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<number | null>(null);
  const [error, setError] = React.useState("");
  const [mine, setMine] = React.useState<{ id: number; subject: string; status: string }[]>([]);

  const loadMine = React.useCallback(() => {
    api.get("/api/support/tickets").then((d: any) => setMine(Array.isArray(d) ? d.slice(0, 4) : [])).catch(() => {});
  }, []);
  React.useEffect(() => { if (open) loadMine(); }, [open, loadMine]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/api/support/tickets", { subject, body, priority });
      setDone(res.id);
      setSubject("");
      setBody("");
      setPriority("normal");
      loadMine();
    } catch (err: any) {
      setError(err?.message || "Could not send your message");
    } finally {
      setBusy(false);
    }
  }

  const STATUS_COLOR: Record<string, string> = {
    open: "text-amber-600",
    pending: "text-sky-600",
    solved: "text-emerald-600",
    closed: "text-gray-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-wangari-border px-5 py-4">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-wangari-green-700" />
            <h2 className="text-base font-bold text-wangari-heading">Help & Support</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-lg p-1.5 hover:bg-wangari-cream" aria-label="Close">
            <X className="h-4 w-4 text-wangari-muted" />
          </button>
        </div>

        <div className="p-5">
          {done !== null && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Message sent — ticket #{done}. Our team will get back to you soon.</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Subject</label>
              <input
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What do you need help with?"
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm focus:border-wangari-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Message</label>
              <textarea
                required
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe the issue — include what you were doing when it happened."
                className="w-full rounded-xl border border-wangari-border px-4 py-3 text-sm focus:border-wangari-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Urgency</label>
              <div className="flex gap-2">
                {["low", "normal", "high"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      priority === p
                        ? p === "high" ? "bg-badge-red-bg text-badge-red-text" : p === "normal" ? "bg-wangari-green-100 text-wangari-green-800" : "bg-gray-100 text-gray-600"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className={ALERT_DANGER_SM}>{error}</div>}
            <button
              type="submit"
              disabled={busy || !subject.trim() || !body.trim()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-wangari-green-600 text-sm font-semibold text-white hover:bg-wangari-green-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {busy ? "Sending…" : "Send to support"}
            </button>
          </form>

          {mine.length > 0 && (
            <div className="mt-5 border-t border-wangari-border pt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-wangari-muted">Your recent tickets</p>
              <div className="space-y-1.5">
                {mine.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-wangari-cream px-3 py-2 text-xs">
                    <span className="truncate font-medium text-wangari-heading">#{t.id} {t.subject}</span>
                    <span className={`shrink-0 font-bold capitalize ${STATUS_COLOR[t.status] || ""}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
