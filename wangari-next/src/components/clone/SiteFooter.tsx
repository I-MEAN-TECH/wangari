"use client";

import * as React from "react";
import { ArrowFillButton } from "./ArrowFillButton";
import { SOCIAL_ICONS } from "./icons";

const LINK_COLUMNS = [
  {
    heading: "Explore",
    links: [
      { label: "Our approach", href: "/#approach" },
      { label: "What you can do", href: "/#offerings" },
      { label: "Farmer stories", href: "/#stories-heading" },
      { label: "FAQs", href: "/#faq" },
    ],
  },
  {
    heading: "Your farm",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "The Journal", href: "/learn" },
      { label: "Contact us", href: "/contact" },
    ],
  },
  {
    heading: "Find your path",
    links: [
      { label: "All features", href: "/features" },
      { label: "Record keeping", href: "/features/production" },
      { label: "Costs & sales", href: "/features/analytics" },
      { label: "Inventory", href: "/features/inventory" },
    ],
  },
];

/** The source's four social marks, in its own order (see scripts/port-icons.mjs). */
const SOCIALS = ["Facebook", "Instagram", "X", "TikTok"];

export function SiteFooter() {
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState(false);

  return (
    <footer className="mantality-footer">
      <div className="mantality-footer-top">
        <div className="mantality-footer-newsletter">
          <h3>Practical farm records, delivered to your inbox.</h3>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              setDone(true);
            }}
          >
            <div className="mantality-footer-email">
              <input
                type="email"
                placeholder="Enter your email"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <ArrowFillButton type="submit">Subscribe</ArrowFillButton>
            </div>
            <p>
              {done
                ? "Thank you — we'll be in touch."
                : "Record keeping tips, market notes, and a little less guesswork."}
            </p>
          </form>

          <div className="mantality-footer-socials">
            {SOCIALS.map((label, i) => {
              const Mark = SOCIAL_ICONS[i];
              return (
                <span key={label} aria-label={label} role="img">
                  <Mark />
                </span>
              );
            })}
          </div>
        </div>

        <nav className="mantality-footer-links" aria-label="Footer">
          {LINK_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3>{col.heading}</h3>
              {col.links.map((l) => (
                <a key={l.label} href={l.href}>
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <a className="mantality-footer-wordmark" href="/">
        <span>wangari</span>
        <sup>®</sup>
      </a>
    </footer>
  );
}

export default SiteFooter;
