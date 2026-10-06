"use client";

import * as React from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, RotateCcw, Users, MapPin, Ban,
} from "lucide-react";
import {
  stateMeta, isSidelined, sidelinedLabel, uptimePct, overallTone,
  fallbackSentence, timeAgo, wouldUseNow, whoLabel,
  type ModelHealthLike, type UseRecordLike, type FallbackLike,
} from "@/lib/ai-health-view";
import { Panel, StatCard, EmptyState, GhostButton, Loading, ErrorState } from "@/components/admin/ui";

/**
 * What the models are DOING, as opposed to what the operator CHOSE.
 *
 * ── the problem this screen answers ───────────────────────────────────────
 * Farmers reported "the AI is not working" for an afternoon while a verified
 * backup sat unused, because selection only happened after a failure. The
 * registry above shows the configuration that produced that outage and could
 * not show the outage. This screen shows the outage.
 *
 * ── three things it will not do ───────────────────────────────────────────
 *   - Show a request log. An operator asking for AI forensics wants to know
 *     "is it up, for whom, from where", and the tenant-isolation guarantee is
 *     that farm data does not travel between farms. A panel holding prompts
 *     would be the one place that promise broke.
 *   - Claim to be complete. It is one PM2 worker's view, and it says so by
 *     showing its pid. Two workers can disagree for a few seconds after a
 *     failure; that is in-memory by design, not a bug to hide.
 *   - Call an untried model healthy. "Not tried yet" is a different claim from
 *     "Answering", and only one of them is true.
 */

export interface AiHealthData {
  pid: number;
  now: number;
  candidates: string[];
  models: ModelHealthLike[];
  fallbacks: FallbackLike[];
  usage: {
    total: number;
    uniqueUsers: number;
    uniqueIps: number;
    anonymous: number;
    byModel: Record<string, number>;
    recent: UseRecordLike[];
  };
}

const th = "px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-wangari-muted";
const td = "border-t border-wangari-border px-4 py-2.5 text-sm text-wangari-text align-top";

export function AiHealthPanel({
  data,
  loading,
  error,
  onReload,
  onClear,
  busyModel,
}: {
  data: AiHealthData | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onClear: (model: string) => void;
  busyModel: string | null;
}) {
  if (loading && !data) return <Panel title="Live AI health"><Loading label="Reading what the models are doing…" /></Panel>;
  if (error && !data) return <Panel title="Live AI health"><ErrorState message={error} /></Panel>;
  if (!data) return null;

  const now = data.now;
  const tone = overallTone(data.models, data.candidates);
  const liveModel = wouldUseNow(data.models, data.candidates);

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} />}

      {/* The headline. Everything else on this screen is evidence for it. */}
      <Panel
        title="Live AI health"
        description="Which models are actually answering right now, and who is being moved between them"
        actions={
          <GhostButton onClick={onReload} className="h-8 px-2.5 text-xs">
            <Activity className="h-3.5 w-3.5" /> Refresh
          </GhostButton>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${tone.cls}`}>
            {tone.label === "Wangari AI is answering"
              ? <CheckCircle2 className="h-3.5 w-3.5" />
              : tone.label === "Every model is paused"
                ? <Ban className="h-3.5 w-3.5" />
                : <Clock className="h-3.5 w-3.5" />}
            {tone.label}
          </span>
          {liveModel && (
            <span className="text-xs text-wangari-muted">
              Answering with <code className="rounded bg-wangari-cream px-1.5 py-0.5 font-semibold text-wangari-heading">{liveModel}</code>
            </span>
          )}
          {/* Stated rather than hidden: PM2 runs two workers and this store is
              per-process, so two loads of this page can briefly disagree. An
              operator who knew that would not file a bug about it. */}
          <span className="ml-auto text-[11px] text-wangari-subtle">
            worker #{data.pid} · {new Date(now).toLocaleTimeString()}
          </span>
        </div>

        {/* Counts come from the server, which computes them over every record
            it holds. The table below shows only the most recent rows, so
            counting them here would under-report the moment traffic got
            interesting — which is exactly when this panel is being read. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Farmers using AI" value={data.usage.uniqueUsers} icon={<Users className="h-5 w-5" />} accent="blue"
            hint={`${data.usage.total} recorded request${data.usage.total === 1 ? "" : "s"}`} />
          <StatCard label="Distinct addresses" value={data.usage.uniqueIps} icon={<MapPin className="h-5 w-5" />} accent="violet"
            hint={data.usage.anonymous ? `${data.usage.anonymous} could not be tied to a farmer` : "Every request tied to a farmer"} />
          <StatCard label="Models on standby" value={data.candidates.length} icon={<Activity className="h-5 w-5" />} accent="slate"
            hint={data.candidates.map((c) => c.split(":")[0]).join(" → ")} />
          <StatCard label="Fallbacks taken" value={data.fallbacks.length} icon={<RotateCcw className="h-5 w-5" />}
            accent={data.fallbacks.length > 0 ? "amber" : "slate"}
            hint={data.fallbacks.length ? "A different model answered instead" : "Selection has not had to move"} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ── The fallback table ──────────────────────────────────────────
            The screen's reason for existing. "Why is it using that model" had
            no answer before selection was automatic, and the only visible
            symptom was farmers saying the assistant was broken. */}
        <Panel title="Fallbacks, with reasons" description="Every time a different model answered than the one configured">
          {data.fallbacks.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="No fallbacks taken"
              hint="The configured model has been answering. If the upstream saturates, the switch will appear here with its reason."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 520 }}>
                <thead className="bg-wangari-green-50/50">
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Moved</th>
                    <th className={th}>Who</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fallbacks.slice(0, 25).map((f, i) => (
                    <tr key={`${f.at}-${i}`}>
                      <td className={`${td} whitespace-nowrap text-xs text-wangari-muted`}>{timeAgo(f.at, now)}</td>
                      <td className={td}>
                        <div className="font-semibold text-wangari-heading">{fallbackSentence(f)}</div>
                        <div className="mt-0.5 text-xs text-wangari-muted">
                          {whoLabel(f.userId)}{f.ip ? ` · ${f.ip}` : ""}
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs font-mono text-wangari-muted`}>{f.ip || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ── Per-model verdicts ───────────────────────────────────────── */}
        <Panel title="What each model is doing" description="Live state, uptime, and the reason behind any pause">
          {data.models.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-5 w-5" />}
              title="No traffic recorded yet"
              hint="This panel fills in as farmers ask Wangari questions. Nothing is being withheld — there has simply been no call to record."
            />
          ) : (
            <ul className="space-y-2.5">
              {data.models.map((m) => {
                const meta = stateMeta(m.state);
                const paused = isSidelined(m);
                const chosen = liveModel === m.model;
                return (
                  <li key={m.model} className="rounded-xl border border-wangari-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-sm font-semibold text-wangari-heading">{m.model}</code>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                          {chosen && (
                            <span className="rounded-full bg-badge-green-bg px-2 py-0.5 text-[11px] font-bold text-badge-green-text">
                              in use
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-wangari-muted">
                          {/* A normalised sentence, never the raw provider body —
                              whatever the upstream echoed is not safe to render
                              in a dashboard. */}
                          {m.lastReason
                            ? m.lastReason
                            : paused
                              ? sidelinedLabel(m.sidelinedForMs)
                              : m.lastHealthyAt
                                ? `Last answered ${timeAgo(m.lastHealthyAt, now)}`
                                : "No failures recorded"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-bold text-wangari-heading">{uptimePct(m)}</div>
                          <div className="text-[11px] text-wangari-subtle">uptime · {m.calls} calls</div>
                        </div>
                        {/* The only way out of "Retired". Deliberately a human
                            decision: a retirement that expired on its own
                            would quietly put the model back in front of
                            farmers. */}
                        {m.state === "gone" && (
                          <GhostButton
                            className="h-8 px-2.5 text-xs"
                            disabled={busyModel === m.model}
                            onClick={() => onClear(m.model)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Try again
                          </GhostButton>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Who is using it ─────────────────────────────────────────────
          Deliberately a list of numbers, not of content: see the docblock on
          why no request text is logged anywhere. */}
      <Panel title="Who is using Wangari AI" description="Distinct farmers and addresses, most recent first">
        {data.usage.recent.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No AI usage recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 460 }}>
              <thead className="bg-wangari-green-50/50">
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Model</th>
                  <th className={th}>Farmer</th>
                  <th className={th}>Address</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.recent.slice(0, 25).map((u, i) => (
                  <tr key={`${u.at}-${i}`}>
                    <td className={`${td} whitespace-nowrap text-xs text-wangari-muted`}>{timeAgo(u.at, now)}</td>
                    <td className={`${td} text-xs`}>
                      <code className="font-semibold text-wangari-heading">{u.model}</code>
                      {u.fellBackFrom && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-tone-warn-text">
                          <AlertTriangle className="h-3 w-3" /> took over from {u.fellBackFrom}
                        </div>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs`}>{whoLabel(u.userId)}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-xs text-wangari-muted`}>{u.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-wangari-subtle">
          Addresses and farmer ids only. Questions and answers are never recorded here — the assistant
          guarantees one farm&apos;s records cannot reach another, and a diagnostics screen holding
          prompt text would be the one place that guarantee ended.
        </p>
      </Panel>
    </div>
  );
}