"use client";

import * as React from "react";
import { MessageSquare, Star, TrendingUp, Users, Radio, BarChart3, RefreshCw } from "lucide-react";
import { feedbackApi, FeedbackSummary, FeedbackSegmentSummary } from "@/lib/admin-client";
import { PageHeader, Panel, StatCard, TableShell, Th, Td, Loading, ErrorState, EmptyState, GhostButton } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";

/**
 * Feedback — what people actually told us (/waadmin/feedback).
 *
 * Three rules this screen keeps, from module-plan.md and docs/mirofish-panel.md:
 *
 * 1. **Response count first, average second.** The MiroFish panel's only
 *    trustworthy output was an ordering plus one defect — not a score. A
 *    screen that led with "average 2.57" would quietly turn a rehearsal into
 *    a product grade, which is exactly the number this project refuses to
 *    inflate.
 *
 * 2. **Raw counts travel with every average.** Every segment shows how many
 *    people it was computed from; a 4.5 built from two answers must look
 *    different from a 4.5 built from twenty.
 *
 * 3. **The offline/needs-internet contradiction gets its own panel.** The
 *    simulation's sharpest finding: personas called "works offline" a delight
 *    (3/7) while naming "needs internet" their biggest complaint (6/7). Under
 *    R8 that is worth saying out loud rather than claiming offline as a
 *    headline feature. The panel only appears when real data shows both tags.
 */

type TagLabels = Record<string, { label: string; icon: string }>;
type Accent = "green" | "blue" | "amber" | "red" | "violet" | "slate";

const CHANNEL_UNKNOWN_KEY = "direct";
const SPECIES_UNSPECIFIED = "unspecified";

function friendlyAudience(aud: string): string {
  if (aud === "farmer") return "Farmer";
  if (aud === "adviser") return "Extension adviser";
  if (aud === "other") return "Other";
  if (aud === "unspecified") return "Unspecified";
  return aud;
}

function friendlyChannel(raw: string): { label: string; hint: string | null } {
  if (!raw || raw === CHANNEL_UNKNOWN_KEY) {
    return { label: "Direct invite", hint: null };
  }
  const parts = raw.split("|");
  const source = parts[0] || "?";
  const medium = parts[1] || "?";
  const campaign = parts[2] || "?";
  const label = [source, medium, campaign].filter(Boolean).join(" · ") || raw;
  const hint = campaign === "?" ? null : `Campaign: ${campaign}`;
  return { label, hint };
}

function tagLbl(labels: TagLabels, key: string): string {
  return labels[key] ? labels[key].label : key;
}

function SegmentPanel({
  title,
  segment,
  bestLabels,
  accent = "slate",
}: {
  title: string;
  segment?: FeedbackSegmentSummary;
  bestLabels: TagLabels;
  accent?: Accent;
}) {
  if (!segment) return null;
  const rows = Object.entries(segment.bestCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, c]) => (
      <li key={k} className="flex items-center justify-between text-sm">
        <span className="truncate font-medium text-wangari-heading">{tagLbl(bestLabels, k)}</span>
        <span className="ml-2 shrink-0 text-wangari-muted">{c}</span>
      </li>
    ));
  return (
    <Panel title={title}>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Responses" value={segment.responses} icon={<Users className="h-5 w-5"/>} accent={accent}/>
        <StatCard label="Rated" value={segment.ratedCount} icon={<Star className="h-5 w-5"/>} accent={accent}/>
        <StatCard label="Average" value={segment.averageRating != null ? segment.averageRating : "—"} icon={<BarChart3 className="h-5 w-5"/>} accent={segment.averageRating != null ? "blue" : "slate"} hint={segment.averageRating == null ? "No ratings yet" : null}/>
      </div>
      {rows.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">Most useful features (by count)</p>
          <ul className="mt-2 space-y-1">{rows}</ul>
        </div>
      )}
    </Panel>
  );
}

export default function FeedbackAdminPage() {
  const [data, setData] = React.useState<FeedbackSummary | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [days, setDays] = React.useState(90);

  const load = React.useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const s = await feedbackApi.getSummary(days);
      setData(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load feedback");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  React.useEffect(() => { load(false); }, [load]);
  React.useEffect(() => {
    const t = setInterval(() => { load(true); }, 120000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return <Loading label="Loading feedback…"/>;
  if (error && !data) return <ErrorState message={error}/>;
  // After the guards above, a missing `data` means the first load has not
  // landed yet — show the spinner rather than dereferencing null.
  if (!data) return <Loading label="Loading feedback…"/>;

  const total = data.responses;
  const rated = data.ratedCount;
  const average = data.averageRating;
  const audienceList = Array.from(
    new Set([...(data.labels.audienceOrder ?? []), ...Object.keys(data.audienceCounts)])
  );
  const speciesList = Object.keys(data.speciesCounts).slice().sort();
  const topChannels = Object.entries(data.channelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const offlineBest = data.bestRanked.find((b) => b.tag === "inafanya_kazi_bila_internet")?.count ?? 0;
  const internetWants = data.improveRanked.find((b) => b.tag === "mtandao")?.count ?? 0;
  const topImprove = data.improveRanked[0];
  const hasContradiction = total >= 3 && offlineBest > 0 && internetWants > 0;

  const header = (
    <PageHeader
      icon={<MessageSquare className="h-5 w-5"/>}
      title="User feedback"
      description="From farmers and everyone else — real answers, not AI smoothing"
      actions={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-wangari-border bg-white px-3 py-1.5 text-xs font-semibold text-wangari-muted">
            <span>Date:</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-transparent font-bold text-wangari-heading outline-none">
              <option value={7}>7</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={365}>12 months</option>
            </select>
          </label>
          <GhostButton onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={"mr-1 h-4 w-4" + (refreshing ? " animate-spin" : "")}/>
            Refresh
          </GhostButton>
        </div>
      }
    />
  );

  const kpiRow = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="All responses" value={total} icon={<MessageSquare className="h-5 w-5"/>} accent="green" hint={`${rated} carried a rating`}/>
      <StatCard label="Rated" value={rated} icon={<Star className="h-5 w-5"/>} accent="amber"/>
      <StatCard label="Average rating" value={average != null ? average : "—"} icon={<BarChart3 className="h-5 w-5"/>} accent={average != null ? "blue" : "slate"} hint={average == null ? "No ratings yet" : null}/>
      <StatCard label="Top improvement ask" value={topImprove ? topImprove.count : 0} icon={<TrendingUp className="h-5 w-5"/>} accent="amber" hint={topImprove ? `Most cited: ${tagLbl(data.labels.improve, topImprove.tag)}` : "None yet"}/>
    </div>
  );

  const contradictionPanel = hasContradiction ? (
    <Panel title="Works offline vs needs internet" description="Some people said Wangari works without internet, others said it needs a connection — a real answer, not an AI smoothing." className="border-wangari-amber-300 bg-tone-warn-bg/40">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-tone-warn-border bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-tone-warn-text"><span className="inline-flex items-center gap-1.5"><Radio className="h-3.5 w-3.5"/>Works offline</span></div>
          <div className="mt-2 text-2xl font-extrabold text-wangari-heading">{offlineBest}</div>
          <div className="text-xs text-wangari-muted">people chose this</div>
        </div>
        <div className="rounded-xl border border-tone-bad-border bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-badge-red-text"><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5"/>Needs internet</span></div>
          <div className="mt-2 text-2xl font-extrabold text-wangari-heading">{internetWants}</div>
          <div className="text-xs text-wangari-muted">people named it essential</div>
        </div>
        <div className="rounded-xl border border-tone-neutral-border bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-muted">What it means</div>
          <p className="text-sm text-wangari-text">This is not a contradiction — it is a real connectivity problem. Farmers want to use it without a network, yet they run into the need for one. That gap is the point, per R8.</p>
        </div>
      </div>
    </Panel>
  ) : null;

  const bestListItems = data.bestRanked.map((b) => (
    <li key={b.tag} className="flex items-center justify-between rounded-lg border border-wangari-border/60 bg-white px-4 py-2.5 text-sm">
      <span className="truncate font-medium text-wangari-heading">{tagLbl(data.labels.best, b.tag)}</span>
      <div className="ml-4 shrink-0 flex items-center gap-2">
        <span className="font-bold text-wangari-green-700">{b.count}</span>
        <span className="text-xs text-wangari-muted">mentioned it</span>
      </div>
    </li>
  ));

  const improveListItems = data.improveRanked.map((b) => (
    <li key={b.tag} className="flex items-center justify-between rounded-lg border border-wangari-border/60 bg-white px-4 py-2.5 text-sm">
      <span className="truncate font-medium text-wangari-heading">{tagLbl(data.labels.improve, b.tag)}</span>
      <div className="ml-4 shrink-0 flex items-center gap-2">
        <span className="font-bold text-tone-warn-text">{b.count}</span>
        <span className="text-xs text-wangari-muted">mentioned it</span>
      </div>
    </li>
  ));

  const channelListItems = topChannels.map(([key, count]) => {
    const info = friendlyChannel(key);
    return (
      <li key={key} className="flex items-center justify-between rounded-lg border border-wangari-border/60 bg-white px-4 py-2.5 text-sm">
        <div className="min-w-0">
          <span className="truncate font-medium text-wangari-heading">{info.label}</span>
          {info.hint && <span className="ml-2 text-xs text-wangari-muted">{info.hint}</span>}
        </div>
        <div className="ml-4 shrink-0 flex items-center gap-2">
          <span className="font-bold text-wangari-green-700">{count}</span>
          <span className="text-xs text-wangari-muted">responses</span>
        </div>
      </li>
    );
  });

  const audiencePanels = audienceList.map((aud) => (
    <SegmentPanel key={aud} title={friendlyAudience(aud)} segment={data.byAudience[aud]} bestLabels={data.labels.best}/>
  ));

  const speciesCards = speciesList.map((sp) => {
    const seg = data.bySpecies[sp];
    const count = data.speciesCounts[sp] ?? 0;
    const muted = sp === SPECIES_UNSPECIFIED ? " opacity-60" : "";
    const avg = seg && seg.averageRating != null ? seg.averageRating : "—";
    const segRated = seg ? seg.ratedCount : 0;
    return (
      <div key={sp} className={"rounded-xl border border-wangari-border/60 bg-white p-4" + muted}>
        <div className="flex items-center justify-between">
          <span className="truncate font-medium text-wangari-heading">{sp === SPECIES_UNSPECIFIED ? "Unspecified" : sp}</span>
          <span className="shrink-0 text-sm font-bold text-wangari-muted">{count}</span>
        </div>
        {seg && (
          <div className="mt-2 text-sm">
            <span className="text-wangari-muted">Average: </span>
            <span className="font-bold text-wangari-green-700">{avg}</span>
            <span className="text-wangari-muted"> ({segRated} rated)</span>
          </div>
        )}
      </div>
    );
  });

  const recentRows = data.recent.map((r) => {
    const owner = r.farmId ? `Farm #${r.farmId}` : r.phone ? r.phone.slice(0, 4) + "…" : "—";
    const sourceLabel = r.source === "in_app" ? "In app" : r.source === "public_link" ? "Public link" : "Demo event";
    const sourceVariant = r.source === "in_app" ? "success" : r.source === "public_link" ? "warning" : "info";
    const bestChips = r.best.slice(0, 2).map((b) => (
      <Badge key={b} variant="default">{tagLbl(data.labels.best, b)}</Badge>
    ));
    const extraChip = r.best.length > 2 ? <Badge variant="outline">+{r.best.length - 2}</Badge> : null;
    const speciesChips = r.species.length > 0
      ? r.species.map((s) => <Badge key={s} variant="outline">{s}</Badge>)
      : <span className="text-xs text-wangari-muted">—</span>;
    const when = new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return (
      <tr key={r.id} className="hover:bg-wangari-green-50/40">
        <Td className="text-wangari-muted">{when}</Td>
        <Td className="font-medium text-wangari-heading">{owner}</Td>
        <Td><Badge variant={sourceVariant}>{sourceLabel}</Badge></Td>
        <Td><div className="flex flex-wrap gap-1">{speciesChips}</div></Td>
        <Td className="text-center">
          {r.rating != null
            ? <span className="text-lg font-bold">{r.rating}</span>
            : <span className="text-wangari-muted">—</span>}
        </Td>
        <Td><div className="flex flex-wrap gap-1">{bestChips}{extraChip}</div></Td>
        <Td className="text-wangari-muted max-w-[160px] truncate">{r.comment ?? "—"}</Td>
      </tr>
    );
  });

  return (
    <div className="space-y-6">
      {header}
      {kpiRow}
      {contradictionPanel}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Most useful features" description="Count of people, not an average">
          {bestListItems.length > 0 ? <ul className="space-y-2">{bestListItems}</ul> : <EmptyState title="No responses yet"/>}
        </Panel>
        <Panel title="Needs improvement" description="Count of people, not an average">
          {improveListItems.length > 0 ? <ul className="space-y-2">{improveListItems}</ul> : <EmptyState title="No responses yet"/>}
        </Panel>
      </div>
      <Panel title="Campaigns that brought answers" description="Campaigns that produced responses, not just signups">
        {channelListItems.length > 0 ? <ul className="space-y-2">{channelListItems}</ul> : <EmptyState title="No responses from campaigns yet"/>}
      </Panel>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {audiencePanels}
      </div>
      {speciesList.length > 0 && (
        <Panel title="Livestock / crop types" description="Average per type">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{speciesCards}</div>
        </Panel>
      )}
      <Panel title="Recent" description="Latest 50 responses — every single one">
        {recentRows.length > 0 ? (
          <TableShell minWidth={640}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>System</Th>
                <Th>Source</Th>
                <Th>Type</Th>
                <Th className="text-center">Rating</Th>
                <Th>What works well</Th>
                <Th>Comment (optional)</Th>
              </tr>
            </thead>
            <tbody>{recentRows}</tbody>
          </TableShell>
        ) : <EmptyState title="No responses yet"/>}
      </Panel>
    </div>
  );
}
