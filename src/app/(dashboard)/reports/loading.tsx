import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ReportsIndexLoading() {
  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-6">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-1 h-4 w-64" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, section) => (
          <div key={section}>
            <Skeleton className="mb-2 h-3 w-20" />
            <div className="space-y-2">
              {Array.from({ length: section === 0 ? 4 : section === 1 ? 3 : 2 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-1 h-3 w-56" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
