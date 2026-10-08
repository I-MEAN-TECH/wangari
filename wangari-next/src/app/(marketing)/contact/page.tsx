"use client";

import * as React from "react";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { ArrowFillButton } from "@/components/clone/ArrowFillButton";
import { PageHero } from "@/components/clone/PageHero";
import { useSiteContent } from "@/lib/site-content";

/**
 * Contact.
 *
 * Rebuilt on the cloned public-site design system. The form, its endpoint, its
 * validation and the editable-CMS fields are all unchanged — only the skin is
 * new, and every colour in it comes from a token in styles/wc-theme.css.
 */

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
  subtitle:
    "Questions about Wangari, partnership opportunities, or enterprise hosting — we read every message.",
  successMessage: "Message received — we'll get back to you within one business day.",
  contactEmail: "sales@imeantech.com",
  contactPhone: "",
  location: "",
  hours: "",
};

const EMPTY_FORM = { name: "", email: "", phone: "", company: "", message: "" };

export default function ContactPage() {
  const { data } = useSiteContent<ContactContent>("contact");
  const content = { ...FALLBACK, ...(data ?? {}) };
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com"}/api/contact`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to send");
      setDone(true);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setBusy(false);
    }
  }

  const infoItems = [
    content.contactEmail && {
      Icon: Mail,
      label: "Email",
      value: content.contactEmail,
      href: `mailto:${content.contactEmail}`,
    },
    content.contactPhone && {
      Icon: Phone,
      label: "Phone",
      value: content.contactPhone,
      href: `tel:${content.contactPhone.replace(/\s/g, "")}`,
    },
    content.location && { Icon: MapPin, label: "Location", value: content.location, href: null },
    content.hours && { Icon: Clock, label: "Hours", value: content.hours, href: null },
  ].filter(Boolean) as {
    Icon: typeof Mail;
    label: string;
    value: string;
    href: string | null;
  }[];

  return (
    <>
      <PageHero
        eyebrow="CONTACT"
        title={
          <>
            {content.title.split(" ").slice(0, -1).join(" ")}{" "}
            <span className="serif-word">{content.title.split(" ").slice(-1)}</span>
          </>
        }
        lead={content.subtitle}
      />

      <section className="section stack-section">
        <div className="contact-grid">
          <div className="panel">
            {done ? (
              <>
                <h3>Message sent</h3>
                <p className="form-note is-ok">{content.successMessage}</p>
                <div className="page-actions is-start">
                  <ArrowFillButton href="/register" className="button primary">
                    Start your free trial
                  </ArrowFillButton>
                </div>
              </>
            ) : (
              <form onSubmit={submit}>
                <div className="grid-2">
                  <label className="field">
                    <span>Name *</span>
                    <input
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Email *</span>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Farm / company</span>
                    <input
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Message *</span>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </label>

                {error ? <p className="form-note is-error">{error}</p> : null}

                <button
                  type="submit"
                  className="button primary contact-submit"
                  disabled={busy}
                >
                  {busy ? "Sending…" : "Send message"}
                </button>
              </form>
            )}
          </div>

          <div className="panel panel-tint">
            <h3>Reach us directly</h3>
            <p>We read every message, and a real person answers.</p>

            <div className="contact-list">
              {infoItems.map((item) => (
                <div className="contact-row" key={item.label}>
                  <item.Icon aria-hidden="true" />
                  <span>
                    <span>{item.label}</span>
                    {item.href ? <a href={item.href}>{item.value}</a> : item.value}
                  </span>
                </div>
              ))}

              {/* Only stand in for the CMS field when it is actually empty. */}
              {content.location ? null : (
                <div className="contact-row">
                  <MapPin aria-hidden="true" />
                  <span>
                    <span>Where we are</span>Nairobi, Kenya
                  </span>
                </div>
              )}
            </div>

            <p className="form-note">
              If it is about records on your own farm, the fastest answer is in the app — the
              assistant reads your actual figures, not a help page.
            </p>
          </div>
        </div>
      </section>

      <section className="section stack-section">
        <div className="grid-3">
          <div className="stat">
            <strong>14 days</strong>
            <span>free trial on every plan, no card needed</span>
          </div>
          <div className="stat">
            <strong>1 business day</strong>
            <span>typical reply time to a message here</span>
          </div>
          <div className="stat">
            <strong>No bundles</strong>
            <span>records save on the phone and sync later</span>
          </div>
        </div>
      </section>
    </>
  );
}
