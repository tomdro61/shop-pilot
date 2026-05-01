import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";

interface KpiCompactCardProps {
  label: string;
  icon: LucideIcon;
  tone?: Accent;
  today: number;
  todaySub?: string;
  week: number;
  weekSub?: string;
  month: number;
  monthSub?: string;
}

export function KpiCompactCard({
  label,
  icon: Icon,
  tone = "stone",
  today,
  todaySub,
  week,
  weekSub,
  month,
  monthSub,
}: KpiCompactCardProps) {
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span
          className={cn(
            "w-7 h-7 rounded-md grid place-items-center border flex-none",
            ACCENT_ICON_TINT[tone]
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-stone-100 dark:divide-stone-800">
        <Cell label="Today" primary value={today} sub={todaySub} />
        <Cell label="Week" value={week} sub={weekSub} />
        <Cell label="Month" value={month} sub={monthSub} />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  primary = false,
}: {
  label: string;
  value: number;
  sub?: string;
  primary?: boolean;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </div>
      <div
        className={cn(
          "font-mono tabular-nums leading-none mt-1 text-stone-900 dark:text-stone-50",
          primary ? "text-lg font-bold" : "text-sm font-semibold"
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="font-mono tabular-nums text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}
