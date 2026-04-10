import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function RevenueReportLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-9 w-96" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-2 h-8 w-20" /></CardContent></Card>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-2 h-8 w-20" /></CardContent></Card>
        ))}
      </div>
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardHeader><Skeleton className="h-4 w-52" /></CardHeader><CardContent><Skeleton className="h-[200px] w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
