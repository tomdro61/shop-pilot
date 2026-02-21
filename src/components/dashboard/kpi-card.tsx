import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  previousValue?: number;
  currentValue?: number;
}

export function KpiCard({
  title,
  value,
  subtitle,
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
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
        {changePercent !== null && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 text-xs font-medium",
              changePercent > 0
                ? "text-emerald-600 dark:text-emerald-400"
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
