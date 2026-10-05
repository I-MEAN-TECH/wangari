"use client";

import * as React from "react";
import {
  ShieldOff, Plus, Trash2, Search, ShieldCheck, Ban, Info, RefreshCw,
} from "lucide-react";
import {
  patternKind, isValidPattern, describeRange, selfBlockWarning, previewTone, hitTone,
  PATTERN_PLACEHOLDER, type PreviewResult,
} from "@/lib/ip-access-view";
import { Panel, StatCard, EmptyState, GhostButton, Loading, ErrorState, inputClass } from "@/components/admin/ui";

/**
 * Who is reaching this server, and what may they have.
 *
 * ── why this is on System Health and not on a security page ───────────────
 * Because the question is operational. During an incident the person who
 * answers it is the one watching CPU graphs, not the one reading a policy
 * document, and burying the button somewhere else means nobody presses it.
 *
 * ── three things it refuses to do ─────────────────────────────────────────
 *   - Save a block that covers the operator's own address. That failure is
 *     unrecoverable from inside the app: the panel you would use to undo it is
 *     the panel you just locked out of. The server refuses it too; the warning
 *     here exists so it is seen BEFORE the save, not discovered from a 400
 *     after it.
 *   - Hide how much a rule covers. "203.0.113.0/8" looks like one entry and
 *     is 16,777,216 addresses.
 *   - Present a block that an allow rule defeats as working. The preview says
 *     so plainly, because that precedence is surprising every single time.
 */

export interface IpRuleRow {
  id: number;
  pattern: string;
  action: string;
  note: string | null;
  addedBy: string | null;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
}

export interface IpData {
  rules: IpRuleRow[];
  summary: {
    total: number;
    blocks: number;
    allows: number;
    totalBlockedRequests: number;
    neverHit: number;
  };
  youAre: string | null;
  checkedAt: string;
}

const th = "px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-wangari-muted";
const td = "border-t border-wangari-border px-4 py-3 text-sm text-wangari-text align-middle";

export function IpAccessPanel({
  data,
  loading,
  error,
  youAre,
  busy,
  onReload,
  onAdd,
  onToggle,
  onDelete,
  onPreview,
}: {
  data: IpData | null;
  loading: boolean;
  error: string | null;
  youAre: string | null;
  busy: string | null;
  onReload: () => void;
  onAdd: (input: { pattern: string; action: "block" | "allow"; note: string }) => Promise<void>;
  onToggle: (rule: IpRuleRow) => Promise<void>;
  onDelete: (rule: IpRuleRow) => Promise<void>;
  onPreview: (pattern: string, ip: string) => Promise<PreviewResult | null>;
}) {
  const [pattern, setPattern] = React.useState("");
  const [action, setAction] = React.useState<"block" | "allow">("block");
  const [note, setNote] = React.useState("");
  const [testIp, setTestIp] = React.useState("");
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [previewErr, setPreviewErr] = React.useState<string | null>(null);

  const warning = selfBlockWarning(pattern, youAre, action);
  const valid = isValidPattern(pattern);
  const now = data ? Date.parse(data.checkedAt) : Date.now();

  if (loading && !data) return <Panel title="IP access"><Loading label="Reading the IP rules…" /></Panel>;
  if (error && !data) return <Panel title="IP access"><ErrorState message={error} /></Panel>;
  if (!data) return null;

  const { summary } = data;

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Blocked addresses" value={summary.blocks} icon={<Ban className="h-5 w-5" />}
          accent={summary.blocks ? "red" : "slate"} hint={summary.blocks ? "ranges refused at the door" : "Nothing is blocked"} />
        <StatCard label="Requests refused" value={summary.totalBlockedRequests} icon={<ShieldOff className="h-5 w-5" />}
          accent={summary.totalBlockedRequests ? "amber" : "slate"} hint="since these rules were written" />
        <StatCard label="Allow rules" value={summary.allows} icon={<ShieldCheck className="h-5 w-5" />} accent="green"
          hint="Always win over a block" />
        <StatCard label="Never matched" value={summary.neverHit} icon={<Info className="h-5 w-5" />} accent="slate"
          hint="blocks that have not caught anything" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ── Add ─────────────────────────────────────────────────────── */}
        <Panel title="Block or allow an address" description="Ranges are allowed: a scan rotates inside one">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Address, range or wildcard</label>
              <input
                value={pattern}
                onChange={(e) => { setPattern(e.target.value); setPreview(null); }}
                placeholder={PATTERN_PLACEHOLDER}
                className={inputClass}
              />
              {/* The size, shown before the save and not after. A /8 looks like
                  one entry and is sixteen million addresses. */}
              <p className="mt-1 text-[11px] text-wangari-subtle">
                {pattern ? describeRange(pattern) : "One address, a CIDR block, or a wildcard on any octet."}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Action</label>
              <div className="flex gap-2">
                {(["block", "allow"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      action === a
                        ? a === "block"
                          ? "border-badge-red-border bg-badge-red-bg text-badge-red-text"
                          : "border-badge-green-border bg-badge-green-bg text-badge-green-text"
                        : "border-wangari-border bg-white text-wangari-muted hover:bg-wangari-cream"
                    }`}
                  >
                    {a === "block" ? "Refuse" : "Always allow"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-wangari-subtle">
                An allow rule wins over any block, so nobody can be locked out by a range added later.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Why (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Port scan from this range"
                maxLength={280}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-wangari-subtle">
                What makes this list reviewable in six months, when nobody remembers adding it.
              </p>
            </div>

            {/* Said here rather than left to a 400 from the server, because the
                consequence — no panel to undo it from — is not obvious. */}
            {warning && (
              <div className="flex items-start gap-2 rounded-xl border border-badge-red-border bg-badge-red-bg px-3 py-2.5 text-xs font-medium text-badge-red-text">
                <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" />
                {warning}
              </div>
            )}

            <GhostButton
              className="w-full justify-center"
              disabled={!valid || !!warning || busy === "add"}
              onClick={async () => {
                await onAdd({ pattern: pattern.trim(), action, note: note.trim() });
                setPattern(""); setNote("");
              }}
            >
              <Plus className="h-4 w-4" /> {busy === "add" ? "Saving…" : "Add rule"}
            </GhostButton>

            <p className="text-[11px] leading-relaxed text-wangari-subtle">
              You are reaching this panel from <code className="font-mono font-semibold text-wangari-muted">{youAre || "an unknown address"}</code>.
              Anything that matches it is refused.
            </p>
          </div>
        </Panel>

        {/* ── Dry run ─────────────────────────────────────────────────── */}
        <Panel title="Test a rule" description="See what would happen before you save it">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-wangari-muted">Pattern</label>
                <input
                  value={pattern}
                  onChange={(e) => { setPattern(e.target.value); setPreview(null); }}
                  placeholder="203.0.113.0/24"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-wangari-muted">Address</label>
                <input
                  value={testIp}
                  onChange={(e) => { setTestIp(e.target.value); setPreview(null); }}
                  placeholder="203.0.113.7"
                  className={inputClass}
                />
              </div>
            </div>

            <GhostButton
              className="w-full justify-center"
              disabled={!isValidPattern(pattern) || !testIp || busy === "preview"}
              onClick={async () => {
                setPreviewErr(null);
                try {
                  setPreview(await onPreview(pattern.trim(), testIp.trim()));
                } catch (e: any) {
                  setPreviewErr(e?.message || "Test failed");
                }
              }}
            >
              <Search className="h-4 w-4" /> {busy === "preview" ? "Testing…" : "Test this address"}
            </GhostButton>

            {previewErr && <ErrorState message={previewErr} />}

            {preview && (
              <div className={`rounded-xl px-3 py-2.5 text-xs font-medium ${previewTone(preview).cls}`}>
                {previewTone(preview).text}
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-wangari-subtle">
              This checks the current rules too, so it will tell you when a block you are about to save
              would be overruled by an allow that already exists.
            </p>
          </div>
        </Panel>

        {/* ── The list ────────────────────────────────────────────────── */}
        <Panel
          title="Current rules"
          description={`${summary.total} rule${summary.total === 1 ? "" : "s"}`}
          actions={
            <GhostButton onClick={onReload} className="h-8 px-2.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </GhostButton>
          }
        >
          {data.rules.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title="No rules yet"
              hint="Everything is allowed through. Add a range when you see one that should not be."
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full" style={{ minWidth: 440 }}>
                <thead className="sticky top-0 bg-wangari-green-50/50">
                  <tr>
                    <th className={th}>Rule</th>
                    <th className={th}>Seen</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((r) => {
                    const blocking = r.action === "block";
                    return (
                      <tr key={r.id}>
                        <td className={td}>
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="font-mono text-xs font-bold text-wangari-heading">{r.pattern}</code>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              blocking ? "bg-badge-red-bg text-badge-red-text" : "bg-badge-green-bg text-badge-green-text"
                            }`}>
                              {blocking ? "refuse" : "allow"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-wangari-subtle">{describeRange(r.pattern)}</div>
                          {r.note && <div className="mt-0.5 text-xs text-wangari-muted">{r.note}</div>}
                        </td>
                        <td className={`${td} whitespace-nowrap text-xs text-wangari-muted`}>
                          {hitTone(r.hitCount, r.lastHitAt, now)}
                        </td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => onToggle(r)}
                              disabled={busy === `toggle-${r.id}`}
                              title={blocking ? "Switch to allow" : "Switch to block"}
                              className="rounded-lg p-1.5 text-wangari-muted hover:bg-wangari-cream hover:text-wangari-heading disabled:opacity-50"
                            >
                              {blocking ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => onDelete(r)}
                              disabled={busy === `delete-${r.id}`}
                              title="Delete this rule"
                              className="rounded-lg p-1.5 text-wangari-muted hover:bg-badge-red-bg hover:text-badge-red-text disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}