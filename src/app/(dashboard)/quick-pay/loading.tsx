import { Skeleton } from "@/components/ui/skeleton";

export default function QuickPayLoading() {
  return (
    <div className="p-4 lg:p-10 space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-md" />
    </div>
  );
}
