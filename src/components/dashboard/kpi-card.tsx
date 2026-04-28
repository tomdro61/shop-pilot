import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "@/components/ui/section-card";

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
    <div
      className={cn(
        "bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm p-4",
        accentColor && `border-l-4 ${accentBorderMap[accentColor]}`
      )}
    >
      <p className={SECTION_LABEL}>{title}</p>
      <p className="mt-2 font-mono tabular-nums text-2xl lg:text-3xl font-bold text-stone-900 dark:text-stone-50">
        {value}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>
      )}
      {changePercent !== null && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
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
          <span className="text-xs text-stone-500 dark:text-stone-400">vs prior</span>
        </div>
      )}
    </div>
  );
}
