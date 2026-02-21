import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusSelect } from "./status-select";
import { formatCustomerName, formatVehicle } from "@/lib/utils/format";
import type { JobStatus } from "@/types";

interface JobCardProps {
  job: {
    id: string;
    status: string;
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
    <Card className="transition-colors hover:bg-accent">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/jobs/${job.id}`} className="min-w-0 flex-1">
            <div>
              {job.customers && (
                <p className="font-medium">
                  {formatCustomerName(job.customers)}
                </p>
              )}
              {job.vehicles && (
                <p className="text-sm text-muted-foreground">
                  {formatVehicle(job.vehicles)}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {job.category && <span>{job.category}</span>}
                {job.users && <span>{job.users.name}</span>}
                <span>{new Date(job.date_received).toLocaleDateString()}</span>
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
