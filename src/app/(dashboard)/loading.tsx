import { Skeleton } from "@/components/ui/skeleton";

// Fallback for dashboard routes with no loading.tsx of their own or in a
// parent folder, so a click paints something inside the shell instead of
// freezing until the page's data arrives. Routes with a closer loading.tsx
// keep theirs.
export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-10">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
