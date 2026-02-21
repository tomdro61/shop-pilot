import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-8">
      {/* Quick Actions */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>

      {/* Zone 1 — Revenue */}
      <section>
        <Skeleton className="mb-3 h-3.5 w-20" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-l-[3px] border-l-emerald-500 bg-card p-4 dark:border-l-emerald-400">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-10 w-28" />
            </div>
          ))}
        </div>
      </section>

      {/* Zone 2 — Right Now */}
      <section className="-mx-4 px-4 py-6 lg:-mx-6 lg:px-6 bg-blue-50/60 dark:bg-blue-950/20 border-y border-blue-100 dark:border-blue-900/30">
        <Skeleton className="mb-4 h-3.5 w-24 bg-blue-200/50 dark:bg-blue-800/30" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <Skeleton className="h-3 w-20 mb-3" />
            <div className="flex items-center gap-5">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
          <div className="rounded-xl border bg-card shadow-sm">
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
      </section>

      {/* Zone 3 — Recent Jobs */}
      <section>
        <Card>
          <CardHeader className="border-b px-5 py-3">
            <Skeleton className="h-3.5 w-24" />
          </CardHeader>
          <CardContent className="p-0">
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
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
