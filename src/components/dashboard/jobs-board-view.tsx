import { CircleDashed, Package, Wrench, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { JobCard } from "./job-card";
import { ACCENT_BAR, ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";
import { JOB_STATUS_ORDER, JOB_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

const STATUS_TONE: Record<JobStatus, Accent> = {
  not_started: "red",
  waiting_for_parts: "amber",
  in_progress: "blue",
  complete: "green",
};

const STATUS_ICON: Record<JobStatus, LucideIcon> = {
  not_started: CircleDashed,
  waiting_for_parts: Package,
  in_progress: Wrench,
  complete: CheckCircle2,
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

interface JobsBoardViewProps {
  jobs: JobRow[];
}

export function JobsBoardView({ jobs }: JobsBoardViewProps) {
  const jobsByStatus = JOB_STATUS_ORDER.map((status) => ({
    status,
    jobs: jobs.filter((j) => j.status === status),
  }));

  return (
    <>
      {/* Mobile: Horizontal scroll */}
      <div className="lg:hidden">
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4">
            {jobsByStatus.map(({ status, jobs: statusJobs }) => (
              <BoardColumn
                key={status}
                status={status}
                jobs={statusJobs}
                className="w-[85vw] shrink-0"
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Desktop: Grid */}
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4">
        {jobsByStatus.map(({ status, jobs: statusJobs }) => (
          <BoardColumn key={status} status={status} jobs={statusJobs} />
        ))}
      </div>
    </>
  );
}

function BoardColumn({
  status,
  jobs,
  className,
}: {
  status: JobStatus;
  jobs: JobRow[];
  className?: string;
}) {
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
              {jobs.length}
            </span>
          </div>
        </div>
        <div className="flex-1 p-2 space-y-2">
          {jobs.length === 0 ? (
            <div className="flex items-center justify-center rounded-md border border-dashed border-stone-300 dark:border-stone-700 py-6">
              <p className="text-xs text-stone-400 dark:text-stone-500">Empty</p>
            </div>
          ) : (
            jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
