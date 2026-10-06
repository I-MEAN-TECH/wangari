"use client";

import { usePathname } from "next/navigation";
import { MegaMenuNavbar } from "@/components/ui/mega-menu-navbar";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <div className="min-h-screen bg-wangari-cream overflow-x-hidden">
      <MegaMenuNavbar
        variant={isHome ? "transparent" : "light"}
        logo={
          <div className="flex items-center gap-2.5">
            <img src="/images/wangari-real-logo.png" alt="Wangari" className="h-8 w-8 rounded-full object-cover" />
            <span className={`text-base font-bold tracking-tight ${isHome ? "text-white" : "text-wangari-heading"}`}>Wangari</span>
          </div>
        }
      />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
