import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";

type KpiVisual =
  | { icon: LucideIcon; tone?: Accent; accentColor?: never }
  | { icon?: never; tone?: never; accentColor?: "blue" | "emerald" | "amber" | "purple" };

type KpiCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  previousValue?: number;
  currentValue?: number;
  /** Override the percent comparison computed from previousValue / currentValue. */
  changePercent?: number;
  /** Label displayed under the value when present (e.g. "vs last week"). When omitted, no subtitle row renders even if a delta chip is shown. */
  changeLabel?: string;
} & KpiVisual;

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
  icon: Icon,
  tone,
  changePercent: changePercentProp,
  changeLabel,
}: KpiCardProps) {
  let changePercent: number | null = changePercentProp ?? null;

  if (changePercent === null && previousValue !== undefined && currentValue !== undefined) {
    if (previousValue === 0 && currentValue === 0) {
      changePercent = 0;
    } else if (previousValue === 0) {
      changePercent = 100;
    } else {
      changePercent = ((currentValue - previousValue) / previousValue) * 100;
    }
  }

  const useIconVariant = Boolean(Icon);

  return (
    <div
      className={cn(
        "bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-4",
        !useIconVariant && accentColor && `border-l-4 ${accentBorderMap[accentColor]}`
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {useIconVariant && Icon && (
            <span
              className={cn(
                "w-8 h-8 rounded-md grid place-items-center border flex-none",
                ACCENT_ICON_TINT[tone ?? "stone"]
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          <p className={cn(SECTION_LABEL, "truncate")}>{title}</p>
        </div>
        {changePercent !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shrink-0",
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
        )}
      </div>
      <p className="mt-2 font-mono tabular-nums text-2xl lg:text-[28px] font-bold tracking-tight text-stone-900 dark:text-stone-50 leading-none">
        {value}
      </p>
      {(subtitle || changeLabel) && (
        <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
          {subtitle ?? changeLabel}
        </p>
      )}
    </div>
  );
}
