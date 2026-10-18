"use client";

import * as React from "react";
import { Building2, ShieldCheck, Scale, FileText, CheckCircle2, ArrowRight, Loader2, Users, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function CooperativesPage() {
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    coopName: "",
    county: "Kiambu",
    memberCount: "500–2,000 members",
    message: "",
  });
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const fullMessage = `Cooperative Pilot Request:
County: ${form.county}
Estimated Members: ${form.memberCount}
Notes: ${form.message || "None provided"}`;

      await api.post("/api/contact", {
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.coopName,
        message: fullMessage,
        source: "coop_pilot",
      });

      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || "Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-wangari-cream/40">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-wangari-green-950 via-wangari-green-900 to-wangari-green-900 text-white pt-24 pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-xs font-semibold text-wangari-green-200 border border-white/15">
            <Building2 className="h-4 w-4 text-wangari-green-300" />
            <span>Enterprise & Cooperative Solutions</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto leading-tight">
            Stop Milk Weighing Disputes. Protect Your Cooperative&apos;s Margin.
          </h1>
          <p className="text-base sm:text-lg text-wangari-green-100/90 max-w-2xl mx-auto leading-relaxed">
            Eliminate manual ledger arguments, automate member monthly deductions, and provide transparent digital delivery statements that keep farmers loyal to your society.
          </p>
          <div className="pt-2">
            <a
              href="#pilot-form"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-wangari-green-500 hover:bg-wangari-green-600 text-white font-bold text-sm shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
            >
              <span>Request 30-Day Collection Center Pilot</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* 4 Pillars Grid */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-wangari-heading">
            Built for Kenyan Dairy Cooperatives & SACCOs
          </h2>
          <p className="mt-2 text-sm text-wangari-muted">
            Designed specifically for rural collection centers with intermittent internet connectivity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-wangari-border shadow-xs space-y-3">
            <div className="h-10 w-10 rounded-xl bg-wangari-green-100 text-wangari-green-800 flex items-center justify-center font-bold">
              <Scale className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-wangari-heading">Tamper-Proof Delivery Records</h3>
            <p className="text-sm text-wangari-muted leading-relaxed">
              Every litre of morning and evening milk is recorded with an exact timestamp. Both the clerk and the farmer receive identical digital receipts, eliminating month-end discrepancies.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-wangari-border shadow-xs space-y-3">
            <div className="h-10 w-10 rounded-xl bg-wangari-green-100 text-wangari-green-800 flex items-center justify-center font-bold">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-wangari-heading">Instant Month-End Reconciliation</h3>
            <p className="text-sm text-wangari-muted leading-relaxed">
              Automatic deductions for artificial insemination (A.I.), agrovet inputs, veterinary advances, and transport fees. Generate audited payout payrolls in minutes instead of days.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-wangari-border shadow-xs space-y-3">
            <div className="h-10 w-10 rounded-xl bg-wangari-green-100 text-wangari-green-800 flex items-center justify-center font-bold">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-wangari-heading">Prevent Farmer Churn to Hawkers</h3>
            <p className="text-sm text-wangari-muted leading-relaxed">
              When farmers have complete transparency into their cumulative milk earnings and bonus forecasts, retention increases by up to 24% against unregulated middle-men.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-wangari-border shadow-xs space-y-3">
            <div className="h-10 w-10 rounded-xl bg-wangari-green-100 text-wangari-green-800 flex items-center justify-center font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-wangari-heading">Executive Board Dashboard</h3>
            <p className="text-sm text-wangari-muted leading-relaxed">
              Real-time daily intake analytics across all collection routes. Detect route spillages, cold-chain temperature drops, and seasonal yield fluctuations immediately.
            </p>
          </div>
        </div>
      </section>

      {/* Pilot Intake Form */}
      <section id="pilot-form" className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <div className="bg-white rounded-3xl p-8 sm:p-10 border border-wangari-border shadow-xl">
          {submitted ? (
            <div className="text-center py-10 space-y-4">
              <div className="h-14 w-14 rounded-full bg-wangari-green-100 text-wangari-green-800 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold text-wangari-heading">Pilot Request Received</h3>
              <p className="text-sm text-wangari-muted max-w-md mx-auto leading-relaxed">
                Thank you! Our cooperative enterprise team has received your details. We will contact you within 24 hours on phone and WhatsApp to structure your 30-day collection center pilot.
              </p>
              <div className="pt-4">
                <Link href="/" className="text-sm font-bold text-wangari-green-800 hover:underline">
                  Return to Wangari Home →
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-wangari-heading">
                  Request a Free 30-Day Cooperative Pilot
                </h3>
                <p className="text-xs sm:text-sm text-wangari-muted">
                  Test Wangari at 1 or more collection centers with up to 250 farmers at zero upfront cost.
                </p>
              </div>

              {error && (
                <div className="p-3 text-xs font-semibold text-badge-red-text bg-tone-bad-bg border border-tone-bad-border rounded-xl">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="coopName" className="text-xs font-semibold text-wangari-heading">
                    Cooperative / Society Name *
                  </Label>
                  <Input
                    id="coopName"
                    required
                    placeholder="e.g. Wakulima Dairy Cooperative"
                    value={form.coopName}
                    onChange={(e) => setForm({ ...form, coopName: e.target.value })}
                    className="mt-1.5 h-11 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor="name" className="text-xs font-semibold text-wangari-heading">
                    Manager / Representative Name *
                  </Label>
                  <Input
                    id="name"
                    required
                    placeholder="e.g. Peter Kamau (General Manager)"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1.5 h-11 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone" className="text-xs font-semibold text-wangari-heading">
                    Phone / WhatsApp Number *
                  </Label>
                  <Input
                    id="phone"
                    required
                    type="tel"
                    placeholder="e.g. 0712 345 678"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1.5 h-11 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-xs font-semibold text-wangari-heading">
                    Official Email Address *
                  </Label>
                  <Input
                    id="email"
                    required
                    type="email"
                    placeholder="manager@coop.co.ke"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1.5 h-11 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="county" className="text-xs font-semibold text-wangari-heading">
                    County
                  </Label>
                  <select
                    id="county"
                    value={form.county}
                    onChange={(e) => setForm({ ...form, county: e.target.value })}
                    className="mt-1.5 w-full h-11 rounded-xl border border-wangari-border bg-white px-3 text-sm text-wangari-text focus:ring-2 focus:ring-wangari-green-800"
                  >
                    <option value="Kiambu">Kiambu</option>
                    <option value="Nakuru">Nakuru</option>
                    <option value="Nyandarua">Nyandarua</option>
                    <option value="Meru">Meru</option>
                    <option value="Nyeri">Nyeri</option>
                    <option value="Murang'a">Murang&apos;a</option>
                    <option value="Kericho">Kericho</option>
                    <option value="Bomet">Bomet</option>
                    <option value="Uasin Gishu">Uasin Gishu</option>
                    <option value="Nandi">Nandi</option>
                    <option value="Kisumu">Kisumu</option>
                    <option value="Machakos">Machakos</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="members" className="text-xs font-semibold text-wangari-heading">
                    Active Farmer Members
                  </Label>
                  <select
                    id="members"
                    value={form.memberCount}
                    onChange={(e) => setForm({ ...form, memberCount: e.target.value })}
                    className="mt-1.5 w-full h-11 rounded-xl border border-wangari-border bg-white px-3 text-sm text-wangari-text focus:ring-2 focus:ring-wangari-green-800"
                  >
                    <option value="Under 250">Under 250 members</option>
                    <option value="250–500">250–500 members</option>
                    <option value="500–2,000">500–2,000 members</option>
                    <option value="2,000–5,000">2,000–5,000 members</option>
                    <option value="5,000+">5,000+ members</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="message" className="text-xs font-semibold text-wangari-heading">
                  Current Challenges or Key Objectives (Optional)
                </Label>
                <textarea
                  id="message"
                  rows={3}
                  placeholder="e.g. We have 3 collection centers experiencing discrepancies between scale readings and clerical records."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-wangari-border p-3 text-sm text-wangari-text focus:ring-2 focus:ring-wangari-green-800"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-bold text-sm shadow-md cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Submitting Pilot Request...
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-4 w-4 mr-2" />
                    Submit 30-Day Pilot Request
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
