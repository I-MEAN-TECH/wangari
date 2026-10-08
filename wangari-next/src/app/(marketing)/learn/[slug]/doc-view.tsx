"use client";

import * as React from "react";

import { ArrowFillButton } from "@/components/clone/ArrowFillButton";
import { PageHero } from "@/components/clone/PageHero";
import { DocReader } from "@/components/learn/DocReader";
import { isLoggedIn } from "@/lib/auth-client";
import type { LearnDoc } from "@/lib/learn-library";

/**
 * Public document gate — the membership play.
 *
 * Visitors: the first two chapters, then a locked panel. Logged-in users: the
 * full document. Rebuilt on the public site's design system so a reader who
 * arrived from the home page never sees the page change character mid-scroll.
 *
 * The gate itself is unchanged: same FREE_SECTIONS count, same teaser
 * behaviour, same hand-off to the dashboard reader for members.
 */

const FREE_SECTIONS = 2;

export function PublicDocGate({ doc }: { doc: LearnDoc }) {
  const [member, setMember] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setMember(isLoggedIn());
  }, []);

  if (member === null) {
    // Avoid a flash: render nothing meaningful while the auth check resolves.
    return <div style={{ minHeight: "60vh" }} />;
  }

  if (member) {
    // Full document — but keep navigation inside the dashboard library.
    return <DocReader doc={doc} context="dashboard" />;
  }

  const chapters = doc.sections.slice(0, FREE_SECTIONS);

  return (
    <>
      <PageHero
        eyebrow="WANGARI LEARN CENTER — FREE PREVIEW"
        title={
          <>
            <span aria-hidden="true">{doc.emoji}</span> {doc.title}
          </>
        }
        lead={doc.summary}
      />

      <section className="section stack-section">
        <div className="doc-reader">
          {chapters.map((section, i) => (
            <div key={section.heading}>
              <h2>
                <span className="doc-chapter-no">{String(i + 1).padStart(2, "0")}</span>
                {section.heading}
              </h2>
              {section.body.startsWith("list:") ? (
                <ul>
                  {section.body
                    .slice(5)
                    .split("\n")
                    .filter(Boolean)
                    .map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                </ul>
              ) : (
                <p>{section.body}</p>
              )}
            </div>
          ))}

          <div className="doc-lock">
            <h2>Read the rest — free with an account</h2>
            <p>
              You&apos;ve read the first {FREE_SECTIONS} chapters. Create a free account to unlock
              all {doc.sections.length} chapters of this guide, the complete library, and the live
              panels: this week&apos;s rain outlook built into every guide, live farm news with risk
              alerts, and reminders generated from your own records.
            </p>
            <div className="page-actions">
              <ArrowFillButton href="/register" className="button primary">
                Create free account
              </ArrowFillButton>
              <a className="site-sign-in" href="/login">
                Already a member? Sign in
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default PublicDocGate;
