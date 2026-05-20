import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="p-4 lg:p-10 space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
