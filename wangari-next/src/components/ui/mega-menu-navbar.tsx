"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bird,
  BarChart3,
  Package,
  Users,
  Smartphone,
  Sparkles,
  Egg,
  DollarSign,
  ShoppingCart,
  BookOpen,
  Building2,
  Briefcase,
  ChevronDown,
  Menu,
  MessagesSquare,
  MoveRight,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MegaMenuItem {
  title: string;
  description?: string;
  href: string;
  icon?: LucideIcon;
  badge?: string;
}

export interface MegaMenuResourceGroup {
  title: string;
  links: MegaMenuItem[];
}

export interface MegaMenuNavbarProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  brandName?: string;
  brandHref?: string;
  logo?: React.ReactNode;
  features?: MegaMenuItem[];
  resourceGroups?: MegaMenuResourceGroup[];
  pricingHref?: string;
  loginHref?: string;
  ctaHref?: string;
  ctaLabel?: string;
  variant?: "transparent" | "light";
}

type DesktopMenu = "features" | "resources" | null;

const WANGARI_FEATURES: MegaMenuItem[] = [
  {
    title: "Flock Management",
    description: "Track every bird from hatch date to harvest with real-time data.",
    href: "/features/flocks",
    icon: Bird,
  },
  {
    title: "Production Tracking",
    description: "Log daily egg collection, mortality, and feed usage in 3 taps.",
    href: "/features/production",
    icon: Egg,
  },
  {
    title: "Smart Analytics",
    description: "See your costs, revenue, and margins at a glance.",
    href: "/features/analytics",
    icon: BarChart3,
  },
  {
    title: "Inventory Control",
    description: "Never run out of feed or medication with low-stock alerts.",
    href: "/features/inventory",
    icon: Package,
  },
  {
    title: "Team Management",
    description: "Manage workers, attendance, and wages from one place.",
    href: "/features/team",
    icon: Users,
  },
  {
    title: "AI Assistant",
    description: "Ask your farm anything and get instant answers from your data.",
    href: "/features/ai",
    icon: Sparkles,
    badge: "New",
  },
];

const WANGARI_RESOURCES: MegaMenuResourceGroup[] = [
  {
    title: "Product",
    links: [
      { title: "Pricing", href: "/pricing", icon: DollarSign },
      { title: "Features", href: "/about", icon: Package },
      { title: "AI Assistant", href: "/features/ai", icon: Sparkles },
      { title: "Learn Center", href: "/learn", icon: BookOpen },
    ],
  },
  {
    title: "Company",
    links: [
      { title: "About Us", href: "/about", icon: Building2 },
      { title: "Contact", href: "/contact", icon: MessagesSquare },
      { title: "Careers", href: "/about", icon: Briefcase },
    ],
  },
];

function NavAction({
  href,
  children,
  variant = "primary",
  lightOnDark = false,
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "outline";
  lightOnDark?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-800 focus-visible:ring-offset-2",
        variant === "primary" &&
          "bg-wangari-green-800 text-white shadow-sm hover:bg-wangari-green-900",
        variant === "ghost" && !lightOnDark &&
          "text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800",
        variant === "ghost" && lightOnDark &&
          "text-white/80 hover:bg-white/10 hover:text-white",
        variant === "outline" &&
          "border border-wangari-border bg-white text-wangari-heading shadow-sm hover:bg-wangari-green-50",
        className,
      )}
    >
      {children}
    </a>
  );
}

function Brand({
  brandName,
  brandHref,
  logo,
  lightOnDark = false,
  onNavigate,
}: {
  brandName: string;
  brandHref: string;
  logo?: React.ReactNode;
  lightOnDark?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={brandHref}
      onClick={onNavigate}
      className={cn("relative z-10 flex shrink-0 items-center gap-2.5 text-lg font-bold tracking-tight", lightOnDark ? "text-white" : "text-wangari-heading")}
    >
      {logo ? (
        <>{logo}</>
      ) : (
        <><img src="/images/wangari-real-logo.png" alt="Wangari" className="h-8 w-8 rounded-full object-cover" /><span>{brandName}</span></>
      )}
    </Link>
  );
}

function MenuTrigger({
  id,
  label,
  isOpen,
  lightOnDark = false,
  onToggle,
  onOpen,
}: {
  id: string;
  label: string;
  isOpen: boolean;
  lightOnDark?: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={id}
      onClick={onToggle}
      onFocus={onOpen}
      className={cn(
        "flex items-center gap-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-800",
        !lightOnDark && "text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800",
        !lightOnDark && isOpen && "bg-wangari-green-50 text-wangari-green-800",
        lightOnDark && "text-white/80 hover:bg-white/10 hover:text-white",
        lightOnDark && isOpen && "bg-white/10 text-white",
      )}
    >
      {label}
      <ChevronDown
        className={cn("size-3.5 opacity-60 transition-transform duration-200", isOpen && "rotate-180")}
      />
    </button>
  );
}

function FeatureGrid({ items }: { items: MegaMenuItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.title}
            href={item.href}
            className="group/item flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-wangari-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-800"
          >
            {Icon ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-wangari-border bg-white shadow-sm transition-colors group-hover/item:border-wangari-green-200">
                <Icon className="size-5 text-wangari-green-800" />
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-wangari-heading">{item.title}</span>
                {item.badge ? (
                  <span className="rounded-full border border-wangari-green-200 bg-wangari-green-50 px-1.5 py-0.5 text-[10px] font-medium text-wangari-green-800">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              {item.description ? (
                <span className="mt-1 block text-xs leading-relaxed text-wangari-muted">
                  {item.description}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function DesktopDropdown({
  id,
  open,
  className,
  children,
}: {
  id: string;
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      className={cn(
        "absolute left-0 top-full z-50 pt-3 transition-all duration-200",
        open ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0 pointer-events-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MegaMenuNavbar({
  brandName = "Wangari",
  brandHref = "/",
  logo,
  features = WANGARI_FEATURES,
  resourceGroups = WANGARI_RESOURCES,
  pricingHref = "/pricing",
  loginHref = "/login",
  ctaHref = "/register",
  ctaLabel = "Get Started Free",
  variant = "light",
  className,
  ...props
}: MegaMenuNavbarProps) {
  const [openMenu, setOpenMenu] = React.useState<DesktopMenu>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const navRef = React.useRef<HTMLElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  const isTransparent = variant === "transparent";
  const isSolid = !isTransparent || scrolled;

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      setMobileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  React.useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  const closeMobile = () => { setMobileOpen(false); };
  const toggleDesktopMenu = (menu: Exclude<DesktopMenu, null>) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  return (
    <>
    <header
      {...props}
      ref={navRef}
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        isSolid
          ? "border-b border-wangari-border bg-white/95 backdrop-blur-md shadow-xs"
          : "bg-gradient-to-b from-black/60 via-black/30 to-transparent backdrop-blur-[2px]",
        className,
      )}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Brand brandName={brandName} brandHref={brandHref} logo={logo} lightOnDark={!isSolid} />

            <nav aria-label="Primary navigation" className="hidden items-center lg:flex">
              <ul className="flex items-center gap-1">
                <li className="relative" onMouseEnter={() => setOpenMenu("features")}>
                  <MenuTrigger
                    id="features-mega-menu"
                    label="Features"
                    isOpen={openMenu === "features"}
                    lightOnDark={!isSolid}
                    onToggle={() => toggleDesktopMenu("features")}
                    onOpen={() => setOpenMenu("features")}
                  />
                  <DesktopDropdown id="features-mega-menu" open={openMenu === "features"} className="w-[640px]">
                    <div className="rounded-xl border border-wangari-border bg-white p-4 shadow-xl">
                      <FeatureGrid items={features} />
                      <div className="mt-4 flex items-center justify-between border-t border-wangari-green-50 px-2 pt-4">
                        <span className="text-sm text-wangari-muted">See all platform features</span>
                        <Link href="/about" className="inline-flex items-center gap-1 text-sm font-medium text-wangari-green-800 hover:underline">
                          Learn more <MoveRight className="size-4" />
                        </Link>
                      </div>
                    </div>
                  </DesktopDropdown>
                </li>

                <li>
                  <Link
                    href={pricingHref}
                    className={cn(
                      "inline-flex rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-800",
                      isSolid ? "text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800" : "text-white/80 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    Pricing
                  </Link>
                </li>

                <li className="relative" onMouseEnter={() => setOpenMenu("resources")}>
                  <MenuTrigger
                    id="resources-mega-menu"
                    label="Resources"
                    isOpen={openMenu === "resources"}
                    lightOnDark={!isSolid}
                    onToggle={() => toggleDesktopMenu("resources")}
                    onOpen={() => setOpenMenu("resources")}
                  />
                  <DesktopDropdown id="resources-mega-menu" open={openMenu === "resources"} className="w-[520px]">
                    <div className="grid grid-cols-2 gap-6 rounded-xl border border-wangari-border bg-white p-5 shadow-xl">
                      {resourceGroups.map((group) => (
                        <div key={group.title} className="flex flex-col gap-1">
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-wangari-subtle">{group.title}</h4>
                          {group.links.map((item) => {
                            const Icon = item.icon;
                            return (
                              <Link
                                key={item.title}
                                href={item.href}
                                className="flex items-center gap-2 rounded-md p-2 text-sm text-wangari-muted transition-colors hover:bg-wangari-green-50 hover:text-wangari-green-800"
                              >
                                {Icon ? <Icon className="size-4 text-wangari-green-800" /> : null}
                                {item.title}
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </DesktopDropdown>
                </li>

                <li>
                  <Link
                    href="/about"
                    className={cn(
                      "inline-flex rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-800",
                      isSolid ? "text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800" : "text-white/80 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    About
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              <NavAction href={loginHref} variant="ghost" lightOnDark={!isSolid}>Sign In</NavAction>
              <NavAction href={ctaHref} lightOnDark={!isSolid}>{ctaLabel}</NavAction>
            </div>
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className={cn(
                "flex h-11 w-11 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-800 lg:hidden cursor-pointer",
                isSolid
                  ? "text-wangari-heading bg-wangari-gray-100/80 hover:bg-wangari-green-50 hover:text-wangari-green-800"
                  : "text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm"
              )}
            >
              <Menu className="size-6 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

    </header>

    {/* Mobile overlay + drawer — outside header to avoid backdrop-blur clipping */}
    {mobileOpen && (
      <div className="fixed inset-0 z-[60] lg:hidden">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          style={{ animation: "fadeIn 0.2s ease-out forwards" }}
          onClick={closeMobile}
        />
        {/* Drawer panel */}
        <aside
          role="dialog"
          aria-modal="true"
          className="absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl overflow-y-auto"
          style={{ animation: "slideInRight 0.3s ease-out forwards" }}
        >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-wangari-border px-6 py-4">
              <Brand brandName={brandName} brandHref={brandHref} logo={logo} onNavigate={closeMobile} />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMobile}
                aria-label="Close navigation menu"
                className="flex size-10 items-center justify-center rounded-md text-wangari-muted transition-colors hover:bg-wangari-green-50"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Navigation links */}
            <div className="px-6 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-wangari-subtle mb-3">Features</p>
              <div className="space-y-1 mb-6">
                {features.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={closeMobile}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-wangari-text hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-colors"
                    >
                      {Icon && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-800"><Icon className="size-4" /></div>}
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="border-t border-wangari-border pt-4 mb-4">
                <Link href={pricingHref} onClick={closeMobile} className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-wangari-heading hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-colors">
                  Pricing
                </Link>
              </div>

              <p className="text-xs font-bold uppercase tracking-widest text-wangari-subtle mb-3">Resources</p>
              <div className="space-y-1 mb-6">
                {resourceGroups.flatMap((group) =>
                  group.links.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={`${group.title}-${item.title}`}
                        href={item.href}
                        onClick={closeMobile}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-wangari-muted hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-colors"
                      >
                        {Icon && <Icon className="size-4 text-wangari-green-800 shrink-0" />}
                        <span>{item.title}</span>
                      </Link>
                    );
                  }),
                )}
              </div>

              <div className="border-t border-wangari-border pt-4">
                <Link href="/about" onClick={closeMobile} className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-wangari-heading hover:bg-wangari-green-50 hover:text-wangari-green-800 transition-colors">
                  About
                </Link>
              </div>
            </div>

            {/* Bottom buttons */}
            <div className="sticky bottom-0 bg-white border-t border-wangari-border px-6 py-4 grid grid-cols-2 gap-3">
              <NavAction href={loginHref} variant="outline" className="w-full justify-center" onClick={closeMobile}>Sign In</NavAction>
              <NavAction href={ctaHref} className="w-full justify-center" onClick={closeMobile}>{ctaLabel}</NavAction>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default MegaMenuNavbar;
