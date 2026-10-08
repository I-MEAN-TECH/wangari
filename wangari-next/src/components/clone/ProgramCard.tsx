import { ArrowFillButton } from "./ArrowFillButton";
import { ArrowUpRightIcon, PROGRAM_ICONS } from "./icons";

/**
 * One card from the "different records, the same place" grid.
 *
 * The markup is load-bearing, so it is worth stating why it looks the way it
 * does. The ported stylesheet expects this exact nesting:
 *
 *   .program-card > .arrow-fill-content   ← grid: card-top / body / card-bottom
 *                 > .card-top             ← the real 78×78 mark + the ordinal
 *                 > .program-card-body    ← eyebrow, heading, copy
 *                 > .card-bottom          ← label + arrow circle
 *
 * The mark is the design system's own illustration, lifted from the source
 * page (see scripts/port-icons.mjs) — four distinct drawings, not a repeated
 * generic icon. Substituting a lookalike was the single biggest reason the
 * first pass of this section read as "not the real page".
 */
export interface ProgramCardProps {
  /** Position in the grid, 0-based. Picks the mark and the "01" ordinal. */
  index: number;
  tone: "lavender" | "yellow" | "sage" | "peach";
  eyebrow: string;
  title: string;
  body: string;
  label: string;
  href: string;
}

export function ProgramCard({ index, tone, eyebrow, title, body, label, href }: ProgramCardProps) {
  const Icon = PROGRAM_ICONS[index % PROGRAM_ICONS.length];

  return (
    <ArrowFillButton className={`program-card ${tone}`} href={href}>
      <div className="card-top">
        <Icon aria-hidden="true" />
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="program-card-body">
        <div className="eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <span className="card-bottom">
        {label}
        <span className="circle-arrow">
          <ArrowUpRightIcon width={20} height={20} aria-hidden="true" />
        </span>
      </span>
    </ArrowFillButton>
  );
}

export default ProgramCard;
