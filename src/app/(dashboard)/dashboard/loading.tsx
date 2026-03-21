import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-8 space-y-8">
      {/* Action Bar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>

      {/* Revenue */}
      <section>
        <Skeleton className="mb-4 h-3.5 w-20" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-card">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-8 w-24" />
            </div>
          ))}
        </div>
      </section>

      {/* Shop Floor */}
      <section>
        <Skeleton className="mb-4 h-3.5 w-24" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-6" />
              </div>
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="mb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-1 h-3 w-24" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Tech Workload + Unpaid */}
      <div className="grid grid-cols-1 gap-8 lg:gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <section key={i}>
            <Skeleton className="mb-4 h-3.5 w-32" />
            <div className="rounded-xl border bg-card shadow-card">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between border-b px-4 py-3 last:border-0">
                  <div>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-1 h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Pending Estimates + Today's Schedule */}
      <div className="grid grid-cols-1 gap-8 lg:gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <section key={i}>
            <Skeleton className="mb-4 h-3.5 w-32" />
            <div className="rounded-xl border bg-card shadow-card">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between border-b px-4 py-3 last:border-0">
                  <div>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-1 h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
