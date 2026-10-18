"use client";

import * as React from "react";
import Link from "next/link";
import {
  Cookie,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Smartphone,
  EyeOff,
  HelpCircle,
} from "lucide-react";
import { PageHero } from "@/components/clone/PageHero";
import { CtaBand } from "@/components/clone/CtaBand";

export default function CookiePolicyPage() {
  const lastUpdated = "October 18, 2026";

  return (
    <>
      <PageHero
        eyebrow="COOKIE POLICY"
        title={
          <>
            No trackers.
            <br />
            Just essential <span className="serif-word">session tools.</span>
          </>
        }
        lead="Wangari uses only strictly necessary cookies to keep you signed in and enable offline farm record keeping. We never use advertising or cross-site tracking cookies."
      />

      {/* Summary for Farmers */}
      <section className="section stack-section">
        <div className="panel panel-tint">
          <div className="flex items-center gap-3 mb-4">
            <Cookie className="h-6 w-6 text-wangari-green-800" />
            <h2 className="text-xl font-extrabold text-wangari-heading">
              The Short Truth About Cookies on Wangari
            </h2>
          </div>
          <p className="text-sm text-wangari-muted mb-6">
            Many websites follow you across the internet with advertising trackers. Wangari does NOT do that.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">Session Login Only</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                When you log in, we save a secure digital key (JWT session) so you don&apos;t have to retype your password every time you check on your poultry.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">Offline Storage</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                We use your phone&apos;s local storage to hold records you take in the field without internet, so they sync cleanly when network returns.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <EyeOff className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">Zero Ad Trackers</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                No third-party advertising cookies, no data brokers, and no tracking across other websites you visit.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Technical Table */}
      <section className="section">
        <div className="max-w-4xl mx-auto space-y-8 text-wangari-text leading-relaxed">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-wangari-green-800">
              Technical Transparency &middot; Last updated {lastUpdated}
            </span>
            <h2 className="text-2xl font-extrabold text-wangari-heading mt-2">
              Cookies & Local Storage Employed
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse border border-wangari-border">
              <thead className="bg-wangari-cream font-bold text-wangari-heading">
                <tr>
                  <th className="p-3 border border-wangari-border">Storage Key / Cookie</th>
                  <th className="p-3 border border-wangari-border">Category</th>
                  <th className="p-3 border border-wangari-border">Duration</th>
                  <th className="p-3 border border-wangari-border">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wangari-border text-wangari-muted">
                <tr>
                  <td className="p-3 border border-wangari-border font-mono font-semibold">wangari_token</td>
                  <td className="p-3 border border-wangari-border">Strictly Necessary</td>
                  <td className="p-3 border border-wangari-border">7 days or until Logout</td>
                  <td className="p-3 border border-wangari-border">Secure authentication key that proves you are signed in to your farm.</td>
                </tr>
                <tr>
                  <td className="p-3 border border-wangari-border font-mono font-semibold">wangari_user</td>
                  <td className="p-3 border border-wangari-border">Strictly Necessary</td>
                  <td className="p-3 border border-wangari-border">Until Logout</td>
                  <td className="p-3 border border-wangari-border">Cached profile details (name, email, farm ID) to load dashboard swiftly.</td>
                </tr>
                <tr>
                  <td className="p-3 border border-wangari-border font-mono font-semibold">offline_queue</td>
                  <td className="p-3 border border-wangari-border">Strictly Necessary</td>
                  <td className="p-3 border border-wangari-border">Until Synced or Cleared</td>
                  <td className="p-3 border border-wangari-border">Stores animal intakes, egg records, and feed deductions captured while offline.</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legal Compliance Note */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-wangari-green-800" />
              Compliance with Kenyan Data Protection Principles
            </h3>
            <p className="text-sm text-wangari-muted">
              Under the <strong>Kenya Data Protection Act 2019</strong>, personal data processing must adhere to principles of lawfulness, fairness, and transparency. Because Wangari utilizes <strong>strictly necessary session identifiers</strong> exclusively for providing requested functionality (logging in and preventing data loss during offline field work), intrusive cookie consent banners are legally unnecessary.
            </p>
          </div>

          {/* How to Manage Cookies */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-wangari-green-800" />
              How to Clear or Manage Cookies in Your Browser
            </h3>
            <p className="text-sm text-wangari-muted">
              You can delete or block cookies through your browser settings at any time (e.g. Chrome, Safari, Firefox). Please note that clearing authentication tokens will log you out of your Wangari account and remove unsynchronized offline records stored on your device.
            </p>
          </div>

          {/* Contact */}
          <div className="space-y-3 border-t border-wangari-border pt-6">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-wangari-green-800" />
              Questions
            </h3>
            <p className="text-sm text-wangari-muted">
              If you have any questions regarding our storage practices, contact us at <strong>info@imeantech.com</strong> or review our full <Link href="/privacy" className="text-wangari-green-800 underline font-semibold">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="YOUR DATA IS YOURS"
        title={
          <>
            Start with one record.
            <br />
            <span className="serif-word">See what it tells you.</span>
          </>
        }
        copy="Core plan is free forever, no card required — your records belong 100% to you."
        ctaLabel="Start free — no card"
        ctaHref="/register"
        secondaryLabel="Talk to us"
        secondaryHref="/contact"
      />
    </>
  );
}
