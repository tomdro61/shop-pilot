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
        "bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-3 sm:p-4",
        !useIconVariant && accentColor && `border-l-4 ${accentBorderMap[accentColor]}`
      )}
    >
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
      <p className="mt-2 font-mono tabular-nums text-lg sm:text-2xl lg:text-[28px] font-bold tracking-tight text-stone-900 dark:text-stone-50 leading-none">
        {value}
      </p>
      {(subtitle || (changePercent !== null && changeLabel)) && (
        <p className="mt-1.5 text-[10px] sm:text-xs text-stone-500 dark:text-stone-400">
          {subtitle ?? (
            <>
              {changePercent !== null && (
                <span
                  className={cn(
                    "font-mono tabular-nums font-semibold",
                    changePercent > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : changePercent < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-stone-500 dark:text-stone-400"
                  )}
                >
                  {changePercent > 0 ? "+" : ""}
                  {changePercent.toFixed(0)}%
                </span>
              )}
              {changeLabel && <span className="ml-1">{changeLabel}</span>}
            </>
          )}
        </p>
      )}
    </div>
  );
}
