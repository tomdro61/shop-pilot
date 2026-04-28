import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { JobCard } from "./job-card";
import { JOB_STATUS_ORDER, JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/constants";
import type { JobStatus } from "@/types";

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
  const colors = JOB_STATUS_COLORS[status];

  return (
    <div className={className}>
      <div className="h-full rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
          <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${colors.bg} ${colors.text}`}>
            {JOB_STATUS_LABELS[status]}
          </span>
          <span className="font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
            {jobs.length}
          </span>
        </div>
        <div className="flex-1 p-2 space-y-2">
          {jobs.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-stone-300 dark:border-stone-700 py-6">
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
