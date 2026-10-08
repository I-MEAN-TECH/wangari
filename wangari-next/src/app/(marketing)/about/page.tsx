"use client";

import * as React from "react";
import { Globe, Heart, Leaf, Shield } from "lucide-react";

import { Avatar } from "@/components/clone/Avatar";
import { CtaBand } from "@/components/clone/CtaBand";
import { PageHero } from "@/components/clone/PageHero";

/**
 * About us.
 *
 * Rebuilt on the cloned public-site design system: the same eyebrow, panel and
 * stat vocabulary as the home page, all of it reading from the tokens in
 * styles/wc-theme.css. Copy is unchanged — this page has always been the one
 * that explains why the product exists, and there was nothing wrong with what
 * it said.
 */

const VALUES = [
  { Icon: Leaf, title: "Sustainability", desc: "We believe in farming that sustains both people and the planet. Our tools help reduce waste and get more out of what a farm already has." },
  { Icon: Heart, title: "Farmer-first", desc: "Built by people who understand African farming. Every feature is designed for real conditions — slow internet, basic phones, and busy days." },
  { Icon: Globe, title: "African roots", desc: "Named after Prof. Wangari Maathai, Nobel laureate and environmental champion. We carry her belief that empowering people locally changes everything." },
  { Icon: Shield, title: "Your data is yours", desc: "Your farm records belong to you. We use the same care with them that we would expect for our own, and we never sell them on." },
];

const STATS = [
  { value: "7", label: "farm hubs, poultry to crops" },
  { value: "100%", label: "works with no data bundles" },
  { value: "KES 1,500", label: "per month, Starter plan" },
  { value: "14 days", label: "free, no card needed" },
];

const MILESTONES = [
  { year: "2026", title: "Wangari founded", desc: "iMeanTech begins building a farm management platform designed specifically for African farmers." },
  { year: "2026", title: "Platform launch", desc: "Full web platform with flock management, production tracking, inventory, finances, AI assistant, and WhatsApp integration." },
  { year: "2026", title: "Pilot program", desc: "Onboarding our first farmers across Kenya. Real-world testing with poultry, dairy, and mixed farms." },
  { year: "2027", title: "Scaling across Kenya", desc: "Targeting 1,000 active farmers through field agents, cooperative partnerships, and agro-vet networks." },
];

const TEAM = [
  {
    name: "Lewis",
    role: "Founder & CEO",
    desc: "Full-stack developer with a passion for agritech and empowering African communities.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="ABOUT WANGARI"
        title={
          <>
            Technology built for
            <br />
            African <span className="serif-word">farmers.</span>
          </>
        }
        lead="We started Wangari with one goal: make farm management simple enough for every farmer, powerful enough for any scale."
      />

      <section className="section stack-section">
        <div className="grid-2">
          <div className="panel panel-tint">
            <h3>Records that fit how a farm actually runs</h3>
            <p className="panel-body">
              Farming feeds Africa. Yet most farmers still track their flocks in notebooks, manage
              finances in their heads, and guess at feed requirements. The tools that exist are
              built for industrial farms — complex, expensive, and disconnected from the reality of
              African agriculture.
            </p>
            <p className="panel-body">
              Wangari was born from a simple observation: a farmer in Nakuru with 500 layers has the
              same needs as a farm manager with 50,000 birds — just different scales. Both need to
              track production, manage costs, and make decisions on real numbers.
            </p>
          </div>

          <div className="grid-2">
            {STATS.map((s) => (
              <div className="stat" key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section stack-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">WHAT DRIVES US</div>
            <h2>
              Four things we
              <br />
              won&apos;t <span className="serif-word">trade away.</span>
            </h2>
          </div>
        </div>

        <div className="grid-2">
          {VALUES.map((v) => (
            <div className="panel value-card" key={v.title}>
              <div className="plan-head">
                <v.Icon width={20} height={20} aria-hidden="true" />
                <h3>{v.title}</h3>
              </div>
              <p>{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section stack-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">OUR JOURNEY</div>
            <h2>
              Still at the
              <br />
              <span className="serif-word">beginning.</span>
            </h2>
          </div>
          <p>
            No inflated numbers, no invented
            <br className="desktop-break" />
            milestones. This is where we
            <br className="desktop-break" />
            actually are.
          </p>
        </div>

        <div className="timeline">
          {MILESTONES.map((m) => (
            <div className="timeline-item" key={m.year + m.title}>
              <div className="timeline-year">{m.year}</div>
              <div>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section stack-section">
        <div className="panel panel-tint tribute">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tribute-mark" src="/images/wangari-real-logo.png" alt="Wangari" />
          <h3>Named after Prof. Wangari Maathai</h3>
          <p>
            Nobel Peace Prize laureate. Environmental champion. She proved that empowering
            individuals at the grassroots level can transform an entire continent. That is exactly
            what we aim to do with technology.
          </p>
        </div>
      </section>

      <section className="section stack-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">THE PEOPLE BEHIND IT</div>
            <h2>
              Small team.
              <br />
              <span className="serif-word">Long horizon.</span>
            </h2>
          </div>
        </div>

        <div className="grid-2">
          {TEAM.map((t) => (
            <div className="panel team-card" key={t.name}>
              <Avatar name={t.name} />
              <h3>{t.name}</h3>
              <div className="team-role">{t.role}</div>
              <p>{t.desc}</p>
            </div>
          ))}

          <div className="panel team-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="team-photo" src="/images/wangari-real-logo.png" alt="" />
            <h3>The Wangari team</h3>
            <div className="team-role">Engineering & Support</div>
            <p>
              A dedicated team building tools that make farming easier to account for, and easier to
              profit from.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="COME AND SEE"
        title={
          <>
            Start with one record.
            <br />
            <span className="serif-word">See what it tells you.</span>
          </>
        }
        copy="Fourteen days free, no card required — and you can ask us anything before you start."
        ctaLabel="Start free — 14 days"
        ctaHref="/register"
        secondaryLabel="Talk to us"
        secondaryHref="/contact"
      />
    </>
  );
}
