import { Skeleton } from "@/components/ui/skeleton";

export default function EstimateDetailLoading() {
  return (
    <div className="p-4 lg:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
