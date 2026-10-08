"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ArrowFillButton } from "./ArrowFillButton";

/**
 * The floating pill navigation from the design we're cloning.
 *
 * Markup shape is load-bearing — the ported stylesheet positions these three
 * children of `header.site-header` (logo, centred menu, trailing actions) with
 * `justify-content:space-between`, absolutely centres the menu pill, and keys
 * the mobile breakpoint off the same class names.
 */

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
];

const MORE_LINKS = [
  { label: "Learn", href: "/learn" },
  { label: "About us", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export interface SiteHeaderProps {
  /**
   * `hero` floats the bar transparently over a full-bleed photograph.
   * `default` is the light in-flow bar used on every other page.
   */
  variant?: "hero" | "default";
}

export function SiteHeader({ variant = "hero" }: SiteHeaderProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!moreOpen) return;
    const close = () => setMoreOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [moreOpen]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const close = () => setMobileMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [mobileMenuOpen]);

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={`site-header${variant === "hero" ? " site-header-hero" : ""}`}
    >
      <a className="logo" href="/" aria-label="Wangari home">
        <span className="mantality-brand-symbol">
          {/* Two copies of the one brand asset: the stylesheet swaps between
              them at the hero breakpoint, because the mark has to sit on paper
              in one case and on a photograph in the other. It is the same
              Wangari logo the app chrome uses everywhere else. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-symbol-dark" src="/images/wangari-real-logo.png" alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-symbol-light" src="/images/wangari-real-logo.png" alt="" />
        </span>
        wangari
        <span className="logo-dot">®</span>
      </a>

      <nav className="site-header-menu" aria-label="Main">
        <div className="site-menu-row">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              {link.label}
            </a>
          ))}

          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="site-more-toggle"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={() => setMoreOpen((v) => !v)}
            >
              More Pages
              <ChevronDown className="lucide lucide-chevron-down" aria-hidden="true" />
            </button>

            {moreOpen && (
              <div className="site-more-pages" role="menu" onClick={() => setMoreOpen(false)}>
                {MORE_LINKS.map((link) => (
                  <a key={link.href} href={link.href} role="menuitem">
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="site-header-actions">
        <a className="site-sign-in" href="/login">
          Sign In
        </a>
        <ArrowFillButton href="/register">Get started</ArrowFillButton>
      </div>

      {/* Burger + Mobile panel — rendered client-only to prevent any SSR mismatch */}
      {mounted && (
        <>
          <button
            type="button"
            className={`menu-toggle${mobileMenuOpen ? " is-open" : ""}`}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle mobile menu"
            onClick={(e) => {
              e.stopPropagation();
              setMobileMenuOpen((v) => !v);
            }}
          >
            <span className="hamburger">
              <span className="line line-1" />
              <span className="line line-2" />
              <span className="line line-3" />
            </span>
          </button>

          {mobileMenuOpen && (
            <div
              className="mobile-menu"
              onClick={() => setMobileMenuOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              {/* Brand strip at top */}
              <div className="mm-brand" onClick={(e) => e.stopPropagation()}>
                <a className="mm-logo" href="/" onClick={() => setMobileMenuOpen(false)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/wangari-real-logo.png" alt="" className="mm-logo-img" />
                  <span>wangari<span className="mm-logo-dot">®</span></span>
                </a>
                <button
                  type="button"
                  className="mm-close"
                  aria-label="Close menu"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              {/* Nav content */}
              <nav className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
                <p className="mm-section-label">Navigate</p>
                <div className="mobile-menu-section">
                  {NAV_LINKS.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="mobile-menu-link"
                      aria-current={isCurrent(link.href) ? "page" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
                      <svg className="mm-link-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  ))}
                </div>

                <p className="mm-section-label">More</p>
                <div className="mobile-menu-section">
                  {MORE_LINKS.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="mobile-menu-link"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
                      <svg className="mm-link-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </nav>

              {/* Auth footer */}
              <div className="mm-footer" onClick={(e) => e.stopPropagation()}>
                <a className="mm-signin" href="/login" onClick={() => setMobileMenuOpen(false)}>
                  Sign In
                </a>
                <ArrowFillButton href="/register" className="mm-cta">Get started free</ArrowFillButton>
              </div>
            </div>
          )}
        </>
      )}
    </header>
  );
}

export default SiteHeader;
