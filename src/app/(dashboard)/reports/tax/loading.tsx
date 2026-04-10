import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function TaxReportLoading() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-3 w-28" /><Skeleton className="mt-2 h-8 w-24" /></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><Skeleton className="h-4 w-48" /></CardHeader><CardContent><Skeleton className="h-[400px] w-full" /></CardContent></Card>
    </div>
  );
}
