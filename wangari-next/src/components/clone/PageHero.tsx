import * as React from "react";

/**
 * The lead block every inner page opens with.
 *
 * Same shape as the home page's section headings — an eyebrow, a heading with
 * one italic serif word, a lead sentence and a row of pill actions — so a
 * visitor moving between pages is never re-learning the layout.
 */
export interface PageHeroProps {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHero({ eyebrow, title, lead, children }: PageHeroProps) {
  return (
    <section className="page-hero">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {lead ? <p>{lead}</p> : null}
      {children ? <div className="page-actions">{children}</div> : null}
    </section>
  );
}

export default PageHero;
