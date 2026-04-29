import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";

interface SubHeaderCardProps {
  icon: LucideIcon;
  tone: Accent;
  title: string;
  tag?: string;
  content: ReactNode;
  href: string;
  /** Visual mute for empty-state, not a disabled control. */
  muted?: boolean;
}

export function SubHeaderCard({
  icon: Icon,
  tone,
  title,
  tag,
  content,
  href,
  muted = false,
}: SubHeaderCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-4 transition-colors",
        "hover:border-stone-300 dark:hover:border-stone-700",
        muted && "opacity-70"
      )}
    >
      <span
        className={cn(
          "w-10 h-10 rounded-md grid place-items-center border flex-none",
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
        <div className="mt-0.5 text-sm text-stone-600 dark:text-stone-300 truncate">
          {content}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-colors" />
    </Link>
  );
}
