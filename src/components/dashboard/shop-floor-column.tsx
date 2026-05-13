import Link from "next/link";
import {
  CircleDashed,
  Package,
  Wrench,
  Car,
  Clock,
  CircleCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ClickableRow } from "@/components/ui/clickable-row";
import { CustomerLink } from "@/components/ui/customer-link";
import { DaysBadge } from "@/components/ui/days-badge";
import {
  ACCENT_BAR,
  ACCENT_ICON_TINT,
  type Accent,
} from "@/components/ui/mini-status-card";
import {
  formatVehicle,
  formatCustomerName,
  formatRONumber,
  formatCurrencyWhole,
} from "@/lib/utils/format";
import { daysBetween, formatTimeEt } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type ShopFloorStatus =
  | "not_started"
  | "waiting_for_parts"
  | "in_progress"
  | "complete";

interface ShopFloorJob {
  id: string;
  ro_number: number | null;
  title: string | null;
  date_received: string | null;
  scheduled_at: string | null;
  total: number;
  customers: { id: string; first_name: string; last_name: string } | null;
  vehicles: { year: number | null; make: string | null; model: string | null } | null;
  users: { name: string } | null;
}

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  tone: Accent;
  viewAllHref?: string;
  emptyLabel?: string;
}

const SHOP_FLOOR_CONFIG: Record<ShopFloorStatus, StatusConfig> = {
  not_started: {
    label: "Not Started",
    icon: CircleDashed,
    tone: "red",
    viewAllHref: "/jobs?status=not_started",
  },
  waiting_for_parts: {
    label: "Waiting for Parts",
    icon: Package,
    tone: "amber",
    viewAllHref: "/jobs?status=waiting_for_parts",
  },
  in_progress: {
    label: "In Progress",
    icon: Wrench,
    tone: "blue",
    viewAllHref: "/jobs?status=in_progress",
  },
  complete: {
    label: "Completed Today",
    icon: CircleCheck,
    tone: "green",
    emptyLabel: "Nothing yet",
    // No viewAllHref: /jobs filters by date_received, not date_finished,
    // so there is no canonical "all of today's completions" URL to link to.
    // The section already shows the full set; no further drill-down needed.
  },
};

interface ShopFloorColumnProps {
  status: ShopFloorStatus;
  jobs: ShopFloorJob[];
  today: string;
}

export function ShopFloorColumn({ status, jobs, today }: ShopFloorColumnProps) {
  const config = SHOP_FLOOR_CONFIG[status];
  const Icon = config.icon;

  return (
    <div className="h-full rounded-md border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 overflow-hidden flex flex-col">
      <div aria-hidden className={cn("h-[3px] w-full", ACCENT_BAR[config.tone])} />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "w-6 h-6 rounded-md grid place-items-center border flex-none",
              ACCENT_ICON_TINT[config.tone]
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
            {config.label}
          </span>
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
            {jobs.length}
          </span>
        </div>
        {config.viewAllHref && (
          <Link
            href={config.viewAllHref}
            className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:underline transition-colors"
          >
            View all
          </Link>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2">
        {jobs.length === 0 ? (
          <div className="flex items-center justify-center rounded-md border border-dashed border-stone-300 dark:border-stone-700 py-6">
            <p className="text-xs text-stone-400 dark:text-stone-500">
              {config.emptyLabel ?? "None"}
            </p>
          </div>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} today={today} />)
        )}
      </div>
    </div>
  );
}

function JobCard({ job, today }: { job: ShopFloorJob; today: string }) {
  const { customers: customer, vehicles: vehicle } = job;
  const days = daysBetween(job.date_received, today);

  return (
    <ClickableRow
      href={`/jobs/${job.id}`}
      className="flex gap-2 px-3 py-2.5 bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {job.scheduled_at && (
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-md px-1.5 py-0.5 mb-0.5">
            <Clock className="h-3 w-3" aria-hidden />
            {formatTimeEt(job.scheduled_at)}
          </div>
        )}
        <div className="font-mono tabular-nums text-[11px] text-stone-500 dark:text-stone-400 truncate">
          {formatRONumber(job.ro_number)}
        </div>
        <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate leading-tight">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : (
            "Unknown"
          )}
        </div>
        {vehicle && (
          <div className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-stone-300 min-w-0 leading-tight">
            <Car className="h-3 w-3 shrink-0 text-stone-400" />
            <span className="truncate">{formatVehicle(vehicle)}</span>
          </div>
        )}
        {job.title && (
          <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 min-w-0 leading-tight">
            <Wrench className="h-3 w-3 shrink-0 text-stone-400" />
            <span className="truncate">{job.title}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end justify-between shrink-0">
        <DaysBadge days={days} />
        {job.total > 0 && (
          <span className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">
            {formatCurrencyWhole(job.total)}
          </span>
        )}
      </div>
    </ClickableRow>
  );
}
