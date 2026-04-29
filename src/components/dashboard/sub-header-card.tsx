import Link from "next/link";
import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";

export interface SubHeaderMetric {
  value: string | number;
  label: string;
  /** Optional accent for the value text (e.g. red for "owed", emerald for incoming). */
  tone?: "neutral" | "emerald" | "amber" | "red";
}

interface SubHeaderCardProps {
  icon: LucideIcon;
  tone: Accent;
  title: string;
  tag?: string;
  metrics: SubHeaderMetric[];
  href: string;
  /** Visual mute for empty-state, not a disabled control. */
  muted?: boolean;
  /** Fallback message when metrics is empty (e.g. "No activity today"). */
  emptyMessage?: string;
}

const VALUE_TONE: Record<NonNullable<SubHeaderMetric["tone"]>, string> = {
  neutral: "text-stone-900 dark:text-stone-50",
  emerald: "text-emerald-700 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-red-700 dark:text-red-400",
};

export function SubHeaderCard({
  icon: Icon,
  tone,
  title,
  tag,
  metrics,
  href,
  muted = false,
  emptyMessage,
}: SubHeaderCardProps) {
  const isEmpty = metrics.length === 0;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-stretch gap-3 bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-4 transition-colors",
        "hover:border-stone-300 dark:hover:border-stone-700",
        muted && "opacity-70"
      )}
    >
      <span
        className={cn(
          "w-10 h-10 rounded-md grid place-items-center border flex-none self-start",
          ACCENT_ICON_TINT[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            {title}
          </span>
          {tag && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {tag}
            </span>
          )}
        </div>
        {isEmpty ? (
          <div className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            {emptyMessage ?? "No activity"}
          </div>
        ) : (
          <div className="mt-1.5 flex items-stretch gap-x-4">
            {metrics.map((m, i) => (
              <Fragment key={`${m.label}-${i}`}>
                {i > 0 && (
                  <span
                    aria-hidden
                    className="self-stretch w-px bg-stone-300 dark:bg-stone-700"
                  />
                )}
                <div className="flex flex-col min-w-0">
                  <span
                    className={cn(
                      "font-mono tabular-nums text-lg font-bold leading-none truncate",
                      VALUE_TONE[m.tone ?? "neutral"]
                    )}
                  >
                    {m.value}
                  </span>
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate">
                    {m.label}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 self-center text-stone-400 dark:text-stone-500 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-colors" />
    </Link>
  );
}
