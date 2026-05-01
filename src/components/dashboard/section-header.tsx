import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";

interface SectionHeaderProps {
  icon: LucideIcon;
  iconTone?: Accent;
  title: string;
  count?: number;
  /** Optional rendered element shown next to the count (e.g. an "OVERDUE" pill). */
  accent?: ReactNode;
  /** Right-aligned action — typically a "View all" link. */
  actionLabel?: string;
  actionHref?: string;
  /** Right-aligned custom slot — overrides actionLabel/actionHref when set. */
  action?: ReactNode;
}

export function SectionHeader({
  icon: Icon,
  iconTone = "stone",
  title,
  count,
  accent,
  actionLabel,
  actionHref,
  action,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            "w-8 h-8 rounded-md grid place-items-center border flex-none",
            ACCENT_ICON_TINT[iconTone]
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50">{title}</h2>
        {typeof count === "number" && (
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
            {count}
          </span>
        )}
        {accent}
      </div>
      {action ? (
        action
      ) : actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:underline transition-colors"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
