"use client";

import * as React from "react";

import { CATEGORIES, LEARN_DOCS } from "@/lib/learn-library";

/**
 * The document shelf, drawn in the public site's own language.
 *
 * The dashboard already has a library grid, but it is built from dashboard
 * tokens and would look like a different product bolted onto the marketing
 * site. This is the same data — the same LEARN_DOCS and CATEGORIES — rendered
 * with the ported design system's panels, so /learn reads as part of the site
 * a visitor just arrived from.
 */

const CATEGORY_LABELS: Record<string, string> = {
  "growing-guide": "Guide",
  "farm-type": "Farming",
  rights: "Rights",
};

export interface LearnShelfProps {
  /** Member-only documents show as teasers when this is false. */
  isMember?: boolean;
}

export function LearnShelf({ isMember = false }: LearnShelfProps) {
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");

  const filtered = LEARN_DOCS.filter((doc) => {
    const inCategory = category === "all" || doc.category === category;
    const q = query.trim().toLowerCase();
    const matches =
      !q || doc.title.toLowerCase().includes(q) || doc.summary.toLowerCase().includes(q);
    return inCategory && matches;
  });

  const filters = [{ id: "all", label: "All documents" }].concat(
    CATEGORIES.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }))
  );

  return (
    <div>
      <div className="shelf-filters">
        <div className="toggle">
          {filters.map((f) => (
            <button
              type="button"
              key={f.id}
              aria-pressed={category === f.id}
              onClick={() => setCategory(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="shelf-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the library…"
            aria-label="Search the library"
          />
        </div>
      </div>

      <div className="grid-3">
        {filtered.map((doc) => {
          const locked = doc.memberOnly && !isMember;
          return (
            <a className="doc-card" href={`/learn/${doc.slug}`} key={doc.slug}>
              <span className={`doc-flag${locked ? " is-locked" : ""}`}>
                {locked ? "Members" : CATEGORY_LABELS[doc.category] ?? "Guide"}
              </span>
              <h3>
                <span aria-hidden="true">{doc.emoji}</span> {doc.title}
              </h3>
              <p>
                {locked
                  ? "Full guide inside — varieties, programmes and checklists for members."
                  : doc.summary}
              </p>
              <span className="doc-meta">
                <span>{doc.readMinutes} min read</span>
                <span>Read →</span>
              </span>
            </a>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="form-note">No documents match “{query}”.</p>
      ) : null}
    </div>
  );
}

export default LearnShelf;
