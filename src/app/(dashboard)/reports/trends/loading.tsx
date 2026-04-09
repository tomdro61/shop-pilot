import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function TrendsLoading() {
  return (
    <div className="p-4 lg:p-10">
      <div className="mb-6">
        <Skeleton className="mb-2 h-8 w-36" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-1 h-4 w-64" />
      </div>
      {/* Controls skeleton */}
      <Card className="mb-4">
        <CardContent className="flex items-center gap-3 py-3">
          <Skeleton className="h-9 w-[220px]" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="ml-auto h-8 w-32" />
        </CardContent>
      </Card>
      {/* Chart skeleton */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
