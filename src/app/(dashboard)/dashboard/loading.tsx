import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Quick Actions */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>

      {/* Revenue Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-8 w-24" />
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      {/* Shop Floor */}
      <div>
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="border-b px-5 py-3">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="p-0">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between border-b px-5 py-3 last:border-0">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
