import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusSelect } from "./status-select";
import { formatCustomerName, formatVehicle } from "@/lib/utils/format";
import type { JobStatus } from "@/types";

interface JobCardProps {
  job: {
    id: string;
    status: string;
    title?: string | null;
    category: string | null;
    date_received: string;
    notes: string | null;
    customers: { id: string; first_name: string; last_name: string; phone: string | null } | null;
    vehicles: { id: string; year: number | null; make: string | null; model: string | null } | null;
    users?: { id: string; name: string } | null;
  };
  showStatus?: boolean;
}

export function JobCard({ job, showStatus = true }: JobCardProps) {
  return (
    <Card className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/jobs/${job.id}`} className="min-w-0 flex-1">
            <div>
              {job.customers && (
                <p className="text-sm font-medium leading-tight">
                  {formatCustomerName(job.customers)}
                </p>
              )}
              {job.vehicles && (
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  {formatVehicle(job.vehicles)}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                {job.title && <span>{job.title}</span>}
                {job.users && (
                  <>
                    <span className="text-border">·</span>
                    <span>{job.users.name}</span>
                  </>
                )}
                <span className="text-border">·</span>
                <span className="tabular-nums">{new Date(job.date_received).toLocaleDateString()}</span>
              </div>
            </div>
          </Link>
          {showStatus && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <StatusSelect
                jobId={job.id}
                currentStatus={job.status as JobStatus}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
