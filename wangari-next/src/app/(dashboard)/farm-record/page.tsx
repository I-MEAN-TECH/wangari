"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileText, Eye, Loader2, ShieldCheck, Building2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FarmRecordCard, type FarmRecordResponse } from "@/components/farm-record/FarmRecordCard";
import { LenderBrief } from "@/components/farm-record/LenderBrief";
import { FarmRecordSummary } from "@/components/farm-record/FarmRecordSummary";
import api from "@/lib/api-client";

/**
 * My farm record — the proof layer.
 *
 * The farmer button is ONE tap and one giant target, per §0: a farmer who
 * cannot read or type should be able to open this and get to a printable,
 * shareable record in two taps, with no login, no settings and no jargon.
 *
 * The second button (For a lender/agent) is the SAME data, framed denser. It is
 * deliberately secondary and clearly labelled: the farmer is the audience, and
 * the report is theirs to share. Wangari never sends anything to anyone.
 */

export default function FarmRecordPage() {
  const [record, setRecord] = React.useState<FarmRecordResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [forLender, setForLender] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<FarmRecordResponse>("/api/farm-record");
      setRecord(data);
    } catch (e: any) {
      setError("Could not load your record. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My farm record"
        description="Show your work — to a bank, SACCO or field agent."
      />

      {/* The button is full width and tall, icon first — one tap, no jargon. */}
      {!record ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-wangari-green-50">
                  <FileText className="h-6 w-6 text-wangari-green-700" aria-hidden />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold tracking-tight text-wangari-heading">
                  Show my farm record
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-wangari-muted">
                  This record shows the work you have done, day by day. You can
                  print it or send it to anyone you choose.
                </p>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={load}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
                {loading ? "Loading…" : "Show my farm record"}
              </Button>

              {error ? (
                <p className="text-center text-sm font-medium text-tone-bad-text">
                  {error}
                </p>
              ) : null}

              <div className="flex items-start gap-2 rounded-xl bg-wangari-cream p-3 text-left">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-wangari-muted"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-wangari-muted">
                  This record is never sent to anyone without your say-so. You
                  choose who sees it.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* The farmer's view is the default and stays first. The lender
              template is one tap away, not in the way. */}
          {/* Farmer view: the visual dashboard (cards, KPIs, charts) first, then the
              record card itself. The summary is `no-print`, so printing still
              produces the document, not a screenshot of the charts. */}
          {forLender ? (
            <LenderBrief record={record} />
          ) : (
            <>
              <FarmRecordSummary record={record} />
              <FarmRecordCard record={record} />
            </>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setForLender((v) => !v)}
            >
              <Building2 className="h-4 w-4" aria-hidden />
              {forLender ? "Farmer view" : "For an agent"}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={load}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Refresh
            </Button>
          </div>

          {forLender ? (
            <p className="text-center text-xs text-wangari-muted">
              An agent only ever sees your record. Nothing is sent to anyone
              without your say-so.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
