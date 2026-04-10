import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ReceivablesLoading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-3 w-28" /><Skeleton className="mt-2 h-8 w-24" /></CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="flex items-center gap-3 py-3"><Skeleton className="h-9 w-48" /><Skeleton className="h-9 w-48" /></CardContent></Card>
      <Card><CardHeader><Skeleton className="h-4 w-40" /></CardHeader><CardContent>{Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="mb-2 h-8 w-full" />))}</CardContent></Card>
    </div>
  );
}
