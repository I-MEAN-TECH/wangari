"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Server,
  KeyRound,
  FileText,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  Cpu,
  Mail,
} from "lucide-react";
import { PageHero } from "@/components/clone/PageHero";
import { CtaBand } from "@/components/clone/CtaBand";

export default function SecurityPage() {
  const lastUpdated = "October 18, 2026";

  return (
    <>
      <PageHero
        eyebrow="SECURITY & TRUST"
        title={
          <>
            Bank-grade safety for
            <br />
            your farm <span className="serif-word">records.</span>
          </>
        }
        lead="How iMeanTech safeguards your agricultural data, protects against cyber threats, and complies with Kenyan cybersecurity law."
      />

      {/* Security Highlights */}
      <section className="section stack-section">
        <div className="panel panel-tint">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="h-6 w-6 text-wangari-green-800" />
            <h2 className="text-xl font-extrabold text-wangari-heading">
              Our Security Standards at a Glance
            </h2>
          </div>
          <p className="text-sm text-wangari-muted mb-6">
            We apply the same cybersecurity rigor to smallholder farm data that financial institutions apply to bank accounts.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <Lock className="h-5 w-5 text-wangari-green-800 mb-2" />
              <h3 className="text-sm font-bold text-wangari-heading">TLS 1.3 Encryption</h3>
              <p className="text-xs text-wangari-muted mt-1 leading-relaxed">
                All data transmitted between your browser or phone and our servers is encrypted in transit via modern TLS protocols.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <Server className="h-5 w-5 text-wangari-green-800 mb-2" />
              <h3 className="text-sm font-bold text-wangari-heading">Strict Isolation</h3>
              <p className="text-xs text-wangari-muted mt-1 leading-relaxed">
                Every database query filters strictly by authenticated farm ID. No farmer can ever view or touch another farm&apos;s records.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <KeyRound className="h-5 w-5 text-wangari-green-800 mb-2" />
              <h3 className="text-sm font-bold text-wangari-heading">Bcrypt Passwords</h3>
              <p className="text-xs text-wangari-muted mt-1 leading-relaxed">
                Passwords and PINs are salted and hashed with bcrypt (12 rounds). Even our system administrators cannot read your password.
              </p>
            </div>

            <div className="rounded-xl bg-white p-4 border border-wangari-border">
              <FileText className="h-5 w-5 text-wangari-green-800 mb-2" />
              <h3 className="text-sm font-bold text-wangari-heading">Immutable Audit Logs</h3>
              <p className="text-xs text-wangari-muted mt-1 leading-relaxed">
                Every sensitive update, login, and data export generates an immutable audit record for accountability and compliance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Deep-Dive Security Architecture */}
      <section className="section">
        <div className="max-w-4xl mx-auto space-y-10 text-wangari-text leading-relaxed">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-wangari-green-800">
              Cybersecurity Infrastructure &middot; Last updated {lastUpdated}
            </span>
            <h2 className="text-2xl font-extrabold text-wangari-heading mt-2">
              Architecture & Data Protection Controls
            </h2>
          </div>

          {/* Layer 1: Data Encryption */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Lock className="h-5 w-5 text-wangari-green-800" />
              1. Encryption & Cryptographic Safeguards
            </h3>
            <p className="text-sm text-wangari-muted">
              We employ defense-in-depth cryptographic controls across every tier of the application:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-wangari-muted">
              <li>
                <strong>Data in Transit:</strong> Enforced HTTPS using TLS 1.2 and TLS 1.3 with automated certificate renewal and HSTS headers.
              </li>
              <li>
                <strong>Data at Rest:</strong> Database storage volumes on our cloud VPS host are encrypted with AES-256 disk encryption.
              </li>
              <li>
                <strong>Credential Hashing:</strong> Passwords are protected using salted bcrypt with cost factor 12. Phone-only accounts use irreversible HMAC-SHA256 digests.
              </li>
              <li>
                <strong>Token Revocation:</strong> Sessions utilize JSON Web Tokens embedded with a rotating <code>tokenVersion</code>. Changing your password immediately revokes all existing sessions across all phones and computers.
              </li>
            </ul>
          </div>

          {/* Layer 2: Multi-Tenant Isolation */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Server className="h-5 w-5 text-wangari-green-800" />
              2. Multi-Tenant Farm Data Isolation
            </h3>
            <p className="text-sm text-wangari-muted">
              Wangari operates a multi-tenant SaaS architecture with strict row-level isolation guarantees:
            </p>
            <div className="p-4 bg-wangari-cream rounded-xl text-xs space-y-2 text-wangari-muted border border-wangari-border font-mono">
              <p className="font-bold text-wangari-heading font-sans">Enforced Query Policy:</p>
              <p>Every read, write, update, or delete query in the API is scoped to the authenticated user&apos;s <code>farmId</code>. Direct object reference vulnerabilities (IDOR) are prevented by automated architectural rules.</p>
            </div>
            <p className="text-sm text-wangari-muted">
              Role-Based Access Control (RBAC) separates Farm Owners, Farm Managers, and Farm Workers, ensuring workers with PINs only access authorized modules.
            </p>
          </div>

          {/* Layer 3: Network & Edge Security */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-wangari-green-800" />
              3. Network Defenses & Kenyan Cybercrimes Act Compliance
            </h3>
            <p className="text-sm text-wangari-muted">
              In accordance with the <strong>Computer Misuse and Cybercrimes Act 2018 (CMCA)</strong>, our infrastructure implements continuous threat mitigation:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-wangari-muted">
              <li>
                <strong>Rate Limiting & Brute-Force Prevention:</strong> Express and Nginx rate-limiters prevent credential-stuffing attacks on login and registration endpoints.
              </li>
              <li>
                <strong>Web Application Firewall (WAF) & Headers:</strong> Helmet middleware enforces Content Security Policy (CSP), anti-clickjacking <code>X-Frame-Options</code>, and Cross-Site Scripting (XSS) filters.
              </li>
              <li>
                <strong>SQL Injection Protection:</strong> All database queries are executed via parameterized Prisma ORM operations, preventing arbitrary SQL execution.
              </li>
            </ul>
          </div>

          {/* Layer 4: Incident Response */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-wangari-green-800" />
              4. Incident Response & 72-Hour Breach Protocol
            </h3>
            <p className="text-sm text-wangari-muted">
              iMeanTech maintains a structured Data Breach Incident Response Plan. In the event of a security compromise involving personal data:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-wangari-border bg-white space-y-1">
                <p className="font-bold text-wangari-heading">1. Containment (&lt; 1 hour)</p>
                <p className="text-wangari-muted">Immediate session revocation, secret rotation, and traffic firewall containment.</p>
              </div>
              <div className="p-3 rounded-xl border border-wangari-border bg-white space-y-1">
                <p className="font-bold text-wangari-heading">2. Assessment (&lt; 6 hours)</p>
                <p className="text-wangari-muted">Forensic inspection of immutable audit logs to determine precise records affected.</p>
              </div>
              <div className="p-3 rounded-xl border border-wangari-border bg-white space-y-1">
                <p className="font-bold text-wangari-heading">3. Notification (&lt; 72 hours)</p>
                <p className="text-wangari-muted">Formal notification to the Office of the Data Protection Commissioner (ODPC) and affected users.</p>
              </div>
            </div>
          </div>

          {/* Layer 5: Responsible Disclosure */}
          <div className="space-y-3 border-t border-wangari-border pt-6">
            <h3 className="text-lg font-bold text-wangari-heading flex items-center gap-2">
              <Mail className="h-5 w-5 text-wangari-green-800" />
              5. Responsible Vulnerability Disclosure
            </h3>
            <p className="text-sm text-wangari-muted">
              We welcome reports from independent security researchers and developers. If you believe you have discovered a vulnerability in Wangari, please report it responsibly:
            </p>
            <div className="p-3 bg-white rounded-xl text-xs space-y-1 text-wangari-muted border border-wangari-border">
              <p><strong>Security Email:</strong> info@imeantech.com &middot; Subject: <code>SECURITY VULNERABILITY REPORT</code></p>
              <p>Please include steps to reproduce, impacted endpoints, and allow reasonable time for remediation before public disclosure.</p>
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
