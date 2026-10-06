"use client";

import * as React from "react";
import {
  FlaskConical,
  Bug,
  Sprout,
  AlertTriangle,
  ChevronRight,
  CalendarClock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCropTemplate, currentStage } from "@/lib/crop-templates";

/**
 * "What should I apply to this crop, and when?" — for a specific crop the
 * farmer recorded, at the stage they are actually at.
 *
 * This is the crop-side answer to the same question SpeciesGuidanceCard answers
 * for animals. Crops had no equivalent at all: the crop screen recorded a type
 * and an area and offered nothing back, so the fertiliser, pesticide and timing
 * questions all went unanswered.
 *
 * The stage is derived from the planting date rather than asked for. A farmer
 * standing in the field needs "top-dress now", not a full season plan.
 */
export function CropGuidanceCard({ crop }: { crop: any }) {
  const template = getCropTemplate(crop.cropType);
  const [open, setOpen] = React.useState(false);
  const stage = template ? currentStage(template, crop.plantingDate) : null;

  if (!template) {
    return (
      <Card className="border-tone-warn-border bg-tone-warn-bg/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                No guidance for “{crop.cropType}” yet
              </p>
              <p className="mt-1 text-xs text-amber-800">
                We have fertiliser, pesticide and timing for maize, beans, tomatoes, kale,
                potatoes and onions. We would rather say nothing than give you another
                crop&apos;s instructions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-wangari-border">
      <CardContent className="p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 text-left"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700">
            <Sprout className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-wangari-heading">
              {template.name} — what to do next
            </p>
            <p className="text-xs text-wangari-muted">
              {stage ? `Now: ${stage.label}` : "Set a planting date to see what to do now"}
            </p>
          </div>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-wangari-subtle transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>

        {/* The "now" answer, visible without expanding. A farmer in the field
            should not have to open anything to see the current instruction. */}
        {stage && !open && (
          <div className="mt-3 rounded-xl bg-wangari-cream/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-wangari-subtle">
              {stage.label} — apply now
            </p>
            <ul className="mt-1.5 space-y-1">
              {stage.inputs.map((i) => (
                <li key={i} className="flex items-baseline gap-2 text-xs text-wangari-heading">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-wangari-green-600" />
                  {i}
                </li>
              ))}
            </ul>
          </div>
        )}

        {open && (
          <div className="mt-4 space-y-4 border-t border-wangari-border pt-4">
            {/* Fertiliser */}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-wangari-subtle">
                <FlaskConical className="h-3.5 w-3.5" />
                Fertiliser
              </p>
              <p className="text-sm font-semibold text-wangari-heading">
                {template.baseFertilizer}
              </p>
              <p className="mt-1 text-xs text-wangari-muted">{template.fertilizerReason}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  N: {template.nutrientNeeds.nitrogen}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  P: {template.nutrientNeeds.phosphorus}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  K: {template.nutrientNeeds.potassium}
                </Badge>
              </div>
            </div>

            {/* The one thing that costs this crop the most */}
            <div className="rounded-xl border border-tone-warn-border bg-tone-warn-bg/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-tone-warn-text">
                The mistake that costs most
              </p>
              <p className="mt-1 text-xs text-amber-900">{template.criticalTiming}</p>
            </div>

            {/* Pests */}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-wangari-subtle">
                <Bug className="h-3.5 w-3.5" />
                Pests and disease
              </p>
              <div className="space-y-2">
                {template.pests.map((p) => (
                  <div key={p.problem} className="rounded-lg border border-wangari-border p-2.5">
                    <p className="text-xs font-bold text-wangari-heading">{p.problem}</p>
                    <p className="mt-0.5 text-[11px] text-wangari-muted">
                      <span className="font-semibold">Look for:</span> {p.signs}
                    </p>
                    <p className="mt-0.5 text-[11px] text-wangari-muted">
                      <span className="font-semibold">Do:</span> {p.control}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Season plan */}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-wangari-subtle">
                <CalendarClock className="h-3.5 w-3.5" />
                Season plan
              </p>
              <div className="space-y-1.5">
                {template.stages.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-lg p-2.5 text-xs ${
                      stage?.id === s.id
                        ? "bg-wangari-green-50 ring-1 ring-wangari-green-200"
                        : "bg-wangari-cream/40"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-wangari-heading">{s.label}</span>
                      <span className="text-[10px] text-wangari-subtle">
                        {s.weekFrom === null
                          ? "before planting"
                          : `week ${s.weekFrom}${s.weekTo !== null && s.weekTo !== s.weekFrom ? `–${s.weekTo}` : ""}`}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {s.inputs.map((i) => (
                        <li key={i} className="text-wangari-muted">
                          · {i}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-wangari-subtle">
                Harvest: {template.harvestWindow}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}