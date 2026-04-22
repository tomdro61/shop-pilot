import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-10 space-y-8 lg:space-y-10">
      {/* Action Bar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>

      {/* Revenue Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card p-5 lg:p-6 rounded-lg shadow-card">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-10 w-28" />
          </div>
        ))}
      </section>

      {/* Shop Floor Status */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {Array.from({ length: 3 }).map((_, col) => (
            <div key={col} className="space-y-4">
              <Skeleton className="h-3.5 w-28 ml-1" />
              <div className="space-y-3">
                {Array.from({ length: col === 1 ? 1 : 2 }).map((_, j) => (
                  <div key={j} className="bg-card p-5 rounded-lg shadow-card border-l-4 border-stone-300 dark:border-stone-700">
                    <div className="flex justify-between items-start mb-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-5 w-14 rounded-md" />
                    </div>
                    <Skeleton className="h-3.5 w-40" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Workload + Unpaid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg shadow-card p-5 lg:p-6">
            <Skeleton className="h-5 w-36 mb-5" />
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between py-2">
                  <div>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-1.5 h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pending Estimates + Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg shadow-card p-5 lg:p-6">
            <Skeleton className="h-5 w-36 mb-5" />
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between py-2">
                  <div>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-1.5 h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
