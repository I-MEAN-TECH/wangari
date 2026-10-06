"use client";

import * as React from "react";
import { Megaphone, X } from "lucide-react";
import api from "@/lib/api-client";

/**
 * Active announcement banner, rendered inside the farm dashboard shell.
 * Data comes from the admin console (one active banner at a time).
 * Dismissal is per-browser and re-appears for new announcements.
 */
export function AnnouncementBanner() {
  const [banner, setBanner] = React.useState<{ id: number; message: string; link: string | null } | null>(null);
  const [dismissedId, setDismissedId] = React.useState<number | null>(null);

  React.useEffect(() => {
    api
      .get("/api/announcements/active")
      .then((d: any) => {
        if (d?.id && d?.message) setBanner({ id: d.id, message: d.message, link: d.link ?? null });
      })
      .catch(() => {}); // no banner / not logged in — silent
  }, []);

  React.useEffect(() => {
    const stored = sessionStorage.getItem("wangari_dismissed_announcement");
    if (stored) setDismissedId(Number(stored));
  }, []);

  if (!banner || dismissedId === banner.id) return null;

  const dismiss = () => {
    sessionStorage.setItem("wangari_dismissed_announcement", String(banner.id));
    setDismissedId(banner.id);
  };

  const body = (
    <div className="flex items-start gap-3">
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-wangari-green-700" />
      <div className="min-w-0 flex-1 text-sm text-wangari-green-950">
        {banner.message}
        {banner.link && (
          <a href={banner.link} className="ml-2 font-bold underline underline-offset-2 hover:no-underline">
            Learn more →
          </a>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded p-0.5 text-wangari-green-800/60 hover:bg-wangari-green-100 hover:text-wangari-green-900">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="mb-4 rounded-xl border border-wangari-green-200 bg-wangari-green-50 px-4 py-3">
      {banner.link ? <a href={banner.link}>{body}</a> : body}
    </div>
  );
}
