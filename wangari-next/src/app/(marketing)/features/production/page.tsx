"use client";

import { ClipboardList } from "lucide-react";
import { FeaturePage } from "@/components/feature-page";

export default function ProductionFeaturePage() {
  return (
    <FeaturePage
      icon={ClipboardList}
      badge="Production Tracking"
      title="Log daily production in 3 taps"
      subtitle="Record egg collection, mortality, feed usage, and weight measurements from the field. Works offline — syncs when you're back online."
      description="Stop guessing and start knowing. Wangari's production tracking module makes it effortless to log daily farm data. Workers can record production from anywhere — even without internet — and everything syncs automatically when they're back online."
      highlights={[
        "3-tap production logging — fastest in the industry",
        "Works completely offline with automatic sync",
        "Daily egg collection, mortality, and feed tracking",
        "Automatic production trend analysis and forecasting",
        "Worker-level accountability with submission tracking",
        "Photo attachments for production records",
        "Multi-flock batch recording in a single session",
        "Historical data comparisons by week, month, or season",
      ]}
      capabilities={[
        { title: "Quick Entry Forms", desc: "Minimal-tap forms designed for field use. Log egg count, feed bags used, mortality, and notes in under 10 seconds. Large buttons and clear labels work even with gloves on." },
        { title: "Offline Mode", desc: "No internet? No problem. All production data is stored locally on the device and automatically syncs when connectivity returns. Never lose a day's data." },
        { title: "Trend Analysis", desc: "See production trends over days, weeks, and months. Identify seasonal patterns, detect production drops early, and forecast future output based on historical data." },
        { title: "Feed Tracking", desc: "Track every bag of feed that goes into each flock. Monitor consumption rates, detect waste, and get alerts when feed usage doesn't match expected patterns." },
        { title: "Mortality Logs", desc: "Record and categorize mortality events in real-time. Track causes, ages, and patterns. The system flags unusual spikes and suggests potential causes." },
        { title: "Worker Reports", desc: "See who logged what and when. Track worker productivity and accountability. Identify training needs based on data quality and submission consistency." },
      ]}
                  farmerExperience={{
        heading: "Recording today's output — even with no signal",
        steps: [
          { title: "At the coop, phone says 'No service'", desc: "Doesn't matter. Open Wangari, tap Record Today's Output. The app works exactly the same as when you have full bars." },
          { title: "Save — instant confirmation", desc: "142 eggs, 2 bags of feed used, one bird dead. Tap save and it confirms immediately — the record is stored safely on your phone, not lost into a broken internet." },
          { title: "Keep working, it keeps queueing", desc: "A sale happens an hour later? Record it too. The banner quietly counts: '2 records waiting to sync.' Every one labelled, ordered, and safe." },
          { title: "Signal returns — it syncs itself", desc: "No button, no re-entering. Green banner: '2 saved records synced successfully.' Your records land on the server exactly once — never doubled by a retry." },
          { title: "Close the app, turn off the phone — still safe", desc: "The queue survives in your device storage. Even if the phone died at lunch, opening Wangari tomorrow with signal finishes the sync automatically." },
        ],
      }}
    />
  );
}
