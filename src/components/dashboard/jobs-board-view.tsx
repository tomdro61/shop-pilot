import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { JobCard } from "./job-card";
import { JOB_STATUS_ORDER, JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/constants";
import type { JobStatus } from "@/types";

type JobRow = {
  id: string;
  status: string;
  category: string | null;
  date_received: string;
  notes: string | null;
  customers: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicles: { id: string; year: number | null; make: string | null; model: string | null } | null;
  users?: { id: string; name: string } | null;
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
      <div className="hidden lg:grid lg:grid-cols-5 lg:gap-4">
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
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <Badge
              variant="outline"
              className={`${colors.bg} ${colors.text} ${colors.border}`}
            >
              {JOB_STATUS_LABELS[status]}
            </Badge>
            <span className="text-muted-foreground">{jobs.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No jobs
            </p>
          ) : (
            jobs.map((job) => (
              <JobCard key={job.id} job={job} showStatus={false} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
