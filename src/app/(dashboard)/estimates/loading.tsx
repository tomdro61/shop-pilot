import { Skeleton } from "@/components/ui/skeleton";

export default function EstimatesLoading() {
  return (
    <div className="p-4 lg:p-10">
      <div className="mb-4 flex items-center gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
