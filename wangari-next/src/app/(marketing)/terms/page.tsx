"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileCheck,
  ShieldAlert,
  Scale,
  DollarSign,
  Cpu,
  Lock,
  Building,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { PageHero } from "@/components/clone/PageHero";
import { CtaBand } from "@/components/clone/CtaBand";

export default function TermsOfServicePage() {
  const lastUpdated = "October 18, 2026";

  return (
    <>
      <PageHero
        eyebrow="TERMS & CONDITIONS"
        title={
          <>
            Fair terms for
            <br />
            hard-working <span className="serif-word">farms.</span>
          </>
        }
        lead="Our agreement with you: you own your records, our software helps you manage them, and we keep things simple."
      />

      {/* Summary for Farmers */}
      <section className="section stack-section">
        <div className="panel panel-tint">
          <div className="flex items-center gap-3 mb-4">
            <FileCheck className="h-6 w-6 text-wangari-green-800" />
            <h2 className="text-xl font-extrabold text-wangari-heading">
              Plain Language Summary (Muhtasari wa Masharti)
            </h2>
          </div>
          <p className="text-sm text-wangari-muted mb-6">
            We write our terms clearly so there are no hidden surprises:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">Free Core is free forever</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                Our Free Core plan has no expiry date and requires no payment card. You get flock tracking, crop records, delivery logging, and daily diary permanently.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">Your records are 100% yours</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                You own all data you put into Wangari. If you decide to cancel, you can export your data and take it with you whenever you want.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">AI is guidance, not veterinary medicine</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                Wangari AI provides calculations and helpful farming guidance. For sick animals, vaccine dosages, or severe crop diseases, always consult a certified vet or agro-vet professional.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">Cancel paid plans anytime</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                Paid upgrades (Starter, Growth) renew monthly via Paystack with no long-term lock-in. You can cancel at any time with one tap.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Full Legal Terms */}
      <section className="section">
        <div className="max-w-4xl mx-auto space-y-10 text-wangari-text leading-relaxed">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-wangari-green-800">
              Legally Binding Agreement &middot; Last updated {lastUpdated}
            </span>
            <h2 className="text-2xl font-extrabold text-wangari-heading mt-2">
              Wangari Terms of Service
            </h2>
          </div>

          {/* 1. Acceptance */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Scale className="h-5 w-5 text-wangari-green-800" />
              1. Acceptance of Terms & Eligibility
            </h3>
            <p className="text-sm text-wangari-muted">
              These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you (&ldquo;Farmer&rdquo;, &ldquo;User&rdquo;, or &ldquo;Subscriber&rdquo;) and <strong>iMeanTech Limited</strong> (&ldquo;iMeanTech&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;), governing your access to and use of the Wangari farm management platform at <strong>wangari.imeantech.com</strong>, associated mobile applications, and WhatsApp bot services.
            </p>
            <p className="text-sm text-wangari-muted">
              By creating an account, selecting &ldquo;I agree to Terms&rdquo; upon registration, or using the platform, you represent and warrant that you are at least 18 years of age (or represent an incorporated farm business or cooperative) and have the legal capacity to enter into these Terms under the laws of Kenya.
            </p>
          </div>

          {/* 2. Platform & Account Responsibilities */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Lock className="h-5 w-5 text-wangari-green-800" />
              2. Account Security & Farm Management
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-wangari-muted">
              <li>
                <strong>Credentials:</strong> You are responsible for safeguarding your login password or phone PIN. You agree to notify us immediately at info@imeantech.com if you suspect unauthorized access.
              </li>
              <li>
                <strong>Farm Members & Workers:</strong> If you add farm workers or managers to your farm, you are responsible for the actions taken by those individuals under your farm tenant account.
              </li>
              <li>
                <strong>Accuracy:</strong> You agree to provide accurate and truthful operational details. We are not liable for calculations or reports generated from inaccurate farmer inputs.
              </li>
            </ul>
          </div>

          {/* 3. Data Ownership */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Building className="h-5 w-5 text-wangari-green-800" />
              3. Data Ownership & Intellectual Property
            </h3>
            <p className="text-sm text-wangari-muted">
              <strong>Your Farm Data:</strong> You retain complete, unencumbered ownership of all data, records, images, and financial figures that you input into Wangari (&ldquo;Customer Data&rdquo;). We do not claim ownership of your data, and we do not sell your data to third parties.
            </p>
            <p className="text-sm text-wangari-muted">
              <strong>Our Intellectual Property:</strong> The Wangari platform, software architecture, user interface design, logos, trademarks, and documentation are the exclusive intellectual property of iMeanTech Limited.
            </p>
            <p className="text-sm text-wangari-muted">
              <strong>Aggregated Benchmarks:</strong> You grant us a non-exclusive license to use anonymized, aggregated statistics (such as regional egg production averages or feed conversion benchmarks) to improve agricultural analytics, provided such data can never identify you or your specific farm.
            </p>
          </div>

          {/* 4. Subscriptions & Free Core */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-wangari-green-800" />
              4. Subscriptions, Pricing & Payments
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm text-wangari-muted">
              <li>
                <strong>Perpetual Free Core:</strong> Wangari Free Core is provided free of charge indefinitely. There is no trial expiration, and you will never be automatically charged for using Free Core.
              </li>
              <li>
                <strong>Paid Upgrades:</strong> Higher tiers (Starter at KES 950/mo, Growth at KES 2,900/mo) are billed on a recurring monthly basis through Paystack.
              </li>
              <li>
                <strong>Cancellations:</strong> You may downgrade or cancel your subscription at any time directly through the Billing portal. Upon cancellation, you retain paid access through the end of the current billing cycle, after which your account returns to Free Core with no data loss.
              </li>
              <li>
                <strong>Refunds:</strong> Payments are non-refundable for partial monthly subscription periods, except where required by Kenyan consumer protection laws.
              </li>
            </ul>
          </div>

          {/* 5. Acceptable Use Policy */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-wangari-green-800" />
              5. Acceptable Use & Kenya Cybercrimes Act Compliance
            </h3>
            <p className="text-sm text-wangari-muted">
              You agree to use Wangari in strict compliance with the <strong>Computer Misuse and Cybercrimes Act 2018 (CMCA)</strong> of Kenya. You specifically agree not to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-wangari-muted">
              <li>Attempt to bypass authentication, reverse-engineer, decompile, or access other farmers&apos; records.</li>
              <li>Deploy automated bots, spiders, or scraping tools against our endpoints.</li>
              <li>Use the platform to perpetrate financial fraud, falsify invoices, or mislead agricultural lenders.</li>
              <li>Transmit malware, viruses, or malicious payloads through the platform or WhatsApp integration.</li>
            </ul>
            <p className="text-xs text-wangari-muted">
              Violations of these provisions will result in immediate account termination and reporting to the National Computer and Cybercrimes Coordination Committee (NC4) and law enforcement authorities.
            </p>
          </div>

          {/* 6. AI & Advisory Disclaimer */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Cpu className="h-5 w-5 text-wangari-green-800" />
              6. Agricultural & AI Advisory Disclaimer
            </h3>
            <div className="rounded-xl border border-tone-warn-border bg-tone-warn-bg p-4 text-xs space-y-2 text-wangari-heading">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 text-wangari-red-500" />
                <span>Important Veterinary and Agronomic Notice</span>
              </div>
              <p>
                Wangari AI and its automated tools (including feed calculators, crop schedules, weather projections, and WhatsApp automated answers) provide agricultural information and estimation models for guidance purposes only.
              </p>
              <p>
                <strong>They do not constitute certified veterinary medical advice, professional agronomic diagnostics, or legally guaranteed financial forecasts.</strong>
              </p>
              <p>
                iMeanTech Limited does not warrant that advisory outputs are error-free. You are solely responsible for verifying critical treatment, vaccination, or chemical application decisions with a licensed veterinarian, agronomist, or relevant Kenyan authority (KEPHIS / DVS).
              </p>
            </div>
          </div>

          {/* 7. Limitation of Liability */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Scale className="h-5 w-5 text-wangari-green-800" />
              7. Limitation of Liability
            </h3>
            <p className="text-sm text-wangari-muted">
              To the fullest extent permitted under the laws of Kenya, iMeanTech Limited, its directors, employees, and partners shall not be liable for any indirect, incidental, consequential, or punitive damages, including loss of livestock, crop failure, missed profits, or data loss arising from your use of the platform.
            </p>
            <p className="text-sm text-wangari-muted">
              In any event, our total cumulative liability to you for all claims arising out of or related to these Terms or the platform shall be capped at the total amount paid by you to iMeanTech Limited in the twelve (12) months preceding the incident, or KES 5,000, whichever is greater.
            </p>
          </div>

          {/* 8. Governing Law & Dispute Resolution */}
          <div className="space-y-3 border-t border-wangari-border pt-6">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Building className="h-5 w-5 text-wangari-green-800" />
              8. Governing Law & Jurisdiction
            </h3>
            <p className="text-sm text-wangari-muted">
              These Terms of Service are governed by, construed, and enforced in accordance with the <strong>Laws of the Republic of Kenya</strong>.
            </p>
            <p className="text-sm text-wangari-muted">
              Any dispute, controversy, or claim arising out of or in connection with these Terms shall first be resolved through good-faith amicable negotiation. If unresolved after thirty (30) days, the dispute shall be submitted to the competent courts of Nairobi, Kenya.
            </p>
          </div>

          {/* 9. Contact */}
          <div className="space-y-3 border-t border-wangari-border pt-6">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-wangari-green-800" />
              9. Contact & Notices
            </h3>
            <p className="text-sm text-wangari-muted">
              For questions regarding these Terms or formal legal notices, contact:
            </p>
            <div className="p-3 bg-wangari-cream rounded-xl text-xs space-y-1 text-wangari-muted border border-wangari-border">
              <p><strong>iMeanTech Limited</strong></p>
              <p>Attn: Legal & Compliance Department</p>
              <p>Nairobi, Kenya &middot; Email: info@imeantech.com</p>
            </div>
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
