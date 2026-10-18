"use client";

import * as React from "react";
import Link from "next/link";
import {
  Shield,
  Lock,
  FileText,
  UserCheck,
  Download,
  Trash2,
  Mail,
  AlertCircle,
  Server,
  Building,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { PageHero } from "@/components/clone/PageHero";
import { CtaBand } from "@/components/clone/CtaBand";

export default function PrivacyPolicyPage() {
  const lastUpdated = "October 18, 2026";

  return (
    <>
      <PageHero
        eyebrow="LEGAL & TRANSPARENCY"
        title={
          <>
            Your data is yours.
            <br />
            Plain <span className="serif-word">transparency.</span>
          </>
        }
        lead="How iMeanTech Limited protects your personal and farm data under the Kenya Data Protection Act 2019 (KDPA)."
      />

      {/* Quick Summary Section for Farmers (Low-Literacy Friendly) */}
      <section className="section stack-section">
        <div className="panel panel-tint">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-6 w-6 text-wangari-green-800" />
            <h2 className="text-xl font-extrabold text-wangari-heading">
              Summary for Farmers (Muhtasari wa Faragha)
            </h2>
          </div>
          <p className="text-sm text-wangari-muted mb-6">
            We believe you should not need a law degree to understand how your farm information is handled.
            Here are the 5 core commitments we make to every farmer:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">1. You own your data</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                Your livestock records, harvest numbers, and cash flow belong entirely to you. We do not sell your farm data to brokers, seed companies, or advertisers.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">2. We never see your card or PIN</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                Payments are processed through Paystack (licensed by the Central Bank of Kenya). We never store your ATM card details or M-Pesa PIN.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">3. Download your data anytime</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                Under the Kenya Data Protection Act, you have the right to export a complete copy of all your records in Settings whenever applying for a farm loan or cooperative grant.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-wangari-green-700" />
                <h3 className="text-sm font-bold text-wangari-heading">4. Right to delete your account</h3>
              </div>
              <p className="text-xs text-wangari-muted leading-relaxed">
                If you ever decide to leave, you can request account deletion in Settings. Your personal credentials will be wiped after a 90-day safety grace period.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comprehensive Legal Notice */}
      <section className="section">
        <div className="max-w-4xl mx-auto space-y-10 text-wangari-text leading-relaxed">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-wangari-green-800">
              Official Privacy Notice &middot; Last updated {lastUpdated}
            </span>
            <h2 className="text-2xl font-extrabold text-wangari-heading mt-2">
              Kenya Data Protection Act (KDPA) Privacy Policy
            </h2>
          </div>

          {/* Section 1: Data Controller */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Building className="h-5 w-5 text-wangari-green-800" />
              1. Data Controller Identification
            </h3>
            <p className="text-sm text-wangari-muted">
              Wangari (available at <strong>wangari.imeantech.com</strong>) is designed and operated by <strong>iMeanTech Limited</strong>, a company registered in the Republic of Kenya. For the purposes of the Kenya Data Protection Act 2019 (the &ldquo;KDPA&rdquo;), iMeanTech Limited acts as the <strong>Data Controller</strong> for all personal data collected through the Wangari web application, mobile interfaces, and messaging integrations.
            </p>
            <div className="p-3 bg-wangari-cream rounded-xl text-xs space-y-1 text-wangari-muted border border-wangari-border">
              <p><strong>Entity Name:</strong> iMeanTech Limited</p>
              <p><strong>Physical Address:</strong> Nairobi, Kenya</p>
              <p><strong>Data Protection Contact:</strong> info@imeantech.com</p>
              <p><strong>Regulatory Authority:</strong> Office of the Data Protection Commissioner (ODPC), Kenya</p>
            </div>
          </div>

          {/* Section 2: What Data We Collect */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <FileText className="h-5 w-5 text-wangari-green-800" />
              2. Categories of Personal Data Collected
            </h3>
            <p className="text-sm text-wangari-muted">
              We collect only the minimum information necessary to provide you with farm management, reporting, and agricultural advisory services:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-wangari-muted">
              <li>
                <strong>Account & Identity Data:</strong> Your name, phone number, email address, password (stored solely in salted bcrypt hash form), and optional farm connection codes.
              </li>
              <li>
                <strong>Farm Operations Data:</strong> Livestock flock counts, egg and milk production logs, crop plantings and harvest yields, feed and medication inventory, customer delivery addresses, and worker attendance.
              </li>
              <li>
                <strong>Financial Records:</strong> Transaction amounts, invoices, customer receivables, feed purchase costs, and payment confirmation references.
              </li>
              <li>
                <strong>Billing & Payment Data:</strong> Subscription statuses, plan selections, and transaction references returned by our licensed payment gateway (Paystack). <em>We never store credit/debit card numbers or M-Pesa PINs.</em>
              </li>
              <li>
                <strong>Technical & Security Data:</strong> IP addresses, browser types, timestamps, and audit trails logged in our secure database for fraud detection and system security under the Computer Misuse and Cybercrimes Act 2018.
              </li>
            </ul>
          </div>

          {/* Section 3: Lawful Basis */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-wangari-green-800" />
              3. Lawful Basis for Processing (KDPA Section 30)
            </h3>
            <p className="text-sm text-wangari-muted">
              In accordance with Section 30 of the Kenya Data Protection Act 2019, we process personal data under the following lawful grounds:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-wangari-border bg-white space-y-1">
                <p className="font-bold text-wangari-heading">Performance of Contract</p>
                <p className="text-wangari-muted">To create your account, calculate feed requirements, synchronize offline records, and power your farm dashboard.</p>
              </div>
              <div className="p-3 rounded-xl border border-wangari-border bg-white space-y-1">
                <p className="font-bold text-wangari-heading">Legal Obligations</p>
                <p className="text-wangari-muted">To retain commercial transactions and invoices for 7 years as mandated by the Kenya Income Tax Act and KRA audit regulations.</p>
              </div>
              <div className="p-3 rounded-xl border border-wangari-border bg-white space-y-1">
                <p className="font-bold text-wangari-heading">Legitimate Interests</p>
                <p className="text-wangari-muted">To safeguard the platform against unauthorized access, brute force attacks, and system abuse (Computer Misuse and Cybercrimes Act 2018).</p>
              </div>
            </div>
          </div>

          {/* Section 4: Sub-Processors & Third Parties */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Server className="h-5 w-5 text-wangari-green-800" />
              4. Authorised Third-Party Sub-Processors
            </h3>
            <p className="text-sm text-wangari-muted">
              We never sell or rent your personal information to third parties. We engage only reputable, contractually bound sub-processors that maintain robust security standards:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse border border-wangari-border">
                <thead className="bg-wangari-cream font-bold text-wangari-heading">
                  <tr>
                    <th className="p-2.5 border border-wangari-border">Sub-Processor</th>
                    <th className="p-2.5 border border-wangari-border">Purpose</th>
                    <th className="p-2.5 border border-wangari-border">Compliance / Security Standard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-wangari-border text-wangari-muted">
                  <tr>
                    <td className="p-2.5 border border-wangari-border font-semibold">Paystack (Stripe)</td>
                    <td className="p-2.5 border border-wangari-border">Payment processing & recurring billing</td>
                    <td className="p-2.5 border border-wangari-border">PCI-DSS Level 1 certified; licensed by CBK</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 border border-wangari-border font-semibold">Cloud Infrastructure (IBM Cloud VPS)</td>
                    <td className="p-2.5 border border-wangari-border">Application hosting & encrypted PostgreSQL database</td>
                    <td className="p-2.5 border border-wangari-border">ISO 27001, SOC 2 Type II, encrypted at rest</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 border border-wangari-border font-semibold">Google Gemini / AI Models</td>
                    <td className="p-2.5 border border-wangari-border">Agronomic and farming advisory assistant</td>
                    <td className="p-2.5 border border-wangari-border">Encrypted queries; no customer data used for model training</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 border border-wangari-border font-semibold">Meta WhatsApp Business API</td>
                    <td className="p-2.5 border border-wangari-border">Farmer messaging bot and delivery alerts</td>
                    <td className="p-2.5 border border-wangari-border">End-to-end transport encryption; opt-in only</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 border border-wangari-border font-semibold">Open-Meteo</td>
                    <td className="p-2.5 border border-wangari-border">Weather forecasting</td>
                    <td className="p-2.5 border border-wangari-border">Zero personal data transmitted; coordinates only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Data Retention & Erasure */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-wangari-green-800" />
              5. Data Retention & Account Deletion Policy
            </h3>
            <p className="text-sm text-wangari-muted">
              We retain personal data only for as long as necessary to fulfill the operational purposes for which it was gathered:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-wangari-muted">
              <li>
                <strong>Active Accounts:</strong> Maintained for the duration of your registration.
              </li>
              <li>
                <strong>Account Deletion Requests:</strong> When you request account deletion in Settings, your account is immediately deactivated and placed into a 90-day grace period. After 90 days, your personal profile details (name, phone, email) are permanently scrubbed.
              </li>
              <li>
                <strong>Tax & Statutory Financial Records:</strong> Pursuant to the Kenya Income Tax Act, transaction journals and invoice summaries are archived in anonymized format for seven (7) years to satisfy statutory audit mandates.
              </li>
              <li>
                <strong>System Security Logs:</strong> Security audit logs are maintained on a 12-month rolling retention schedule and then purged.
              </li>
            </ul>
          </div>

          {/* Section 6: Data Subject Rights */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Download className="h-5 w-5 text-wangari-green-800" />
              6. Your Statutory Rights Under the KDPA
            </h3>
            <p className="text-sm text-wangari-muted">
              Under Sections 26 through 40 of the Kenya Data Protection Act 2019, you hold fundamental rights regarding your data:
            </p>
            <div className="space-y-2 text-sm text-wangari-muted">
              <p>
                <strong>Right to Access:</strong> You can request a summary of all personal information we hold about you.
              </p>
              <p>
                <strong>Right to Data Portability (Section 38):</strong> You can export your full farm records, inventory, and transaction logs in structured JSON format at any time directly in Settings &rarr; Data.
              </p>
              <p>
                <strong>Right to Rectification:</strong> You can edit your farm name, contact details, and location directly in your profile settings.
              </p>
              <p>
                <strong>Right to Erasure (Section 40):</strong> You can schedule your account and personal identifiers for permanent erasure via Settings &rarr; Danger Zone.
              </p>
              <p>
                <strong>Right to Object & Opt-Out:</strong> You can opt out of promotional communications at any time. For WhatsApp communications, texting &ldquo;STOP&rdquo; immediately pauses all automated messages.
              </p>
            </div>
          </div>

          {/* Section 7: Security & Breach Protocol */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Lock className="h-5 w-5 text-wangari-green-800" />
              7. Security Measures & 72-Hour Breach Notification
            </h3>
            <p className="text-sm text-wangari-muted">
              Wangari enforces comprehensive technical safeguards including TLS 1.3 encryption for data in transit, strict multi-tenant tenant isolation (`farmId` query boundary), salted password hashing, two-factor authentication (TOTP), and automated IP rate-limiting.
            </p>
            <p className="text-sm text-wangari-muted">
              In the unlikely event of a security incident that impacts personal data, iMeanTech maintains a formal Incident Response Plan and will notify affected data subjects and the Office of the Data Protection Commissioner (ODPC) within seventy-two (72) hours of confirmed discovery, in accordance with Section 43 of the KDPA.
            </p>
          </div>

          {/* Section 8: ODPC & Contact */}
          <div className="space-y-3 border-t border-wangari-border pt-6">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-wangari-green-800" />
              8. Inquiries & Regulatory Complaints
            </h3>
            <p className="text-sm text-wangari-muted">
              If you have any questions or wish to exercise your rights under the Kenya Data Protection Act, contact our team directly:
            </p>
            <p className="text-sm font-semibold text-wangari-green-800">
              Email: info@imeantech.com &middot; Subject: Data Protection Request
            </p>
            <p className="text-xs text-wangari-muted">
              If you feel your privacy concerns have not been addressed adequately, you have the statutory right to lodge a formal complaint with the regulatory authority:
            </p>
            <div className="p-3 bg-white rounded-xl text-xs space-y-1 text-wangari-muted border border-wangari-border">
              <p><strong>Office of the Data Protection Commissioner (ODPC)</strong></p>
              <p>Britam Tower, 13th Floor, Hospital Road, Upper Hill, Nairobi</p>
              <p>Website: <a href="https://dataportal.odpc.go.ke" target="_blank" rel="noopener noreferrer" className="text-wangari-green-800 underline">dataportal.odpc.go.ke</a></p>
              <p>Email: complaints@odpc.go.ke</p>
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
