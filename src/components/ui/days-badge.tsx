import { cn } from "@/lib/utils";

interface DaysBadgeProps {
  days: number;
  warnAt?: number;
  className?: string;
}

export function DaysBadge({ days, warnAt = 3, className }: DaysBadgeProps) {
  const tier =
    days >= 7
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      : days >= warnAt
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
        : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono tabular-nums px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap",
        tier,
        className,
      )}
    >
      {days}d
    </span>
  );
}
