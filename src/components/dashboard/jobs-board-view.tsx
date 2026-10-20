"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleDashed, Package, Wrench, CheckCircle2, Ban } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { JobCard } from "./job-card";
import { ACCENT_BAR, ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";
import { JOB_STATUS_LABELS } from "@/lib/constants";
import { loadMoreJobs } from "@/lib/actions/jobs";
import type { JobCursor, JobFilters } from "@/lib/jobs/paging";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

const STATUS_TONE: Record<JobStatus, Accent> = {
  not_started: "red",
  waiting_for_parts: "amber",
  in_progress: "blue",
  complete: "green",
  cancelled: "stone",
};

const STATUS_ICON: Record<JobStatus, LucideIcon> = {
  not_started: CircleDashed,
  waiting_for_parts: Package,
  in_progress: Wrench,
  complete: CheckCircle2,
  cancelled: Ban,
};

type JobRow = {
  id: string;
  status: string;
  title?: string | null;
  category: string | null;
  date_received: string;
  notes: string | null;
  customers: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicles: { id: string; year: number | null; make: string | null; model: string | null; license_plate?: string | null } | null;
  users?: { id: string; name: string } | null;
  job_line_items?: { total: number | null }[];
  dvi_inspections?: { status: string } | { status: string }[] | null;
};

export type BoardColumnData = {
  status: JobStatus;
  jobs: JobRow[];
  nextCursor: JobCursor | null;
  totalCount: number;
  pageSize: number;
};

interface JobsBoardViewProps {
  columns: BoardColumnData[];
  filters: JobFilters;
}

type ColumnState = {
  status: JobStatus;
  rows: JobRow[];
  cursor: JobCursor | null;
  totalCount: number;
  pageSize: number;
};

// Paging state lives here rather than in BoardColumn because each column is
// rendered twice (mobile scroller and desktop grid) and both copies must show
// the same loaded rows. Mount with a key derived from the filters so a filter
// change starts over; the server-rendered `columns` stay the source of truth
// for each column's first page.
export function JobsBoardView({ columns, filters }: JobsBoardViewProps) {
  const [extra, setExtra] = useState<Partial<Record<JobStatus, JobRow[]>>>({});
  const [cursors, setCursors] = useState<Partial<Record<JobStatus, JobCursor | null>>>({});
  const [loadingStatus, setLoadingStatus] = useState<JobStatus | null>(null);
  const [, startTransition] = useTransition();

  const state: ColumnState[] = columns.map((column) => {
    const seen = new Set(column.jobs.map((job) => job.id));
    const more = (extra[column.status] ?? []).filter((job) => !seen.has(job.id));
    const cursor =
      column.status in cursors ? (cursors[column.status] ?? null) : column.nextCursor;
    return {
      status: column.status,
      rows: [...column.jobs, ...more],
      cursor,
      totalCount: column.totalCount,
      pageSize: column.pageSize,
    };
  });

  function loadMore(column: ColumnState) {
    if (loadingStatus !== null || column.cursor === null) return;
    const cursor = column.cursor;
    setLoadingStatus(column.status);
    startTransition(async () => {
      try {
        const result = await loadMoreJobs({
          filters: { ...filters, status: column.status },
          cursor,
          limit: column.pageSize,
        });
        setExtra((prev) => ({
          ...prev,
          [column.status]: [...(prev[column.status] ?? []), ...result.jobs],
        }));
        setCursors((prev) => ({ ...prev, [column.status]: result.nextCursor }));
      } catch {
        toast.error("Couldn't load more jobs. Try again.");
      } finally {
        setLoadingStatus(null);
      }
    });
  }

  return (
    <>
      {/* Mobile: Horizontal scroll */}
      <div className="lg:hidden">
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4">
            {state.map((column) => (
              <BoardColumn
                key={column.status}
                column={column}
                loading={loadingStatus === column.status}
                onLoadMore={() => loadMore(column)}
                className="w-[85vw] shrink-0"
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Desktop: Grid */}
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4">
        {state.map((column) => (
          <BoardColumn
            key={column.status}
            column={column}
            loading={loadingStatus === column.status}
            onLoadMore={() => loadMore(column)}
          />
        ))}
      </div>
    </>
  );
}

function BoardColumn({
  column,
  loading,
  onLoadMore,
  className,
}: {
  column: ColumnState;
  loading: boolean;
  onLoadMore: () => void;
  className?: string;
}) {
  const { status, rows, cursor, totalCount } = column;
  const tone = STATUS_TONE[status];
  const Icon = STATUS_ICON[status];

  return (
    <div className={className}>
      <div className="h-full rounded-md border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 overflow-hidden flex flex-col">
        <div aria-hidden className={`h-[3px] w-full ${ACCENT_BAR[tone]}`} />
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "w-6 h-6 rounded-md grid place-items-center border flex-none",
                ACCENT_ICON_TINT[tone]
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
              {JOB_STATUS_LABELS[status]}
            </span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
              {totalCount.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex-1 p-2 space-y-2">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center rounded-md border border-dashed border-stone-300 dark:border-stone-700 py-6">
              <p className="text-xs text-stone-400 dark:text-stone-500">Empty</p>
            </div>
          ) : (
            rows.map((job) => (
              <JobCard key={job.id} job={job} />
            ))
          )}
          <LoadMoreButton
            hasMore={cursor !== null}
            loading={loading}
            onClick={onLoadMore}
            shown={rows.length}
            total={totalCount}
            noun="jobs"
          />
        </div>
      </div>
    </div>
  );
}
