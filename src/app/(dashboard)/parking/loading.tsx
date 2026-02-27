import { Skeleton } from "@/components/ui/skeleton";

export default function ParkingLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Tabs skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-8 w-52" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>

      {/* Sections */}
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-2">
            {[...Array(3)].map((_, j) => (
              <Skeleton key={j} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
