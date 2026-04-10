import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function IncomeLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Card>
        <CardHeader><Skeleton className="h-4 w-48" /></CardHeader>
        <CardContent>{Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="mb-2 h-8 w-full" />))}</CardContent>
      </Card>
    </div>
  );
}
