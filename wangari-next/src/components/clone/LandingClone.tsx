"use client";

import * as React from "react";
import { BookOpen, HeartHandshake, UsersRound } from "lucide-react";

import { ArrowFillButton } from "./ArrowFillButton";
import { Avatar } from "./Avatar";
import { FaqAccordion } from "./FaqAccordion";
import { ProgramCard } from "./ProgramCard";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BADGE_ICONS,
  CityPinIcon,
  OrbitRings,
  ProgramIcon1,
  ProgramIcon3,
  ProofBadgeAltIcon,
  ProofBadgeIcon,
  QuoteIcon,
  VerifiedCheckIcon,
} from "./icons";

/* ──────────────────────────────── content ─────────────────────────────── */

const HERO = {
  cta: "See what Wangari does",
  intro: "Record keeping, costs and profit — in your pocket. Even with no bundles at all.",
  lineOne: "Every harvest.",
  lineTwo: "Every shilling.",
};

const PROOF = { title: "Built with farmers.", count: "2,400+", copy: "farmers keep their records on Wangari." };

const ABOUT_STATS = [
  { label: "Offline", value: "0", copy: "bundles needed to log a day" },
  { label: "Daily logging", value: "3 taps", copy: "to record a day's output" },
  { label: "Getting started", value: "14 days", copy: "free, no card required" },
];

const RIBBON_WORDS = ["POULTRY", "DAIRY", "GOATS", "CROPS", "FEED", "SALES", "PROFIT", "TEAM"];

const PROGRAMS = [
  {
    tone: "lavender" as const,
    eyebrow: "RECORD KEEPING",
    title: "Log a day in 3 taps.",
    body: "Eggs, milk, feed, drugs, sales. Type it once on your phone and it's saved — even with no bundles.",
    label: "See record keeping",
    href: "/features/production",
  },
  {
    tone: "yellow" as const,
    eyebrow: "MONEY IN & OUT",
    title: "Know what you actually earn.",
    body: "Every shilling in and out, per flock and per plot. Stop guessing your profit at the end of the month.",
    label: "See costs & sales",
    href: "/features/analytics",
  },
  {
    tone: "sage" as const,
    eyebrow: "FEED & STOCK",
    title: "Never run out mid-cycle.",
    body: "Track every bag of feed and every dose of vaccine. Get warned before you run low, not after.",
    label: "See inventory",
    href: "/features/inventory",
  },
  {
    tone: "peach" as const,
    eyebrow: "TEAM & WORKERS",
    title: "Everyone on the same page.",
    body: "Add workers, assign tasks, track attendance and wages — so the records match what happened on the ground.",
    label: "See team & workers",
    href: "/features/team",
  },
];

const APPROACH_BADGES = [
  { plain: "Record sales and output", strong: "with zero internet" },
  { plain: "Everything saved", strong: "on your own phone" },
  { plain: "Auto-syncs", strong: "when signal returns" },
  { plain: "Installs like an app", strong: "no Play Store needed" },
];

const ARTICLES = [
  {
    image: "/images/maathai%201.jpeg",
    category: "Poultry records",
    date: "September 10, 2026",
    title: "5 records that tell you if your layers are making money",
    href: "/learn",
  },
  {
    image: "/images/maathai%202.jpeg",
    category: "Money",
    date: "September 10, 2026",
    title: "How to price a tray of eggs without losing money",
    href: "/learn",
  },
];

const STORIES = [
  { city: "Njoro", quote: "I stopped guessing what feed was costing me. It's on the phone now, and I check it before I buy.", name: "Wanjiru M." },
  { city: "Nakuru", quote: "The first month showed me my layers were making money. The second showed me which ones weren't.", name: "Peter K." },
  { city: "Eldoret", quote: "No bundles in the shamba. I record everything and it syncs by itself when I get to town.", name: "Brian O." },
  { city: "Kiambu", quote: "I used to write on a calendar. Now the app adds it up and tells me the profit.", name: "Grace W." },
  { city: "Meru", quote: "Knowing the real cost of a tray changed how I price. I'm not working for free anymore.", name: "Samuel N." },
  { city: "Kakamega", quote: "My worker records the eggs and I see it the same evening. No more arguments.", name: "Alice C." },
];

const FAQS = [
  {
    q: "Does Wangari work without internet?",
    a: "Yes. Every record is saved on your phone first. When you get signal, Wangari syncs by itself — nothing is lost and nothing is counted twice.",
  },
  {
    q: "Do I need to be good with phones?",
    a: "No. If you can send a text message, you can use Wangari. Most farmers record a full day in three taps.",
  },
  {
    q: "What does it cost?",
    a: "Starter is KES 1,500 a month, and the first 14 days are free — no card, no commitment.",
  },
  {
    q: "Can I keep records for more than one flock?",
    a: "Yes. Keep as many flocks, herds, plots or ponds as you run, and compare them side by side.",
  },
];

const ORBIT_STATS = [
  { Icon: UsersRound, value: "2,400+", label: "farmers keeping records" },
  { Icon: HeartHandshake, value: "100%", label: "works with no bundles" },
  { Icon: BookOpen, value: "14 days", label: "free trial, no card" },
];

/**
 * The six-card testimonial fan. `bg` picks a tint token, `tone` picks which of
 * the two ink treatments goes with it, and `rotation` is the source's own fan
 * angle — kept as numbers because a rotation is geometry, not a colour.
 */
const STACK_CARDS = [
  { bg: 1, tone: "light", rotation: -8 },
  { bg: 2, tone: "light", rotation: 5 },
  { bg: 3, tone: "deep", rotation: -3 },
  { bg: 4, tone: "deep", rotation: 6 },
  { bg: 5, tone: "light", rotation: -8 },
  { bg: 6, tone: "light", rotation: 5 },
];

/* ──────────────────────────────── sections ─────────────────────────────── */

function Hero() {
  return (
    <section className="hero reference-hero">
      <div className="hero-visual">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-photo" src="/images/maathai.jpeg" alt="A Kenyan farm at first light" />
        <div className="photo-shade" />
      </div>

      <div className="hero-copy">
        <ArrowFillButton href="#offerings" className="button primary" circle={36}>
          {HERO.cta}
        </ArrowFillButton>
        <p>{HERO.intro}</p>
        <h1 suppressHydrationWarning>
          {HERO.lineOne}
          <br />
          {HERO.lineTwo}
        </h1>
      </div>
    </section>
  );
}

function CommunityProof({
  offset = 0,
  Icon = ProofBadgeIcon,
}: {
  offset?: number;
  Icon?: typeof ProofBadgeIcon;
}) {
  const faces = STORIES.slice(offset, offset + 4);
  return (
    <div className="community-proof">
      <div className="community-proof-avatars">
        {faces.map((s) => (
          <Avatar key={s.name} name={s.name} />
        ))}
      </div>
      <div className="community-proof-copy">
        <span className="community-proof-title">
          <Icon />
          {PROOF.title}
        </span>
        <p>
          <strong>{PROOF.count}</strong>
          {PROOF.copy}
        </p>
      </div>
    </div>
  );
}

function About() {
  return (
    <section className="about section">
      <div className="about-heading">
        <div className="eyebrow">ABOUT WANGARI</div>
        <h2>
          A farm you can
          <br />
          see <span className="serif-word">clearly.</span>
        </h2>
        <CommunityProof />
      </div>

      <div className="about-content">
        <p className="about-lead">
          Your farm is more than guesswork, memory, and a notebook you can&apos;t find.
        </p>
        <p>
          Wangari is record keeping built for Kenyan farms — poultry, dairy, goats and crops. Log
          output, feed, drugs, expenses and sales in seconds, and see what each flock or plot
          actually earns.
        </p>
        <p>
          Start where you are. Record only what you can keep up with. Let the numbers build until
          they start telling you what to do next.
        </p>

        <dl className="about-stats">
          {ABOUT_STATS.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                <strong>{s.value}</strong>
                <span>{s.copy}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Ribbon() {
  const items = Array.from({ length: 4 }, (_, i) => (
    <span className="infinite-ribbon-item" key={i}>
      {RIBBON_WORDS.map((w) => (
        <React.Fragment key={w}>
          <span>{w}</span>
          <span className="ribbon-star">✳</span>
        </React.Fragment>
      ))}
    </span>
  ));

  return (
    <div className="about-ribbons">
      <div className="infinite-ribbon ribbon-indigo">
        <span className="ribbon-accessible">
          {RIBBON_WORDS.map((w) => (
            <React.Fragment key={w}>
              <span>{w}</span>
              <span className="ribbon-star">✳</span>
            </React.Fragment>
          ))}
        </span>
        <div className="infinite-ribbon-track">{items}</div>
      </div>
    </div>
  );
}

function Offerings() {
  return (
    <section className="offerings section" id="offerings">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WHAT YOU CAN DO</div>
          <h2>
            Different records.
            <br />
            The same <span className="serif-word">place.</span>
          </h2>
        </div>
        <p>
          There&apos;s no one way to farm. Keep the records that
          <br className="desktop-break" />
          matter to you — and let Wangari do the
          <br className="desktop-break" />
          adding up.
        </p>
      </div>

      <div className="program-grid">
        {PROGRAMS.map((p, i) => (
          <ProgramCard key={p.eyebrow} index={i} {...p} />
        ))}
      </div>
    </section>
  );
}

function Approach() {
  return (
    <section className="approach section approach-centered" id="approach">
      <div className="approach-heading">
        <div className="eyebrow">BUILT FOR THE SHAMBA</div>
        <h2>
          No bundles?
          <br />
          No <span className="serif-word">problem.</span>
        </h2>
      </div>

      <div className="approach-image-stage">
        <div className="approach-portrait">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/maathai%203.jpeg" alt="A farmer walking a maize field" />
        </div>

        {APPROACH_BADGES.map((b, i) => {
          const Icon = BADGE_ICONS[i];
          return (
            <div className={`approach-badge approach-badge-${["left-top", "left-bottom", "right-top", "right-bottom"][i]}`} key={b.plain}>
              <Icon width={24} height={24} aria-hidden="true" />
              <span>
                {b.plain} <strong>{b.strong}</strong>
              </span>
            </div>
          );
        })}

        <div className="approach-description">
          <p>
            Somewhere along the way, farm records became a notebook you can&apos;t find, a memory you
            can&apos;t trust, and a number you guess at the end of the month.
          </p>
          <p>
            We think there&apos;s another way. One where knowing your numbers is normal. Where a farmer
            can say what a tray of eggs cost to produce — and be right.
          </p>
        </div>
      </div>
    </section>
  );
}

function Community() {
  return (
    <section className="community section">
      <div className="community-spiral" aria-hidden="true" />
      <div className="community-shade" />
      <div className="community-content">
        <h2>
          Your records are
          <br />
          <span className="serif-word">your farm&apos;s memory.</span> Keep them here.
        </h2>

        <div className="community-bottom">
          <p>
            You can&apos;t remember what you paid for feed last month. You shouldn&apos;t have to.
            <br />
            Wangari keeps the numbers so you decide
            <br />
            with real figures, not feelings.
          </p>
          <ArrowFillButton href="/register" className="button primary">
            Start free — 14 days
          </ArrowFillButton>
        </div>
      </div>
    </section>
  );
}

function Journal() {
  return (
    <section className="blog section">
      <div className="blog-intro">
        <div className="eyebrow">THE WANGARI JOURNAL</div>
        <h2>
          A little know-how.
          <br />
          <span className="serif-word">A better margin.</span>
        </h2>
        <p>
          Practical reads on poultry, dairy and crop record keeping — short, plain, and useful the
          same day you read them.
        </p>
        <ArrowFillButton href="/learn" className="button primary">
          All articles
        </ArrowFillButton>
      </div>

      {ARTICLES.map((a) => (
        <article className="article-card" key={a.title}>
          <div className="article-card-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.image} alt="" />
            <span className="article-category">{a.category}</span>
          </div>
          <div className="article-card-copy">
            <p className="article-date">
              Published on <time>{a.date}</time>
            </p>
            <h3>
              <a href={a.href}>{a.title}</a>
            </h3>
            <a className="article-read-more" href={a.href}>
              Read More
              <ArrowRightIcon aria-hidden="true" />
            </a>
          </div>
        </article>
      ))}
    </section>
  );
}

function Stories() {
  return (
    <section className="social-proof section" id="stories-heading">
      <div className="eyebrow">REAL FARMS. REAL NUMBERS.</div>
      <h2>
        Different farms.
        <br />
        <span className="serif-word">A shared way forward.</span>
      </h2>
      <p className="stories-intro">More clarity. Fewer surprises. Better decisions.</p>

      <div className="hover-stack" style={{ ["--card-count" as string]: 6 }}>
        {STORIES.map((s, i) => {
          const card = STACK_CARDS[i];
          return (
            <article
              className={`hover-stack-card stack-tone-${card.tone} stack-bg-${card.bg}`}
              key={s.name}
              tabIndex={0}
              aria-label={`${s.city}: ${s.name}`}
              style={{
                ["--card-index" as string]: i,
                ["--card-rotation" as string]: `${card.rotation}deg`,
              }}
            >
              <div className="stack-card-top">
                <span className="testimonial-quote-icon">
                  <QuoteIcon />
                </span>
                <span className="stack-card-city">
                  <CityPinIcon />
                  {s.city}
                </span>
              </div>

              <blockquote>“{s.quote}”</blockquote>

              <div className="stack-card-footer">
                <span className="stack-card-author">
                  <span className="stack-card-avatar">
                    <Avatar name={s.name} />
                    <span className="spotlight-avatar-check">
                      <VerifiedCheckIcon />
                    </span>
                  </span>
                  <span>{s.name}</span>
                </span>
                <span className="stack-card-number">
                  {String(i + 1).padStart(2, "0")}
                  <ArrowUpRightIcon width={17} height={17} aria-hidden="true" />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <CommunityProof offset={2} Icon={ProofBadgeAltIcon} />
    </section>
  );
}

function Faq() {
  return (
    <FaqAccordion
      id="faq"
      eyebrow="A LITTLE MORE CLARITY"
      title={
        <>
          Good questions.
          <br />
          <span className="serif-word">Straight answers.</span>
        </>
      }
      items={FAQS}
    />
  );
}

function FinalCta() {
  /* Faces fill slots 1, 3, 4, 5 and 7; 2 and 6 hold a mark instead. The badge
     ring is the mirror of that: badges 2 and 5 show a face, the rest a mark. */
  const avatarSlots = [1, 3, 4, 5, 7];

  /* Held as plain consts: JSX cannot take a literal element-access as a tag
     (`<BADGE_ICONS[1] />` is a syntax error), and inventing one-off aliases
     inside the map would lose the readonly narrowing below. */
  const SlotMark2 = BADGE_ICONS[1];
  const SlotMark6 = ProgramIcon1;
  const BadgeMark1 = BADGE_ICONS[0];
  const BadgeMark3 = BADGE_ICONS[2];
  const BadgeMark4 = BADGE_ICONS[3];
  const BadgeMark6 = ProgramIcon3;

  const badges = [
    { pos: 1, tone: "lavender", Mark: BadgeMark1 },
    { pos: 2, tone: "yellow", avatar: STORIES[1] },
    { pos: 3, tone: "sage", Mark: BadgeMark3 },
    { pos: 4, tone: "peach", Mark: BadgeMark4 },
    { pos: 5, tone: "lavender", avatar: STORIES[4] },
    { pos: 6, tone: "yellow", Mark: BadgeMark6 },
  ] as const;

  return (
    <section className="final-cta final-cta-orbit final-cta-with-footer">
      <div className="mantality-orbit-cta">
        <div className="mantality-orbit-visual">
          <OrbitRings />

          {avatarSlots.map((slot, i) => (
            <div className={`mantality-orbit-avatar mantality-orbit-avatar-${slot}`} key={slot}>
              <Avatar name={STORIES[i].name} />
            </div>
          ))}

          {/* Slots 2 and 6 are marks rather than faces in the source layout. */}
          <div className="mantality-orbit-avatar mantality-orbit-avatar-2 mantality-orbit-swapped-icon mantality-orbit-badge-yellow">
            <SlotMark2 width={24} height={24} aria-hidden="true" />
          </div>
          <div className="mantality-orbit-avatar mantality-orbit-avatar-6 mantality-orbit-swapped-icon mantality-orbit-badge-lavender">
            <SlotMark6 width={26} height={26} aria-hidden="true" />
          </div>

          <div className="mantality-orbit-badge-layer">
            {badges.map((b) => (
              <div
                className={`mantality-orbit-badge mantality-orbit-badge-${b.pos} mantality-orbit-badge-${b.tone}${
                  "avatar" in b ? " mantality-orbit-swapped-avatar" : ""
                }`}
                key={b.pos}
              >
                <span>
                  {"avatar" in b ? <Avatar name={b.avatar.name} /> : <b.Mark width={24} height={24} aria-hidden="true" />}
                </span>
              </div>
            ))}
          </div>

          <div className="mantality-orbit-stats">
            {ORBIT_STATS.map(({ Icon, value, label }) => (
              <span key={label}>
                <Icon width={15} height={15} strokeWidth={1.5} aria-hidden="true" />
                <strong>{value}</strong>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="mantality-orbit-copy">
          <h2>Take the first step</h2>
          <p>
            Start with one record, one flock, one honest number. See what you learn in a month.
          </p>
          <ArrowFillButton href="/register" className="button primary">
            Start free — 14 days
          </ArrowFillButton>
        </div>
      </div>

      {/* The footer sits inside the rounded closing block on this layout. */}
      <SiteFooter />
    </section>
  );
}

/* ──────────────────────────────── page ──────────────────────────────── */

export function LandingClone() {
  return (
    <div className="wc">
      <SiteHeader />
      <main>
        <Hero />
        <About />
        <Ribbon />
        <Offerings />
        <Approach />
        <Community />
        <Journal />
        <Stories />
        <Faq />
        <FinalCta />
      </main>
    </div>
  );
}

export default LandingClone;
