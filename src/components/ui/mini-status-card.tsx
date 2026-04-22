import * as React from "react";

type Accent = "green" | "amber" | "blue" | "red" | "gray";

const ACCENT_BAR: Record<Accent, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  gray: "bg-stone-300 dark:bg-stone-700",
};

const ICON_TINT: Record<Accent, string> = {
  green:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  amber:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  blue:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  red:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  gray:
    "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800",
};

interface MiniStatusCardProps {
  accent: Accent;
  iconAccent?: Accent;
  icon: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Compact horizontal status card with colored left accent, icon tile,
 * title + optional meta row, and right-aligned actions. Used for
 * Inspection / Estimate / Invoice summary rows on the job detail page.
 */
export function MiniStatusCard({
  accent,
  iconAccent,
  icon,
  title,
  meta,
  actions,
  className = "",
}: MiniStatusCardProps) {
  const iconTint = iconAccent ?? accent;
  return (
    <div
      className={`relative flex items-center gap-3 bg-card border border-stone-300 dark:border-stone-800 rounded-lg px-4 py-3 ${className}`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${ACCENT_BAR[accent]}`}
      />
      <div
        className={`w-9 h-9 rounded-md grid place-items-center border flex-none ${ICON_TINT[iconTint]}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-sm font-medium text-stone-900 dark:text-stone-50">
          {title}
        </div>
        {meta && (
          <div className="mt-1 flex items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400 flex-wrap">
            {meta}
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-none">{actions}</div>}
    </div>
  );
}
