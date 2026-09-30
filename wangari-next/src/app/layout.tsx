import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Wangari — Smart Farm Management System Kenya | Livestock, Crops & Poultry App",
    template: "%s | Wangari — Smart Farm Management",
  },
  description:
    "Stop guessing your farm profit. Track cattle, poultry, goats, fish, crops, feed inventory, sales & finances from your phone or offline. Built for farmers in Kenya & East Africa. Start free.",
  keywords: [
    "Wangari",
    "Wangari App",
    "Wangari Farm",
    "Wangari Kenya",
    "Wangari Farm Management",
    "Wangari App Kenya",
    "Wangari Livestock",
    "Wangari Smart Farm",
    "Wangari Maathai Farm Tech",
    "farm management software Kenya",
    "livestock farm management software",
    "Kenya dairy farming record keeping app",
    "cattle goat sheep pig fish farm app Kenya",
    "farm profit calculator KES",
    "offline farm management app",
    "livestock tracker Kenya",
    "farm inventory management system",
    "Kienyeji layers broiler farm software",
    "farm accounting app Kenya",
    "WhatsApp farm management bot",
  ],
  authors: [{ name: "iMeanTech", url: "https://imeantech.com" }],
  creator: "iMeanTech",
  publisher: "iMeanTech",
  metadataBase: new URL("https://wangari.imeantech.com"),
  other: {
    "geo.region": "KE",
    "geo.placename": "Nairobi, Kenya",
    "geo.position": "-1.286389;36.817223",
    "ICBM": "-1.286389, 36.817223",
    "theme-color": "#166534",
  },
  openGraph: {
    title: "Wangari — Smart Farm Management System for Kenyan Farmers",
    description:
      "Wangari Farm App: Track every egg, every bag of feed, and every shilling in 30 seconds. Works 100% offline with M-Pesa tracking.",
    url: "https://wangari.imeantech.com",
    siteName: "Wangari Farm Management",
    locale: "en_KE",
    type: "website",
    images: [
      {
        url: "https://wangari.imeantech.com/images/wangari-real-logo.png",
        width: 800,
        height: 800,
        alt: "Wangari Farm Management Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wangari — Smart Farm Management System",
    description:
      "Wangari App: Know your real farm profit. Track cattle, poultry, goats, fish, crops, feed & sales offline. 14-day free trial available.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/wangari-real-logo.png", type: "image/png" },
    ],
    apple: "/images/wangari-real-logo.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://wangari.imeantech.com",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased text-[#334155] bg-[#FAFBFC]" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Wangari",
              alternateName: ["Wangari App", "Wangari Farm Management", "Wangari Kenya", "Wangari Farm Tracker"],
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, Android, iOS",
              description: "Wangari is an offline-first farm management software and WhatsApp bot built for Kenyan farmers to track all livestock (cattle, poultry, goats, sheep, pigs, fish, bees), crops, feed inventory, and net KES profits.",
              url: "https://wangari.imeantech.com",
              offers: [
                {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "KES",
                  name: "Starter Free Trial",
                  description: "14-day free trial, no credit card",
                },
                {
                  "@type": "Offer",
                  price: "500",
                  priceCurrency: "KES",
                  name: "Starter",
                  description: "1 hub + WhatsApp bot",
                },
                {
                  "@type": "Offer",
                  price: "1500",
                  priceCurrency: "KES",
                  name: "Pro",
                  description: "3 hubs + AI + alerts",
                },
                {
                  "@type": "Offer",
                  price: "3000",
                  priceCurrency: "KES",
                  name: "Enterprise",
                  description: "All 7 hubs + priority support",
                },
              ],
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: "4.8",
                ratingCount: "150",
              },
              author: {
                "@type": "Organization",
                name: "iMeanTech",
                url: "https://imeantech.com",
              },
            }),
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
