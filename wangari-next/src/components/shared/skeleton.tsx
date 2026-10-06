import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-xl bg-gray-200", className)} {...props} />;
}

export function CardSkeleton() {
  return (
    <div className="border border-wangari-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2 flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="border border-wangari-border rounded-2xl p-4 space-y-2">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-wangari-border rounded-2xl p-4 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
