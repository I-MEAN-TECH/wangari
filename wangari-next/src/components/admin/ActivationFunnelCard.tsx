"use client";

import * as React from "react";
import { AlertTriangle, Clock, EyeOff, TrendingDown, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api-client";

/**
 * The activation funnel, on the admin screen.
 *
 * This exists because of the decision that reordered the whole product. On
 * 2 Oct 2026 a usage audit found 5 of 8 farms had never recorded anything, and
 * we concluded the bottleneck was reach and day-one value rather than missing
 * features. That conclusion was made from one SQL query, once.
 *
 * A conclusion you can reach with one query is a conclusion you can quietly
 * stop believing. So the measurement lives here, next to the thing it decides,
 * and it is deliberately unflattering:
 *
 *  - Step-to-step rates, not "onboarded / signups" — dividing two independent
 *    counts quietly blames us for accounts that predate the instrumentation.
 *  - The untracked-account count is shown on the card, not buried. If most
 *    accounts have no events at all, the funnel below it is describing a
 *    fraction of reality and the panel says so.
 *  - Day-7 return is anchored to the farmer's FIRST RECORD, not their signup.
 *    Being logged in before you ever recorded anything is a login, not a habit.
 */

interface FunnelStep {
  id: string;
  label: string;
  count: number;
  denominator: number;
  rate: number;
  lost: number;
}

interface FunnelReport {
  windowDays: number;
  signups: number;
  onboardingCompleted: number;
  firstRecord: number;
  returnedDay7: number;
  steps: FunnelStep[];
  signupToFirstRecordRate: number;
  medianDaysToFirstRecord: number;
  untrackedUsers: number;
  coverage: number;
  biggestDropStep: { id: string; label: string; lost: number } | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

// Tone follows the same app-wide language StatusChip already teaches.
function tone(rate: number): string {
  if (rate >= 0.7) return "bg-tone-good-bg text-tone-good-text border-tone-good-border";
  if (rate >= 0.3) return "bg-tone-warn-bg text-tone-warn-text border-tone-warn-border";
  return "bg-tone-bad-bg text-tone-bad-text border-tone-bad-border";
}

export function ActivationFunnelCard() {
  const [report, setReport] = React.useState<FunnelReport | null>(null);
  const [days, setDays] = React.useState(30);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/api/admin/activation?days=${windowDays}`);
      if (data?.steps) setReport(data as FunnelReport);
      else setError("The funnel endpoint did not return a funnel.");
    } catch (e: any) {
      setError(e?.message || "Could not load the funnel");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(days);
  }, [days, load]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4" />
              Activation funnel
            </h2>
            <p className="text-sm text-muted-foreground">
              Signup → claimed their farm → recorded something → came back on day 7.
              This is the measurement the next build decisions are based on.
            </p>
          </div>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "default" : "outline"}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-tone-bad-text">{error}</p>
        ) : report ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Signed up", value: report.signups },
                { label: "Claimed farm", value: report.onboardingCompleted },
                { label: "Recorded", value: report.firstRecord },
                { label: "Returned day 7", value: report.returnedDay7 },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{k.label}</dt>
                  <dd className="text-2xl font-bold tabular-nums">{k.value}</dd>
                </div>
              ))}
            </dl>

            {/* Each rate is measured against the people who actually reached the
                step before it, so the widths compare like with like. */}
            <ul className="space-y-2">
              {report.steps.map((s) => (
                <li key={s.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {s.count} of {s.denominator} · {pct(s.rate)}
                      {s.lost > 0 && ` · ${s.lost} lost here`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${tone(s.rate).split(" ")[0]}`}
                      style={{ width: `${Math.max(s.rate * 100, s.rate > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                <Users className="h-3.5 w-3.5" />
                {pct(report.signupToFirstRecordRate)} of signups ever recorded
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                <Clock className="h-3.5 w-3.5" />
                median {report.medianDaysToFirstRecord} day
                {report.medianDaysToFirstRecord === 1 ? "" : "s"} to first record
              </span>
            </div>

            {/* The honest caveat, on the card rather than in a footnote. */}
            {report.coverage < 0.9 && (
              <p className="flex items-start gap-2 rounded-2xl border border-tone-warn-border bg-tone-warn-bg px-3 py-2 text-xs text-tone-warn-text">
                <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This funnel covers {pct(report.coverage)} of accounts.{" "}
                  <strong>{report.untrackedUsers}</strong> account
                  {report.untrackedUsers === 1 ? "" : "s"} created before this was
                  instrumented are not counted here — they are not known to be
                  unactivated, only unmeasured.
                </span>
              </p>
            )}

            {report.biggestDropStep && (
              <p className="flex items-start gap-2 rounded-2xl border border-tone-bad-border bg-tone-bad-bg px-3 py-2 text-sm text-tone-bad-text">
                <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Biggest drop: <strong>{report.biggestDropStep.label}</strong> —{" "}
                  {report.biggestDropStep.lost} farmer
                  {report.biggestDropStep.lost === 1 ? "" : "s"} stopped there. That is the
                  next thing worth fixing.
                </span>
              </p>
            )}

            {report.firstRecord === 0 && (
              <p className="flex items-start gap-2 rounded-2xl border border-tone-warn-border bg-tone-warn-bg px-3 py-2 text-sm text-tone-warn-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Nobody recorded anything in this window. Before building anything else,
                  check the front door — this is what an unusable sign-up looks like.
                </span>
              </p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}