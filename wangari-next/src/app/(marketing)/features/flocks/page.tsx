"use client";

import { Bird } from "lucide-react";
import { FeaturePage } from "@/components/feature-page";

export default function FlocksFeaturePage() {
  return (
    <FeaturePage
      icon={Bird}
      badge="Flock Management"
      title="Track every bird from hatch to harvest"
      subtitle="Monitor health, feeding, and production in real time. Know exactly how your flocks are performing — from brooding to market day."
      description="Wangari's flock management module gives you complete visibility over every bird on your farm. From the moment chicks arrive to the day they're sold, you'll have real-time data on health, weight, feed consumption, and mortality — all from your phone."
      highlights={[
        "Real-time flock health monitoring with mortality tracking",
        "Automatic feed-to-egg conversion ratio calculations",
        "Breed-specific growth curves and benchmarks",
        "Early disease detection alerts based on production drops",
        "One-tap daily flock health status updates",
        "Photo history for each flock showing growth over time",
        "Multi-flock comparison dashboards for profitability analysis",
        "Veterinary record keeping per flock",
      ]}
      capabilities={[
        { title: "Flock Profiles", desc: "Create detailed profiles for each flock including breed, source, start date, initial count, and target market. Track the full lifecycle from day-old chicks to market-ready birds." },
        { title: "Health Monitoring", desc: "Log daily health observations, vaccinations, and medication. Get alerts when mortality rates exceed normal thresholds. Track temperature and humidity correlations with flock health." },
        { title: "Production Logging", desc: "Record daily egg counts, feed consumption, water usage, and weight measurements. The system automatically calculates feed conversion ratios and identifies underperforming flocks." },
        { title: "Growth Tracking", desc: "Visualize growth curves against breed standards. Know exactly when your birds are on track or falling behind. Get predictions for market readiness dates." },
        { title: "Mortality Analysis", desc: "Track and categorize mortality events by cause, age, and flock. Identify patterns that indicate disease, nutrition issues, or management problems before they escalate." },
        { title: "Financial Per Flock", desc: "See exactly how much each flock costs to raise and how much revenue it generates. Calculate ROI per bird, per kg, or per egg — giving you clear profitability insights." },
      ]}
                  farmerExperience={{
        heading: "A morning with your flocks",
        steps: [
          { title: "6:30 AM — Open the coop, count the birds", desc: "Tap My Animals, pick the flock. Yesterday's numbers are right there — birds, eggs, feed used. You know instantly if anything is off." },
          { title: "One tap per day's record", desc: "Enter today's egg collection, note any dead birds, log feed issued. Under 30 seconds — big buttons designed for the shamba, not the office." },
          { title: "Wangari spots what you'd miss", desc: "Production dipped 15% this week? You get an alert with the likely cause — before a small problem becomes a dead flock." },
          { title: "Market day — know your numbers", desc: "Which flock is ready for sale? What did the last one cost you and earn you? Open the flock profile — the profit is computed per bird." },
          { title: "Vaccination never slips", desc: "Due dates appear on your dashboard 3 days ahead, and land in your email digest. Gumboro booster on schedule, every time." },
        ],
      }}
    />
  );
}
