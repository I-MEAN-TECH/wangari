"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { ArrowFillButton } from "./ArrowFillButton";

/**
 * The FAQ accordion, shared by the home page and Pricing.
 *
 * Two things here are structural rather than stylistic:
 *
 *  • The chevron goes inside `.arrow-fill-icon`, not next to the label. The
 *    ported stylesheet pans and rotates *that* element, and it hides any svg
 *    that sits inside `.arrow-fill-content` — a chevron in the label would
 *    simply disappear.
 *  • An open item keeps its paragraph mounted only while open, matching the
 *    source, because the open-state styling is driven by
 *    `:has(> button[aria-expanded=true])`.
 */
export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqAccordionProps {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  items: FaqItem[];
}

export function FaqAccordion({ id, eyebrow, title, items }: FaqAccordionProps) {
  const [open, setOpen] = React.useState(0);

  return (
    <section className="faq section" id={id}>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>

      <div className="faq-list">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div className="faq-item" key={item.q}>
              <ArrowFillButton
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                icon={
                  <ChevronRight
                    className="lucide lucide-chevron-right accordion-chevron"
                    width={18}
                    height={18}
                    aria-hidden="true"
                  />
                }
              >
                {item.q}
              </ArrowFillButton>
              {isOpen && <p id={`faq-answer-${i}`}>{item.a}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FaqAccordion;
