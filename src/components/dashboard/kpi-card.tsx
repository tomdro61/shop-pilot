import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  previousValue?: number;
  currentValue?: number;
  accentColor?: "blue" | "emerald" | "amber" | "purple";
}

const accentBorderMap = {
  blue: "border-l-blue-500",
  emerald: "border-l-emerald-500",
  amber: "border-l-amber-500",
  purple: "border-l-purple-500",
} as const;

export function KpiCard({
  title,
  value,
  subtitle,
  previousValue,
  currentValue,
  accentColor,
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
    <Card className={accentColor ? `border-l-4 ${accentBorderMap[accentColor]}` : undefined}>
      <CardContent className="p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
          {title}
        </p>
        <p className="mt-2 text-3xl lg:text-4xl font-extrabold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
        {changePercent !== null && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                changePercent > 0
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : changePercent < 0
                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
              )}
            >
              {changePercent > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : changePercent < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {changePercent > 0 ? "+" : ""}
              {changePercent.toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground">vs prior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
