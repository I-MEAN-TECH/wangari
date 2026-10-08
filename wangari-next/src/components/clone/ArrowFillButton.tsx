import * as React from "react";
import { ArrowRight } from "lucide-react";

/**
 * The signature pill button from the design system we're cloning: a pill with
 * a circle on the right holding an arrow. On hover the background circle
 * expands to fill the whole pill, the label flips to the inverse colour, and
 * the arrow swaps out for an identical one sliding in from the left.
 *
 * The two arrows both live inside `.arrow-fill-icon` because that element is
 * the `overflow:hidden` window the swap happens in — the stylesheet positions
 * and animates `.arrow-out` / `.arrow-in` relative to it.
 */
export interface ArrowFillButtonProps {
  children: React.ReactNode;
  href?: string;
  className?: string;
  /** Diameter of the arrow circle, in px. */
  circle?: number;
  /** Colour the pill fills with on hover, and the arrow circle at rest. */
  fillBg?: string;
  /** Label colour once the pill has filled. */
  fillInk?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-current"?: "page" | undefined;
  /**
   * Replaces the arrow inside the circle. The FAQ accordion uses this to put a
   * chevron in the same slot the arrow occupies elsewhere; the stylesheet pans
   * and rotates whatever sits here, so it has to be the slot, not the label.
   */
  icon?: React.ReactNode;
}

export function ArrowFillButton({
  children,
  href,
  className = "",
  circle,
  fillBg,
  fillInk,
  icon,
  type = "button",
  onClick,
  ...rest
}: ArrowFillButtonProps) {
  const style: React.CSSProperties = {};
  if (circle !== undefined) (style as Record<string, string>)["--circle"] = `${circle}px`;
  if (fillBg) (style as Record<string, string>)["--fill-bg"] = fillBg;
  if (fillInk) (style as Record<string, string>)["--fill-ink"] = fillInk;

  const inner = (
    <>
      <span className="arrow-fill-surface" />
      <span className="arrow-fill-content">{children}</span>
      <span className="arrow-fill-icon">
        {icon ?? (
          <>
            <ArrowRight className="lucide lucide-arrow-right arrow-out" aria-hidden="true" />
            <ArrowRight className="lucide lucide-arrow-right arrow-in" aria-hidden="true" />
          </>
        )}
      </span>
    </>
  );

  const classes = `arrow-fill-button ${className}`.trim();

  if (href) {
    return (
      <a href={href} className={classes} style={style} {...rest}>
        {inner}
      </a>
    );
  }

  return (
    <button type={type} className={classes} style={style} onClick={onClick} {...rest}>
      {inner}
    </button>
  );
}

export default ArrowFillButton;
