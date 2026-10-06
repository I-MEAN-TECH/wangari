"use client";

import * as React from "react";
import { Wheat, Syringe, Home, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { speciesFor } from "@/lib/species-resolve";
import type { SpeciesTemplate } from "@/lib/species-templates";

/**
 * "What do I do next for this group?" — the answer to the question a farmer
 * actually opens the app with.
 *
 * Previously this information appeared only in the wizard shown immediately
 * after creating a group, which meant a farmer could never get it back. Worse,
 * the wizard looked up `speciesTemplates[type] || speciesTemplates.layers`, so
 * a group whose type was missing (any offline-created group) showed poultry
 * feed and per-bird water for cattle. This card reads the species through the
 * same resolver the wizard does, and shows nothing rather than the wrong animal
 * when the species is unknown.
 */
export function SpeciesGuidanceCard({
  flock,
  onEdit,
}: {
  flock: any;
  onEdit?: () => void;
}) {
  const species = speciesFor(flock);
  const [open, setOpen] = React.useState(false);

  // Unknown species: say so plainly and offer the one action that fixes it.
  if (!species) {
    return (
      <Card className="border-tone-warn-border bg-tone-warn-bg/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">
                We do not know what kind of animal this is
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Set the species to get the right feed rate, vaccine schedule and housing
                space. We will not guess — advice for the wrong animal costs more than no
                advice.
              </p>
              {onEdit && (
                <Button variant="outline" size="sm" className="mt-3" onClick={onEdit}>
                  Set species
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
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
            <Wheat className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-wangari-heading">
              {species.name} — what to do next
            </p>
            <p className="text-xs text-wangari-muted">
              {species.feedTypes.slice(0, 2).join(" · ")}
            </p>
          </div>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-wangari-subtle transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>

        {open && (
          <div className="mt-4 space-y-4 border-t border-wangari-border pt-4">
            {/* Feed */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-wangari-subtle">
                <Wheat className="h-3.5 w-3.5" />
                Feed
              </p>
              <p className="text-sm font-semibold text-wangari-heading">
                {species.feedPerDay}
              </p>
              <p className="mt-1 text-xs text-wangari-muted">{species.waterPerDay} water</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {species.feedTypes.map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px]">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Vaccines */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-wangari-subtle">
                <Syringe className="h-3.5 w-3.5" />
                Vaccines
              </p>
              <ul className="space-y-1">
                {species.vaccinationSchedule.slice(0, 5).map((v) => (
                  <li key={v.vaccine} className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-wangari-heading">{v.vaccine}</span>
                    <span className="text-wangari-subtle">{v.ageLabel}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Housing */}
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-wangari-subtle">
                <Home className="h-3.5 w-3.5" />
                Housing
              </p>
              <p className="text-xs text-wangari-muted">
                {species.housingType} — {species.spacePerAnimal}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}