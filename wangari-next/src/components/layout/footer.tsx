"use client";

import { Heart, Mail, Phone, MapPin, ExternalLink } from "lucide-react";
import { Link002 } from "@/components/ui/animated-link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-wangari-border bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <img src="/images/wangari-real-logo.png" alt="Wangari" className="h-9 w-9 rounded-full object-cover" />
              <span className="text-xl font-extrabold text-wangari-heading">Wangari</span>
            </div>
            <p className="text-sm text-wangari-muted leading-relaxed max-w-sm">
              The smart, offline-first farm management platform for farmers in Kenya & East Africa.
              Track poultry, livestock, feed inventory, sales, and profit in KES from your phone or WhatsApp.
            </p>
            <div className="mt-5 space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm text-wangari-muted">
                <Mail className="h-4 w-4 text-wangari-green-800" />
                <Link002 href="mailto:info@imeantech.com" className="text-sm text-wangari-muted hover:text-wangari-green-800">info@imeantech.com</Link002>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-wangari-muted">
                <Phone className="h-4 w-4 text-wangari-green-800" />
                <span>+254 114 971 070 (Kenya)</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-wangari-muted">
                <MapPin className="h-4 w-4 text-wangari-green-800" />
                <span>Nairobi, Kenya &middot; East Africa</span>
              </div>
            </div>
          </div>

          {/* Product Modules */}
          <div>
            <h3 className="text-xs font-bold text-wangari-heading uppercase tracking-widest mb-4">Platform Hubs</h3>
            <ul className="space-y-3">
              <li><Link002 href="/features/flocks" className="text-sm text-wangari-muted hover:text-wangari-green-800">Flock & Livestock</Link002></li>
              <li><Link002 href="/features/production" className="text-sm text-wangari-muted hover:text-wangari-green-800">Daily Production</Link002></li>
              <li><Link002 href="/features/inventory" className="text-sm text-wangari-muted hover:text-wangari-green-800">Feed & Inventory</Link002></li>
              <li><Link002 href="/features/analytics" className="text-sm text-wangari-muted hover:text-wangari-green-800">Financial Analytics</Link002></li>
              <li><Link002 href="/features/team" className="text-sm text-wangari-muted hover:text-wangari-green-800">Worker Attendance</Link002></li>
              <li><Link002 href="/features/ai" className="text-sm text-wangari-muted hover:text-wangari-green-800">AI Farm Assistant</Link002></li>
            </ul>
          </div>

          {/* Navigation & Pricing */}
          <div>
            <h3 className="text-xs font-bold text-wangari-heading uppercase tracking-widest mb-4">Explore</h3>
            <ul className="space-y-3">
              <li><Link002 href="/pricing" className="text-sm text-wangari-muted hover:text-wangari-green-800">Pricing Plans</Link002></li>
              <li><Link002 href="/learn" className="text-sm text-wangari-muted hover:text-wangari-green-800">Learn Center — Free Farming Knowledge</Link002></li>
              <li><Link002 href="/about" className="text-sm text-wangari-muted hover:text-wangari-green-800">About Wangari</Link002></li>
              <li><Link002 href="/register" className="text-sm text-wangari-muted hover:text-wangari-green-800">Create Free Account</Link002></li>
              <li><Link002 href="/login" className="text-sm text-wangari-muted hover:text-wangari-green-800">Sign In</Link002></li>
              <li><Link002 href="https://imeantech.com" className="text-sm text-wangari-muted hover:text-wangari-green-800">iMeanTech Platform</Link002></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-bold text-wangari-heading uppercase tracking-widest mb-4">Legal</h3>
            <ul className="space-y-3">
              <li><Link002 href="/about" className="text-sm text-wangari-muted hover:text-wangari-green-800">Privacy Policy</Link002></li>
              <li><Link002 href="/about" className="text-sm text-wangari-muted hover:text-wangari-green-800">Terms of Service</Link002></li>
              <li><Link002 href="/about" className="text-sm text-wangari-muted hover:text-wangari-green-800">Cookie Policy</Link002></li>
            </ul>
            <div className="mt-6 flex gap-3">
              <a href="https://twitter.com/wangari_app" target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-800 hover:bg-wangari-green-800 hover:text-white transition-all duration-200">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              </a>
              <a href="https://github.com/wangari" target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-lg bg-wangari-green-50 text-wangari-green-800 hover:bg-wangari-green-800 hover:text-white transition-all duration-200">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-wangari-border bg-wangari-cream">
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-wangari-subtle">
            &copy; {currentYear} iMeanTech Limited. All rights reserved. &middot; Wangari Smart Farm Manager
          </p>
          <div className="flex items-center gap-1.5 text-xs text-wangari-subtle">
            <span>Made with</span>
            <Heart className="h-3 w-3 text-wangari-green-800 fill-wangari-green-800" />
            <span>for African farmers</span>
          </div>
          <a href="https://imeantech.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-wangari-green-800 font-semibold hover:underline">
            Built by iMeanTech
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
