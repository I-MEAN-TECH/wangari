import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  className?: string;
}

export function KpiCard({
  title,
  value,
  icon,
  change,
  changeType = "neutral",
  className,
}: KpiCardProps) {
  const changeColors = {
    positive: "text-wangari-green-600 bg-wangari-green-50",
    negative: "text-wangari-red-600 bg-tone-bad-bg",
    neutral: "text-wangari-muted bg-wangari-gray-50",
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-wangari-border bg-white p-3.5 sm:p-5 shadow-xs transition-all duration-300 hover:shadow-md hover:-translate-y-0.5",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-wangari-muted">
            {title}
          </p>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-wangari-heading font-serif tracking-tight truncate">
            {value}
          </p>
          {change && (
            <p
              className={cn(
                "mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                changeColors[changeType]
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 shrink-0 ml-3">
          {icon}
        </div>
      </div>
    </div>
  );
}
