"use client";

import { useRouter } from "next/navigation";
import { StatusSelect } from "./status-select";
import { CustomerLink } from "@/components/ui/customer-link";
import {
  formatCustomerName,
  formatVehicle,
  formatCurrencyWhole,
  getInitials,
} from "@/lib/utils/format";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS } from "@/lib/constants";
import { Car, Calendar } from "lucide-react";
import type { JobStatus, DviStatus } from "@/types";

const STATUS_BAR_COLORS: Record<string, string> = {
  not_started: "bg-red-500",
  waiting_for_parts: "bg-amber-500",
  in_progress: "bg-blue-500",
  complete: "bg-green-500",
  paid: "bg-green-500",
};

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
    vehicles: { id: string; year: number | null; make: string | null; model: string | null; license_plate?: string | null } | null;
    users?: { id: string; name: string } | null;
    job_line_items?: { total: number | null }[];
    dvi_inspections?: { status: string } | { status: string }[] | null;
  };
  showStatus?: boolean;
}

function formatMonthDay(dateStr: string): string {
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function JobCard({ job, showStatus = true }: JobCardProps) {
  const router = useRouter();
  const total = (job.job_line_items ?? []).reduce(
    (sum, li) => sum + (li.total ?? 0),
    0
  );
  const accentBar = STATUS_BAR_COLORS[job.status] ?? "bg-stone-300";
  const dviRaw = job.dvi_inspections;
  const dviStatus = (Array.isArray(dviRaw) ? dviRaw[0]?.status : dviRaw?.status) as
    | DviStatus
    | undefined;
  const dviColors = dviStatus ? DVI_STATUS_COLORS[dviStatus] : null;

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-card border border-stone-200 dark:border-stone-800 shadow-card transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 cursor-pointer"
      onClick={() => router.push(`/jobs/${job.id}`)}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${accentBar}`} aria-hidden />

      <div className="pl-3.5 pr-3 py-3 space-y-2.5">
        {/* Header — customer name + status pill */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 leading-tight truncate">
              {job.customers ? (
                <CustomerLink customerId={job.customers.id} stopPropagation>
                  {formatCustomerName(job.customers)}
                </CustomerLink>
              ) : (
                <span className="text-stone-400">No customer</span>
              )}
            </div>
            {job.title && (
              <div className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                {job.title}
              </div>
            )}
          </div>
          {showStatus && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <StatusSelect jobId={job.id} currentStatus={job.status as JobStatus} />
            </div>
          )}
        </div>

        {/* Vehicle — recessed row with plate */}
        {job.vehicles && (
          <div className="flex items-center gap-2 rounded-md bg-stone-50 dark:bg-stone-900/50 border border-stone-100 dark:border-stone-800/60 px-2 py-1.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
              <Car className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate flex-1">
              {formatVehicle(job.vehicles)}
            </span>
            {job.vehicles.license_plate && (
              <span className="text-[11px] font-mono tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                {job.vehicles.license_plate}
              </span>
            )}
          </div>
        )}

        {/* Footer — tech | date + total */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {job.users ? (
              <>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold dark:bg-amber-900/50 dark:text-amber-200">
                  {getInitials(job.users.name)}
                </span>
                <span className="text-xs text-stone-700 dark:text-stone-300 truncate">
                  {job.users.name}
                </span>
              </>
            ) : (
              <span className="text-xs text-stone-400">Unassigned</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
              <Calendar className="h-3 w-3 text-stone-400" />
              <span className="font-mono tabular-nums">{formatMonthDay(job.date_received)}</span>
            </span>
            {total > 0 && (
              <span className="text-sm font-bold text-stone-900 dark:text-stone-50 tabular-nums">
                {formatCurrencyWhole(total)}
              </span>
            )}
          </div>
        </div>

        {dviStatus && dviColors && (
          <div className="flex">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${dviColors.bg} ${dviColors.text}`}>
              DVI {DVI_STATUS_LABELS[dviStatus]}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
