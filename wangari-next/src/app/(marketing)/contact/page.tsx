"use client";

import * as React from "react";
import { CheckCircle2, Mail, Phone, MapPin, Clock } from "lucide-react";
import { useSiteContent } from "@/lib/site-content";

// Editable content shape (managed in /waadmin/website).
interface ContactContent {
  title: string;
  subtitle: string;
  successMessage: string;
  contactEmail: string;
  contactPhone: string;
  location: string;
  hours: string;
}

const FALLBACK: ContactContent = {
  title: "Talk to us",
  subtitle: "Questions about Wangari, partnership opportunities, or enterprise hosting — we read every message.",
  successMessage: "Message received — we'll get back to you within one business day.",
  contactEmail: "sales@imeantech.com",
  contactPhone: "",
  location: "",
  hours: "",
};

export default function ContactPage() {
  const { data } = useSiteContent<ContactContent>("contact");
  const content = { ...FALLBACK, ...(data ?? {}) };
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com"}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setDone(true);
      setForm({ name: "", email: "", phone: "", company: "", message: "" });
    } catch (err: any) {
      setError(err?.message || "Failed to send message");
    } finally {
      setBusy(false);
    }
  }

  const infoItems = [
    content.contactEmail && { icon: Mail, label: "Email", value: content.contactEmail, href: `mailto:${content.contactEmail}` },
    content.contactPhone && { icon: Phone, label: "Phone", value: content.contactPhone, href: `tel:${content.contactPhone.replace(/\s/g, "")}` },
    content.location && { icon: MapPin, label: "Location", value: content.location, href: null },
    content.hours && { icon: Clock, label: "Hours", value: content.hours, href: null },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href: string | null }[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight text-wangari-heading">{content.title}</h1>
      <p className="mt-2 text-sm text-wangari-muted">{content.subtitle}</p>

      {infoItems.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {infoItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border border-wangari-border bg-white px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-800">
                <item.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-wangari-subtle">{item.label}</div>
                {item.href ? (
                  <a href={item.href} className="truncate text-sm font-medium text-wangari-heading hover:text-wangari-green-800">{item.value}</a>
                ) : (
                  <div className="truncate text-sm font-medium text-wangari-heading">{item.value}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {done ? (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-800">{content.successMessage}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-wangari-border bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm focus:border-wangari-green-800 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Email *</label>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm focus:border-wangari-green-800 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm focus:border-wangari-green-800 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-wangari-muted">Farm / company</label>
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="h-11 w-full rounded-xl border border-wangari-border px-4 text-sm focus:border-wangari-green-800 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-wangari-muted">Message *</label>
            <textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full rounded-xl border border-wangari-border px-4 py-3 text-sm focus:border-wangari-green-800 focus:outline-none" />
          </div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <button type="submit" disabled={busy}
            className="h-12 w-full rounded-xl bg-wangari-green-800 text-sm font-bold text-white hover:bg-wangari-green-900 disabled:opacity-60 sm:w-auto sm:px-8">
            {busy ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </div>
  );
}
