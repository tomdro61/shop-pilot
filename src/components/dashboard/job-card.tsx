"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { StatusSelect } from "./status-select";
import { CustomerLink } from "@/components/ui/customer-link";
import { DaysBadge } from "@/components/ui/days-badge";
import {
  formatCustomerName,
  formatVehicle,
  formatDate,
} from "@/lib/utils/format";
import { todayET, daysBetween } from "@/lib/utils";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS } from "@/lib/constants";
import { Car, Wrench, User, Calendar } from "lucide-react";
import type { JobStatus, DviStatus } from "@/types";

interface JobCardProps {
  job: {
    id: string;
    status: string;
    title?: string | null;
    category: string | null;
    ro_number?: number | null;
    date_received: string;
    notes: string | null;
    customers: { id: string; first_name: string; last_name: string; phone: string | null } | null;
    vehicles: { id: string; year: number | null; make: string | null; model: string | null } | null;
    users?: { id: string; name: string } | null;
    dvi_inspections?: { status: string }[];
  };
  showStatus?: boolean;
}

export function JobCard({ job, showStatus = true }: JobCardProps) {
  const router = useRouter();
  const days = daysBetween(job.date_received, todayET());
  const dviStatus = job.dvi_inspections?.[0]?.status as DviStatus | undefined;
  const dviColors = dviStatus ? DVI_STATUS_COLORS[dviStatus] : null;

  return (
    <Card
      className="transition-colors hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
      onClick={() => router.push(`/jobs/${job.id}`)}
    >
      <CardContent className="p-3.5 space-y-2">
        {/* Header — customer left, vital signs right */}
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 leading-tight min-w-0 flex-1 truncate">
            {job.customers ? (
              <CustomerLink customerId={job.customers.id} stopPropagation>
                {formatCustomerName(job.customers)}
              </CustomerLink>
            ) : (
              <span className="text-stone-400">No customer</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <DaysBadge days={days} />
            {showStatus && (
              <StatusSelect jobId={job.id} currentStatus={job.status as JobStatus} />
            )}
          </div>
        </div>

        {/* Body — vehicle / title */}
        <div className="space-y-1">
          {job.vehicles && (
            <div className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-stone-300 min-w-0">
              <Car className="h-3 w-3 shrink-0 text-stone-400" />
              <span className="truncate">{formatVehicle(job.vehicles)}</span>
            </div>
          )}
          {job.title && (
            <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 min-w-0">
              <Wrench className="h-3 w-3 shrink-0 text-stone-400" />
              <span className="truncate">{job.title}</span>
            </div>
          )}
        </div>

        {/* Footer — operational meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 border-t border-stone-100 dark:border-stone-800/60 text-[11px] text-stone-500 dark:text-stone-400">
          {job.users && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3 text-stone-400" />
              <span>{job.users.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-stone-400" />
            <span className="font-mono tabular-nums">{formatDate(job.date_received)}</span>
          </div>
          {dviStatus && dviColors && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${dviColors.bg} ${dviColors.text}`}>
              DVI {DVI_STATUS_LABELS[dviStatus]}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
