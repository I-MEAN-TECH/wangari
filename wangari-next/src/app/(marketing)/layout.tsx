"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/clone/SiteHeader";
import { SiteFooter } from "@/components/clone/SiteFooter";
// Load order matters and is deliberate:
//   1. wc-theme.css      — every colour decision for the public site
//   2. mantality.css     — the ported stylesheet, which reads those tokens
//   3. mantality-additions.css — our own extras, on top
import "@/styles/wc-theme.css";
import "@/styles/mantality.css";
import "@/styles/mantality-additions.css";

/**
 * Public-site shell.
 *
 * This used to mount the old Wangari marketing navbar and footer, which fought
 * with the ported design system (duplicate chrome, class collisions and a
 * hydration mismatch inside the mega menu). Both are gone; every public route
 * now runs on the ported `.wc` layer with the cloned header and footer.
 *
 * The home page renders its own shell instead, because there the footer lives
 * *inside* the rounded closing block rather than after `main`.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/") {
    return <>{children}</>;
  }

  return (
    <div className="wc">
      <SiteHeader variant="default" />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
