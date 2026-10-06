"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Bird,
  Beef,
  Droplets,
  Flower,
  ChevronRight,
  Tag,
  Hash,
  CalendarDays,
  MapPin,
  Sprout,
  Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSpeciesByCategory,
  getSpeciesCategories,
  type SpeciesTemplate,
} from "@/lib/species-templates";
import { AnitracRangeCard } from "@/components/flocks/AnitracRangeCard";
import { useToast } from "@/components/shared/toast";
import { BTN_LINK_SM } from "@/components/ui/patterns";

const iconMap: Record<string, any> = { bird: Bird, beef: Beef, droplets: Droplets, flower: Flower };

interface CreateFlockFormProps {
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  /** Existing group names on this farm — offered as dropdown suggestions
   *  so farmers pick an existing group instead of retyping (avoids duplicate
   *  or misspelled group names). Free text still allowed for a new group. */
  existingNames?: string[];
}

export function CreateFlockForm({ onSubmit, onCancel, existingNames = [] }: CreateFlockFormProps) {
  const { showToast, ToastComponent } = useToast();
  const [step, setStep] = React.useState(0); // 0=category, 1=species, 2=basics, 3=review
  const [selectedCategory, setSelectedCategory] = React.useState("poultry");
  const [selectedSpecies, setSelectedSpecies] = React.useState<SpeciesTemplate | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [form, setForm] = React.useState({
    name: "",
    initialCount: "",
    hatchDate: new Date().toISOString().split("T")[0],
   breed: "",
    location: "",
    costPerAnimal: "",
    notes: "",
  });

  // ANITRAC tag range. Optional and collapsed by default: most farmers have no
  // tags, and adding tagging must never slow down creating a flock. When they
  // DO have tags, it is three numbers for the whole herd — never one per animal.
  const [tagRange, setTagRange] = React.useState({ tagFrom: "", tagTo: "" });

  const categories = getSpeciesCategories();
  const speciesList = getSpeciesByCategory(selectedCategory);

  // Auto-fill when species selected
  const handleSpeciesSelect = (species: SpeciesTemplate) => {
    setSelectedSpecies(species);
    setForm(prev => ({
      ...prev,
     breed: species.breeds[0] || "",
      costPerAnimal: species.costPerAnimal.toString(),
    }));
    setStep(2);
  };

  const totalInvestment = (Number(form.initialCount) || 0) * (Number(form.costPerAnimal) || 0);

  const handleSubmit = async () => {
    if (!selectedSpecies || !form.name || !form.initialCount) return;
    setLoading(true);
    try {
      await onSubmit({
        name: form.name,
       breed: form.breed,
        type: selectedSpecies.id,
        category: selectedSpecies.category,
        initialCount: Number(form.initialCount),
        hatchDate: form.hatchDate,
        location: form.location || null,
        costPerAnimal: Number(form.costPerAnimal) || null,
        totalInvestment: totalInvestment || null,
        notes: form.notes || null,
        purpose: selectedSpecies.defaultPurpose,
        gender: selectedSpecies.defaultGender,
        // Only send when the farmer actually entered a full range; the server
        // ignores a partial one.
        ...(tagRange.tagFrom && tagRange.tagTo
          ? { tagFrom: tagRange.tagFrom, tagTo: tagRange.tagTo }
          : {}),
        vaccinationSchedule: selectedSpecies.vaccinationSchedule,
      });
    } catch (err) {
      // Without this, a failed save was completely invisible: the promise
      // rejected, `finally` reset the button, and the farmer was left staring at
      // a form that looked like it had worked. They would click Save again and
      // again. Always say what went wrong, and never navigate away on failure.
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not save your livestock. Check your connection and try again.";
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ["Category", "Species", "Details", "Confirm"];

  // useToast returns the element as {ToastComponent}, not <ToastComponent />.
  // Without this in the tree a failed save still said nothing.
  const toast = ToastComponent;

  return (
    <>
      {toast}
      <Card className="border border-wangari-border shadow-lg">
      <CardContent className="p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {stepLabels.map((label, i) => (
            <React.Fragment key={label}>
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${i <= step ? "text-wangari-green-800" : "text-wangari-subtle"}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? "bg-wangari-green-800 text-white" : i === step ? "bg-wangari-green-800 text-white" : "bg-wangari-cream text-wangari-subtle"}`}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < 3 && <div className={`flex-1 h-0.5 rounded ${i < step ? "bg-wangari-green-800" : "bg-wangari-cream"}`} />}
            </React.Fragment>
          ))}
          <button onClick={onCancel} className={BTN_LINK_SM}><X className="h-4 w-4" /></button>
        </div>

        {/* Step 0: Category */}
        {step === 0 && (
          <div>
            <p className="text-sm font-bold text-wangari-heading mb-3">What type of animal?</p>
            <div className="grid grid-cols-2 gap-3">
              {categories.map(cat => {
                const Icon = iconMap[cat.icon] || Bird;
                return (
                  <button key={cat.id} onClick={() => { setSelectedCategory(cat.id); setStep(1); }}
                    className="flex flex-col items-center gap-2 rounded-xl border-2 border-wangari-border p-6 hover:border-wangari-green-600 hover:bg-wangari-green-50 transition-all cursor-pointer">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-wangari-green-50 text-wangari-green-700">
                      <Icon className="h-7 w-7" />
                    </div>
                    <span className="text-sm font-bold text-wangari-heading">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Species */}
        {step === 1 && (
          <div>
            <p className="text-sm font-bold text-wangari-heading mb-3">Which species?</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
              {speciesList.map(sp => (
                <button key={sp.id} onClick={() => handleSpeciesSelect(sp)}
                  className="text-left rounded-xl border border-wangari-border px-4 py-3 hover:border-wangari-green-600 hover:bg-wangari-green-50 transition-all cursor-pointer">
                  <p className="text-sm font-bold text-wangari-heading">{sp.name}</p>
                  <p className="text-[10px] text-wangari-subtle mt-0.5">{sp.breeds.slice(0, 2).join(", ")}{sp.breeds.length > 2 ? "..." : ""}</p>
                  <p className="text-[10px] text-wangari-green-700 mt-0.5">~KES {sp.costPerAnimal.toLocaleString()}/head</p>
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setStep(0)} className="mt-3 cursor-pointer">Back</Button>
          </div>
        )}

        {/* Step 2: Basics */}
        {step === 2 && selectedSpecies && (
          <div>
            <p className="text-sm font-bold text-wangari-heading mb-1">
              Adding <span className="text-wangari-green-800">{selectedSpecies.name}</span>
            </p>
            <p className="text-xs text-wangari-subtle mb-4">Fill in the basics — you can add more details later</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><Tag className="h-3.5 w-3.5" aria-hidden />Group name *</Label>
                <Input
                  list="existing-flock-names"
                  placeholder="e.g. Layer Block A"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="h-11 rounded-xl"
                  autoFocus
                />
                <datalist id="existing-flock-names">
                  {existingNames.map(n => <option key={n} value={n} />)}
                </datalist>
                {existingNames.includes(form.name.trim()) && (
                  <p className="text-[11px] text-tone-warn-text">A group with this name already exists — consider adding to it from My Animals instead.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><Hash className="h-3.5 w-3.5" aria-hidden />Number of animals *</Label>
                <Input type="number" placeholder="e.g. 500" value={form.initialCount} onChange={e => setForm({ ...form, initialCount: e.target.value })} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><CalendarDays className="h-3.5 w-3.5" aria-hidden />Date acquired</Label>
                <Input type="date" value={form.hatchDate} onChange={e => setForm({ ...form, hatchDate: e.target.value })} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><MapPin className="h-3.5 w-3.5" aria-hidden />Location</Label>
                <Input placeholder="e.g. Pen A" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><Sprout className="h-3.5 w-3.5" aria-hidden />Breed</Label>
                <select value={form.breed} onChange={e => setForm({ ...form, breed: e.target.value })} className="w-full h-11 rounded-xl border border-wangari-border px-3 text-sm">
                  {selectedSpecies.breeds.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs font-semibold text-wangari-muted"><Banknote className="h-3.5 w-3.5" aria-hidden />Cost per head (KES)</Label>
                <Input type="number" placeholder={String(selectedSpecies.costPerAnimal)} value={form.costPerAnimal} onChange={e => setForm({ ...form, costPerAnimal: e.target.value })} className="h-11 rounded-xl" />
              </div>
            </div>
            <AnitracRangeCard
              value={tagRange}
              onChange={setTagRange}
              headCount={Number(form.initialCount) || null}
            />

            {Number(form.initialCount) > 0 && Number(form.costPerAnimal) > 0 && (
              <div className="mt-3 rounded-lg bg-wangari-green-50 border border-tone-good-border p-3 text-xs">
                <span className="text-wangari-muted">Total investment:</span>{" "}
                <span className="font-bold text-wangari-green-800">KES {totalInvestment.toLocaleString()}</span>
                {" "}({form.initialCount} × KES {Number(form.costPerAnimal).toLocaleString()})
              </div>
            )}
            <div className="sticky bottom-0 -mx-6 mt-4 flex gap-2 border-t border-wangari-border bg-wangari-card px-6 py-4">
              <Button onClick={() => setStep(3)} disabled={!form.name || !form.initialCount} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer disabled:opacity-50">Review <ChevronRight className="h-4 w-4 ml-1" /></Button>
              <Button variant="outline" onClick={() => setStep(1)} className="cursor-pointer">Back</Button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && selectedSpecies && (
          <div>
            <p className="text-sm font-bold text-wangari-heading mb-4">Confirm your livestock</p>
            <div className="rounded-xl bg-wangari-green-50 border border-tone-good-border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-wangari-muted">Species:</span><span className="font-bold">{selectedSpecies.name}</span></div>
              <div className="flex justify-between"><span className="text-wangari-muted">Group name:</span><span className="font-bold">{form.name}</span></div>
              <div className="flex justify-between"><span className="text-wangari-muted">Count:</span><span className="font-bold">{form.initialCount} head</span></div>
              {form.breed && <div className="flex justify-between"><span className="text-wangari-muted">Breed:</span><span className="font-bold">{form.breed}</span></div>}
              {tagRange.tagFrom && tagRange.tagTo && (
                <div className="flex justify-between">
                  <span className="text-wangari-muted">ANITRAC tags:</span>
                  <span className="font-mono text-xs font-bold">
                    {tagRange.tagFrom} – {tagRange.tagTo}
                  </span>
                </div>
              )}
              {form.location && <div className="flex justify-between"><span className="text-wangari-muted">Location:</span><span className="font-bold">{form.location}</span></div>}
              {form.hatchDate && <div className="flex justify-between"><span className="text-wangari-muted">Date:</span><span className="font-bold">{new Date(form.hatchDate).toLocaleDateString()}</span></div>}
              {totalInvestment > 0 && <div className="flex justify-between border-t border-tone-good-border pt-1.5"><span className="font-bold">Investment:</span><span className="font-bold text-wangari-green-800">KES {totalInvestment.toLocaleString()}</span></div>}
            </div>
            <div className="sticky bottom-0 -mx-6 mt-4 flex gap-2 border-t border-wangari-border bg-wangari-card px-6 py-4">
              <Button onClick={handleSubmit} disabled={loading} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer disabled:opacity-50">
                {loading ? "Saving..." : "Save livestock"}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} className="cursor-pointer">Edit</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
