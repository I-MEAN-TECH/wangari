import * as React from "react";

/**
 * Portrait avatars for the public site.
 *
 * The layout we cloned fills these slots with photographs. We do not have
 * licensed photos of Wangari's farmers, and a testimonial attributing words to
 * a real name over a stranger's stock face is a lie — but an initials chip,
 * which is what stood here before, reads as a placeholder and made rows of
 * testimonials look unfinished.
 *
 * So each slot renders a *drawn* portrait instead: clearly illustrative, never
 * mistakable for a photograph of a named person, but as legible at 28px as a
 * face. That is the honest middle — the reader sees a person, not a placeholder,
 * and nobody is impersonated.
 *
 * The drawing holds no colours of its own. Every fill resolves to a
 * `--wc-avatar-*` token declared in styles/wc-theme.css, selected by the
 * `wc-avatar-*` classes below, so the whole cast re-tints with the theme.
 *
 * Which face a name gets is deterministic (see `look`), so a person keeps the
 * same appearance everywhere on the site — in the stack card, on the proof row
 * and in the closing orbit.
 */

export interface AvatarProps {
  /** Whose face this is. Seeds the appearance, so it is stable. */
  name: string;
  className?: string;
}

/** Small, stable string hash — same name, same face, on every render. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const SKINS = 5;
const HAIRS = 5;
const CLOTHS = 4;
const BACKDROPS = 4;

/**
 * Appearance for a name. Offsets keep the four traits from moving in lockstep,
 * so two people who share a backdrop still differ in hair and clothing.
 */
function look(name: string) {
  const seed = hash(name);
  return {
    skin: (seed % SKINS) + 1,
    hair: (Math.floor(seed / 7) % HAIRS) + 1,
    cloth: (Math.floor(seed / 37) % CLOTHS) + 1,
    backdrop: (Math.floor(seed / 101) % BACKDROPS) + 1,
  };
}

/**
 * Five hair shapes, drawn over the head between y=14 and y=42. Each is the
 * silhouette only — the head, neck and shoulders underneath are shared, which
 * is what keeps the set looking like one design rather than five drawings.
 */
function hairPath(style: number): React.ReactNode {
  switch (style) {
    case 1: // close crop
      return <path d="M27 38.5c0-13 9.5-21 21-21s21 8 21 21c-3.5-7-11-11-21-11s-17.5 4-21 11Z" />;
    case 2: // headwrap
      return (
        <>
          <path d="M25.5 36c1-15 10.5-23 22.5-23s21.5 8 22.5 23c-5-6.5-13-9.5-22.5-9.5S30.5 29.5 25.5 36Z" />
          <circle cx="70" cy="24" r="7" />
        </>
      );
    case 3: // high bun
      return (
        <>
          <circle cx="48" cy="16" r="7.5" />
          <path d="M28 37c1.5-12 9.5-18.5 20-18.5s18.5 6.5 20 18.5c-4-6-11-9-20-9s-16 3-20 9Z" />
        </>
      );
    case 4: // full afro
      return <path d="M23 42c-3-18 10-27 25-27s28 9 25 27c-4-10.5-12.5-15-25-15s-21 4.5-25 15Z" />;
    default: // cap
      return (
        <>
          <path d="M28 35.5C29.5 23 38 16.5 48 16.5S66.5 23 68 35.5Z" />
          <rect x="22" y="34.5" width="52" height="6" rx="3" />
        </>
      );
  }
}

export function Avatar({ name, className }: AvatarProps) {
  const { skin, hair, cloth, backdrop } = look(name);

  return (
    <span className={["wc-avatar", className].filter(Boolean).join(" ")} aria-hidden="true">
      <svg viewBox="0 0 96 96" role="presentation" focusable="false">
        {/* Backdrop first, so the whole frame is a tint rather than a white box. */}
        <rect width="96" height="96" className={`wc-avatar-bg-${backdrop}`} />

        {/* Shoulders — a rounded trapezoid wide enough to read as a body at 28px. */}
        <path
          d="M48 61c-18.5 0-33.5 12.5-36 32.5V96h72v-2.5C81.5 73.5 66.5 61 48 61Z"
          className={`wc-avatar-cloth-${cloth}`}
        />
        {/* Collar, one step lighter than the garment so the neck reads clearly. */}
        <path d="M40.5 64 48 74l7.5-10 4.5 2.5L52.5 77h-9L36 66.5Z" className={`wc-avatar-cloth-${cloth}-trim`} />

        {/* Neck, then head over it. The head takes just under half the frame:
            any smaller and the face turns to a smudge in the 28px stack card. */}
        <path d="M40.5 45h15v13.5a7.5 7.5 0 0 1-15 0Z" className={`wc-avatar-skin-${skin}`} />
        <ellipse cx="48" cy="40" rx="20.5" ry="22.5" className={`wc-avatar-skin-${skin}`} />
        <circle cx="28" cy="42.5" r="4.5" className={`wc-avatar-skin-${skin}`} />
        <circle cx="68" cy="42.5" r="4.5" className={`wc-avatar-skin-${skin}`} />

        {/* The outline is what separates hair from the backdrop tint. Without it
            a dark crop on a dark green field reads as one shape at small sizes. */}
        <g className={`wc-avatar-hair-${hair} wc-avatar-hairline`}>{hairPath(hair)}</g>

        {/* Features. Deliberately minimal: two dots and a curve survive being
            scaled to 28px, where eyelashes and nose lines turn to mush. Both
            are drawn a touch larger than life so they still read at that size. */}
        <g className="wc-avatar-line">
          <circle cx="40" cy="41.5" r="2.8" />
          <circle cx="56" cy="41.5" r="2.8" />
          <path
            d="M41.5 50c3.6 4 9.4 4 13 0"
            fill="none"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="wc-avatar-stroke"
          />
        </g>
      </svg>
    </span>
  );
}

export default Avatar;
