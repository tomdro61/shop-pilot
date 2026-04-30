"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Inbox } from "lucide-react";
import { DaysBadge } from "@/components/ui/days-badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { CustomerLink } from "@/components/ui/customer-link";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils/format";
import { SectionHeader } from "@/components/dashboard/section-header";
import {
  OPEN_LOOP_CATEGORIES,
  OPEN_LOOP_CATEGORY_ORDER,
  countByCategory,
  countOverdue,
  type OpenLoop,
  type OpenLoopCategory,
} from "@/lib/dashboard/open-loops";

interface OpenLoopsProps {
  loops: OpenLoop[];
  /** Max rows to show inline before "View all" overflow. */
  maxVisible?: number;
}

type Filter = "all" | OpenLoopCategory;

export function OpenLoops({ loops, maxVisible = 6 }: OpenLoopsProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => countByCategory(loops), [loops]);
  const overdueCount = useMemo(() => countOverdue(loops), [loops]);

  const filtered = useMemo(
    () => (filter === "all" ? loops : loops.filter((l) => l.category === filter)),
    [filter, loops]
  );
  const visible = filtered.slice(0, maxVisible);
  const overflow = filtered.length - visible.length;

  return (
    <section>
      <SectionHeader
        icon={Inbox}
        iconTone="blue"
        title="Open Loops"
        count={loops.length}
        accent={
          overdueCount > 0 ? (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 uppercase tracking-wider tabular-nums">
              +{overdueCount} OVERDUE
            </span>
          ) : null
        }
      />

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-stone-200 dark:border-stone-800 overflow-x-auto">
        <FilterChip
          active={filter === "all"}
          label="All"
          count={loops.length}
          onClick={() => setFilter("all")}
        />
        {OPEN_LOOP_CATEGORY_ORDER.map((id) => {
          const cat = OPEN_LOOP_CATEGORIES[id];
          return (
            <FilterChip
              key={id}
              active={filter === id}
              label={cat.label}
              count={counts[id]}
              dotClass={cat.dotClass}
              activeChipClass={cat.activeChipClass}
              onClick={() => setFilter(id)}
            />
          );
        })}
      </div>

      <div>
        {visible.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-stone-500 dark:text-stone-400">
            <Inbox className="h-6 w-6 mx-auto mb-2 text-stone-300 dark:text-stone-600" />
            All caught up — no open loops in this view
          </div>
        ) : (
          visible.map((loop) => <OpenLoopRow key={loop.id} loop={loop} />)
        )}
      </div>

      {overflow > 0 && (
        <div className="px-4 py-2 border-t border-stone-200 dark:border-stone-800 text-right">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            +{overflow} more in this view
          </span>
        </div>
      )}
      </div>
    </section>
  );
}

function FilterChip({
  active,
  label,
  count,
  dotClass,
  activeChipClass,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dotClass?: string;
  activeChipClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium border whitespace-nowrap transition-colors",
        active
          ? activeChipClass ??
              "bg-stone-100 text-stone-900 border-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-700"
          : "border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-200 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:border-stone-700"
      )}
    >
      {dotClass && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden />}
      <span>{label}</span>
      <span className="tabular-nums text-stone-500 dark:text-stone-500">{count}</span>
    </button>
  );
}

function OpenLoopRow({ loop }: { loop: OpenLoop }) {
  const category = OPEN_LOOP_CATEGORIES[loop.category];
  const Icon = category.icon;

  return (
    <ClickableRow
      href={loop.href}
      className="flex items-center gap-3 px-4 h-14 border-b border-stone-200 dark:border-stone-800 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider whitespace-nowrap shrink-0 w-[96px] justify-center",
          category.activeChipClass
        )}
      >
        <Icon className="h-3 w-3" />
        {category.shortLabel}
      </span>
      <span className="w-7 h-7 rounded-md grid place-items-center bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 text-[10px] font-bold flex-none">
        {loop.customerName ? getInitials(loop.customerName) : "?"}
      </span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {loop.customerName ? (
          loop.customerId ? (
            <CustomerLink
              customerId={loop.customerId}
              stopPropagation
              className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate hover:underline shrink-0"
            >
              {loop.customerName}
            </CustomerLink>
          ) : (
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate shrink-0">
              {loop.customerName}
            </span>
          )
        ) : (
          <span className="text-sm font-semibold text-stone-400 dark:text-stone-500 truncate italic shrink-0">
            New contact
          </span>
        )}
        {loop.vehicleLabel && (
          <span className="text-xs text-stone-500 dark:text-stone-400 shrink-0">
            · {loop.vehicleLabel}
          </span>
        )}
        <span className="text-xs text-stone-600 dark:text-stone-300 truncate min-w-0">
          {loop.summary}
        </span>
      </div>
      <DaysBadge
        days={loop.ageDays}
        warnAt={category.warnAt}
        overdueAt={category.overdueAt}
        format="label"
        className="shrink-0"
      />
      <button
        type="button"
        disabled
        aria-disabled
        title="Coming soon"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className="text-xs text-stone-400 dark:text-stone-500 cursor-not-allowed shrink-0"
      >
        Snooze
      </button>
      <button
        type="button"
        disabled
        aria-disabled
        title="Coming soon"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className="text-xs text-stone-400 dark:text-stone-500 cursor-not-allowed shrink-0"
      >
        Dismiss
      </button>
      <Link
        href={loop.href}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Resolve: ${loop.summary}`}
        className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 px-3 py-1 rounded-md shrink-0 transition-colors"
      >
        Resolve
      </Link>
    </ClickableRow>
  );
}
