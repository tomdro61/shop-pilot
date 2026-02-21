import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-7">
      {/* Action Bar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>

      {/* Section 1: Revenue */}
      <div className="rounded-xl border bg-muted/50 p-4 lg:p-5">
        <Skeleton className="mb-4 h-3.5 w-20" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-8 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Operations */}
      <div className="rounded-xl border bg-muted/50 p-4 lg:p-5">
        <Skeleton className="mb-4 h-3.5 w-24" />
        <Skeleton className="mb-3 h-10 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <Skeleton className="mb-3 h-3 w-20" />
            <div className="flex items-center gap-5">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
          <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <Skeleton className="h-3 w-24" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between border-b px-4 py-2.5 last:border-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Recent Jobs */}
      <div className="rounded-xl border bg-muted/50 p-4 lg:p-5">
        <Skeleton className="mb-4 h-3.5 w-24" />
        <div className="rounded-lg border bg-card">
          {Array.from({ length: 6 }).map((_, j) => (
            <div key={j} className="flex items-center justify-between border-b px-5 py-3 last:border-0">
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
