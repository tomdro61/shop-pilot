import { Skeleton } from "@/components/ui/skeleton";

export default function ParkingDetailLoading() {
  return (
    <div className="p-4 lg:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
