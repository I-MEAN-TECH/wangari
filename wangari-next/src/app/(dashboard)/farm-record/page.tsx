"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileText, Eye, Loader2, ShieldCheck, Building2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FarmRecordCard, type FarmRecordResponse } from "@/components/farm-record/FarmRecordCard";
import { LenderBrief } from "@/components/farm-record/LenderBrief";
import api from "@/lib/api-client";

/**
 * Onyesha rekodi yangu — the farm record.
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
      setError("Rekodi haikuweza kupatikana. Jaribu tena.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rekodi yangu"
        description="Onyesha kazi uliyofanya — kwa benki, SACCO au wakala."
      />

      {/* THE button. Full width, tall, icon-first, Swahili. */}
      {!record ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-green-200 bg-gradient-to-b from-green-50 to-white">
            <CardContent className="space-y-4 pt-8 pb-8">
              <div className="flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-100">
                  <FileText className="h-11 w-11 text-green-700" aria-hidden />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900">Onyesha rekodi yangu</h2>
                <p className="mx-auto mt-2 max-w-sm text-gray-600">
                  Rekodi hii inaonyesha kazi uliyofanya kila siku. Unaweza
                  kuichapisha au kutuma mwenyewe.
                </p>
              </div>

              <Button
                size="lg"
                className="h-20 w-full text-xl"
                onClick={load}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                ) : (
                  <Eye className="h-7 w-7" aria-hidden />
                )}
                {loading ? "Inatafuta…" : "Onyesha rekodi yangu"}
              </Button>

              {error ? (
                <p className="text-center text-sm font-medium text-red-600">{error}</p>
              ) : null}

              <div className="flex items-start gap-2 rounded-2xl bg-white p-3 text-left">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
                <p className="text-xs leading-relaxed text-gray-600">
                  Rekodi hii haitumwi kwa mtu yeyote bila wewe. Unachagua
                  nani aanze. Wangari hamuamuzi kukopesha.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* The farmer's view is the default and stays first. The lender
              template is one tap away, not in the way. */}
          {forLender ? <LenderBrief record={record} /> : <FarmRecordCard record={record} />}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setForLender((v) => !v)}
            >
              <Building2 className="h-4 w-4" aria-hidden />
              {forLender ? "Onyesha kwa mkulima" : "Kwa mtaalamu"}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={load}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Sasisha
            </Button>
          </div>

          {forLender ? (
            <p className="text-center text-xs text-muted-foreground">
              Mtaalamu anaweza kuona rekodi yako pekee. Hakuna kitu
              kinachotuma kwa mtu yeyote bila wewe.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
