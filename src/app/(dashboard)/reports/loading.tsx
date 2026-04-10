import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ReportsOverviewLoading() {
  return (
    <div>
      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-3 w-28" /><Skeleton className="mt-2 h-8 w-24" /></CardContent></Card>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-3 w-28" /><Skeleton className="mt-2 h-8 w-16" /></CardContent></Card>
        ))}
      </div>
      {/* Mini chart */}
      <Card className="mb-6">
        <CardHeader className="pb-1"><Skeleton className="h-4 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-[200px] w-full" /></CardContent>
      </Card>
      {/* Mini tables */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-4 w-40" /></CardHeader>
            <CardContent>{Array.from({ length: 5 }).map((_, j) => (<Skeleton key={j} className="mb-2 h-6 w-full" />))}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
