import * as React from "react";

import { ArrowFillButton } from "./ArrowFillButton";

/**
 * The closing band on every inner page.
 *
 * The home page ends in the orbit block, which belongs to the home page alone
 * — it is a whole illustrated scene. Inner pages get the same deep panel and
 * the same pill buttons without the scene, which keeps them recognisably part
 * of one site without pretending to be the home page.
 */
export interface CtaBandProps {
  eyebrow: string;
  title: React.ReactNode;
  copy: React.ReactNode;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function CtaBand({
  eyebrow,
  title,
  copy,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
}: CtaBandProps) {
  return (
    <section className="section stack-section">
      <div className="panel panel-deep cta-band">
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{copy}</p>
        <div className="page-actions">
          <ArrowFillButton href={ctaHref} className="button primary">
            {ctaLabel}
          </ArrowFillButton>
          {secondaryLabel && secondaryHref ? (
            <a className="site-sign-in" href={secondaryHref}>
              {secondaryLabel}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default CtaBand;
