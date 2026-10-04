"use client";

import { BarChart3 } from "lucide-react";
import { FeaturePage } from "@/components/feature-page";

export default function AnalyticsFeaturePage() {
  return (
    <FeaturePage
      icon={BarChart3}
      badge="Smart Analytics"
      title="See your costs, revenue, and margins at a glance"
      subtitle="Know exactly which flock is most profitable. Make data-driven decisions that grow your bottom line — not just your bird count."
      description="Wangari's analytics engine transforms raw farm data into actionable business insights. See your profitability per flock, track cost trends, forecast revenue, and make smarter decisions backed by real numbers — not gut feelings."
      highlights={[
        "Real-time revenue and expense dashboards",
        "Per-flock profitability analysis with ROI calculations",
        "Feed cost optimization recommendations",
        "Revenue forecasting based on production trends",
        "Comparative analysis across flocks, seasons, and years",
        "Export-ready financial reports for investors or banks",
        "Cost breakdown by category (feed, labor, medication, etc.)",
        "Break-even analysis for new flock investments",
      ]}
      capabilities={[
        { title: "Revenue Dashboard", desc: "See total revenue, revenue per flock, and revenue trends at a glance. Track income from egg sales, bird sales, manure, and other sources with automatic categorization." },
        { title: "Cost Analysis", desc: "Break down every shilling spent on your farm. See where your money goes — feed, labor, medication, infrastructure — and identify opportunities to cut costs without cutting quality." },
        { title: "Profitability Reports", desc: "Calculate exact profit margins per flock, per kg, per egg, or per bird. Compare profitability across different breeds, ages, and seasons to optimize your strategy." },
        { title: "Forecasting Engine", desc: "AI-powered predictions for future production, revenue, and costs. Plan inventory, staffing, and investments based on data-driven forecasts instead of guesswork." },
        { title: "Custom Reports", desc: "Generate custom reports for any time period, flock, or metric. Share reports with partners, investors, or financial institutions with one tap." },
        { title: "Benchmark Comparisons", desc: "Compare your farm's performance against industry averages and your own historical data. See where you excel and where there's room for improvement." },
      ]}
                  farmerExperience={{
        heading: "From guesses to numbers in one dashboard",
        steps: [
          { title: "End of month — the question arrives", desc: "'Is this farm actually making money?' With paper records, that answer takes a weekend with a calculator. With Wangari, it's on your dashboard already." },
          { title: "Real profit, not vibes", desc: "Income minus every recorded expense — feed, vaccines, wages, transport — computed daily. Green if you're growing, red if a flock is quietly eating your capital." },
          { title: "Find the leak", desc: "Cost breakdown shows exactly where each shilling goes. Feed at 70% of costs? Tap in — compare feed cost per egg across flocks and spot the underperformer." },
          { title: "Decide with numbers", desc: "Should you raise layer prices? Expand into broilers? The trends answer: your margin per tray this quarter vs last, laid out in one chart." },
          { title: "The crop profitability calculator", desc: "Planning a new crop block? Input the seed, fertiliser and labour costs — see the harvest revenue it must beat before you plant a single seedling." },
        ],
      }}
    />
  );
}
