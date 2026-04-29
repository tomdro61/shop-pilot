import { cn } from "@/lib/utils";

interface DaysBadgeProps {
  days: number;
  /** Day count at which the amber "aging" tier kicks in. Default 3. */
  warnAt?: number;
  /** Day count at which the red "overdue" tier kicks in. Default 7. */
  overdueAt?: number;
  /** "short" → "5d" (default). "label" → "5D AGING" / "2D OVERDUE" / "ON TIME" / "TODAY". */
  format?: "short" | "label";
  className?: string;
}

export function DaysBadge({
  days,
  warnAt = 3,
  overdueAt = 7,
  format = "short",
  className,
}: DaysBadgeProps) {
  const tier =
    days >= overdueAt
      ? "overdue"
      : days >= warnAt
        ? "aging"
        : "fresh";

  const tone =
    tier === "overdue"
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      : tier === "aging"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400";

  const text =
    format === "short"
      ? `${days}d`
      : tier === "overdue"
        ? `${days}D OVERDUE`
        : tier === "aging"
          ? `${days}D AGING`
          : days === 0
            ? "TODAY"
            : `${days}D`;

  const sizing =
    format === "short"
      ? "px-1.5 py-0.5 text-[11px] rounded"
      : "px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-full";

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono tabular-nums font-medium whitespace-nowrap",
        sizing,
        tone,
        className,
      )}
    >
      {text}
    </span>
  );
}
