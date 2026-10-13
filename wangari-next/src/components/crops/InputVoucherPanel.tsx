"use client";

import * as React from "react";
import { TicketCheck, Plus, Trash2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

/**
 * Fertiliser e-voucher redemptions (gap report §2 B5).
 *
 * The KIAMIS export already proves eligibility — this records what happened
 * after the farmer walked into the dealer, and it exists because of one mistake
 * with real consequences: **counting a subsidy as income, or as a discount on
 * cost, understates what a crop cost to grow.**
 *
 * So the page is built around one distinction, printed where nobody can miss it:
 * the CASH the farmer paid is the cost of the input; the value the programme
 * covered is a transfer, disclosed beside it and never added to income.
 *
 * The programme terms themselves are never asserted — the 2025 NFSP price and
 * procedure are not 2026 terms.
 */

const kes = (n: unknown) => `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;

const PROGRAM_LABEL: Record<string, string> = {
  nfsp: "NFSP fertiliser",
  kcep_cral: "KCEP-CRAL",
  county: "County programme",
  other: "Other programme",
};

export function InputVoucherPanel({ crops, plots }: { crops: any[]; plots: any[] }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { showToast, ToastComponent } = useToast();

  const [form, setForm] = React.useState({
    program: "nfsp",
    dealer: "",
    inputName: "",
    voucherValue: "",
    farmerContribution: "",
    quantityKg: "",
    redeemedOn: new Date().toISOString().slice(0, 10),
    cropId: "",
    plotId: "",
  });

  const load = React.useCallback(() => {
    api
      .get("/api/input-vouchers")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  React.useEffect(load, [load]);

  const save = async () => {
    const face = Number(form.voucherValue) || 0;
    const cash = Number(form.farmerContribution) || 0;
    if (face <= 0 && cash <= 0) {
      showToast("Enter the voucher value, what you paid, or both");
      return;
    }
    setSaving(true);
    try {
      const res: any = await api.post("/api/input-vouchers", {
        program: form.program,
        dealer: form.dealer.trim() || null,
        inputName: form.inputName.trim() || null,
        voucherValue: face,
        farmerContribution: cash,
        quantityKg: form.quantityKg === "" ? null : Number(form.quantityKg),
        redeemedOn: form.redeemedOn,
        cropId: form.cropId ? Number(form.cropId) : null,
        plotId: form.plotId ? Number(form.plotId) : null,
      });
      // Tell the farmer what the app just did with their money — including when
      // it deliberately booked nothing, which is the case a farmer would
      // otherwise find confusing.
      showToast(
        res?.bookedAsExpense
          ? `Saved — ${kes(cash)} booked as the input cost`
          : "Saved — nothing booked, because you paid nothing in cash",
        "success"
      );
      setShowForm(false);
      setForm((f) => ({ ...f, dealer: "", inputName: "", voucherValue: "", farmerContribution: "", quantityKg: "" }));
      load();
    } catch (err: any) {
      showToast(err?.message || "Could not record the voucher");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/input-vouchers/${id}`);
      showToast("Removed — the expense it booked was left in your records", "success");
      load();
    } catch {
      showToast("Could not remove the voucher");
    }
  };

  const totals = data?.totals;
  const vouchers: any[] = data?.vouchers ?? [];

  return (
    <Card className="border border-wangari-border">
      {ToastComponent}
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <TicketCheck className="mt-0.5 h-4 w-4 text-wangari-green-800" />
            <div>
              <p className="text-sm font-bold text-wangari-gray-900">Fertiliser vouchers</p>
              <p className="max-w-2xl text-[11px] text-wangari-gray-400">
                {data?.basis ??
                  "A voucher is not income. The cash you paid is the cost of the input; the value the programme covered is shown separately."}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {showForm ? "Close" : "Record a redemption"}
          </Button>
        </div>

        {totals && totals.redemptions > 0 && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: "You paid in cash", value: kes(totals.cashPaid), note: "this is the input cost" },
              { label: "Programme covered", value: kes(totals.subsidyValue), note: "a transfer, not income" },
              { label: "Value received", value: kes(totals.totalValue), note: "cash + covered" },
              {
                label: "Cash per kg",
                value: totals.cashPerKg != null ? kes(totals.cashPerKg) : "—",
                note: totals.cashPerKg != null ? "over vouchers with a quantity" : "no quantities recorded",
              },
            ].map((c) => (
              <div key={c.label} className="rounded-xl bg-wangari-sunken px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-wangari-muted">{c.label}</p>
                <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-wangari-heading">{c.value}</p>
                <p className="text-[10px] text-wangari-muted">{c.note}</p>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="space-y-3 rounded-xl border border-dashed border-wangari-border p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Programme</Label>
                <select
                  value={form.program}
                  onChange={(e) => setForm({ ...form, program: e.target.value })}
                  className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                >
                  {Object.entries(PROGRAM_LABEL).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Dealer</Label>
                <Input placeholder="e.g. Kigumo agrovet" value={form.dealer} onChange={(e) => setForm({ ...form, dealer: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">What did you collect?</Label>
                <Input placeholder="e.g. DAP, 2 bags" value={form.inputName} onChange={(e) => setForm({ ...form, inputName: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Voucher value (KES)</Label>
                <Input type="number" inputMode="decimal" placeholder="what the voucher was worth" value={form.voucherValue} onChange={(e) => setForm({ ...form, voucherValue: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">What you paid in cash (KES)</Label>
                <Input type="number" inputMode="decimal" placeholder="0 if you paid nothing" value={form.farmerContribution} onChange={(e) => setForm({ ...form, farmerContribution: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Quantity (kg, optional)</Label>
                <Input type="number" inputMode="decimal" placeholder="e.g. 100" value={form.quantityKg} onChange={(e) => setForm({ ...form, quantityKg: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Redeemed on</Label>
                <Input type="date" className="h-11 rounded-xl" value={form.redeemedOn} onChange={(e) => setForm({ ...form, redeemedOn: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Which crop? (optional)</Label>
                <select
                  value={form.cropId}
                  onChange={(e) => setForm({ ...form, cropId: e.target.value })}
                  className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                >
                  <option value="">Not a specific crop</option>
                  {crops.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.cropType})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Which plot? (optional)</Label>
                <select
                  value={form.plotId}
                  onChange={(e) => setForm({ ...form, plotId: e.target.value })}
                  className="h-11 w-full rounded-xl border border-wangari-border bg-white px-3 text-sm"
                >
                  <option value="">Not a specific plot</option>
                  {plots.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {Number(form.voucherValue) > 0 && Number(form.farmerContribution) <= 0 && (
              <p className="flex items-start gap-1.5 rounded-xl bg-wangari-sunken px-3 py-2 text-[11px] text-wangari-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                You paid nothing in cash, so no expense will be booked — a voucher is not money you spent. The value is
                still recorded here so you can show what you received.
              </p>
            )}

            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save the redemption"}
            </Button>
          </div>
        )}

        {loading ? (
          <div className="h-16 animate-pulse rounded-xl bg-wangari-border/40" />
        ) : vouchers.length === 0 ? (
          <EmptyState
            icon={<TicketCheck className="h-7 w-7" />}
            title="No vouchers recorded"
            description="When you collect subsidised fertiliser, record what the voucher covered and what you paid. The cash is the cost; the rest is shown as what the programme covered."
          />
        ) : (
          <ul className="divide-y divide-wangari-gray-50">
            {vouchers.slice(0, 10).map((v) => {
              const split = v.split ?? {};
              return (
                <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-wangari-gray-900">
                      {v.inputName || PROGRAM_LABEL[v.program] || "Inputs"}
                      {v.dealer ? <span className="ml-1.5 font-normal text-wangari-gray-500">at {v.dealer}</span> : null}
                    </p>
                    <p className="text-[11px] text-wangari-gray-500">
                      {new Date(v.redeemedOn).toLocaleDateString("en-KE")}
                      {v.cropName ? ` · ${v.cropName}` : ""}
                      {v.plotName ? ` · ${v.plotName}` : ""}
                      {v.quantityKg != null ? ` · ${Number(v.quantityKg)} kg` : ""}
                    </p>
                    <p className="text-[11px] text-wangari-gray-400">
                      you paid <span className="font-bold text-wangari-gray-700">{kes(split.cashPaid)}</span>
                      {Number(split.subsidyValue) > 0 ? ` · programme covered ${kes(split.subsidyValue)}` : ""}
                      {split.subsidySharePct != null ? ` (${split.subsidySharePct}%)` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{kes(split.totalValue)} of inputs</Badge>
                    <button onClick={() => remove(v.id)} aria-label="Remove voucher" className="cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5 text-tone-bad-text" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default InputVoucherPanel;
