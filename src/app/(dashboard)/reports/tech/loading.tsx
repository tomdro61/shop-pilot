import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function TechScoreboardLoading() {
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex items-center gap-3 py-3"><Skeleton className="h-9 w-[200px]" /><Skeleton className="h-9 w-[180px]" /><Skeleton className="h-9 w-48" /></CardContent></Card>
      <Card><CardHeader className="pb-2"><Skeleton className="h-4 w-40" /></CardHeader><CardContent><Skeleton className="h-[350px] w-full" /></CardContent></Card>
      <Card><CardHeader><Skeleton className="h-4 w-56" /></CardHeader><CardContent>{Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="mb-2 h-8 w-full" />))}</CardContent></Card>
    </div>
  );
}
