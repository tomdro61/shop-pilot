import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  previousValue?: number;
  currentValue?: number;
}

export function KpiCard({
  title,
  value,
  previousValue,
  currentValue,
}: KpiCardProps) {
  let changePercent: number | null = null;

  if (previousValue !== undefined && currentValue !== undefined) {
    if (previousValue === 0 && currentValue === 0) {
      changePercent = 0;
    } else if (previousValue === 0) {
      changePercent = 100;
    } else {
      changePercent = ((currentValue - previousValue) / previousValue) * 100;
    }
  }

  return (
    <Card className="shadow-[var(--glow-md)]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {changePercent !== null && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-xs",
              changePercent > 0
                ? "text-green-600 dark:text-green-400"
                : changePercent < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
            )}
          >
            {changePercent > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : changePercent < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span>
              {changePercent > 0 ? "+" : ""}
              {changePercent.toFixed(0)}% vs prior
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
