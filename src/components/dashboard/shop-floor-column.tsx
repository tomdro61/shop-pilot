import Link from "next/link";
import {
  CircleDashed,
  Package,
  Wrench,
  Car,
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
import { daysBetween } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type ShopFloorStatus = "not_started" | "waiting_for_parts" | "in_progress";

interface ShopFloorJob {
  id: string;
  ro_number: number | null;
  status: string;
  title: string | null;
  date_received: string | null;
  total: number;
  customers: { id: string; first_name: string; last_name: string } | null;
  vehicles: { year: number | null; make: string | null; model: string | null } | null;
  users: { name: string } | null;
}

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  tone: Accent;
  queryKey: string;
}

const SHOP_FLOOR_CONFIG: Record<ShopFloorStatus, StatusConfig> = {
  not_started: {
    label: "Not Started",
    icon: CircleDashed,
    tone: "stone",
    queryKey: "not_started",
  },
  waiting_for_parts: {
    label: "Waiting for Parts",
    icon: Package,
    tone: "amber",
    queryKey: "waiting_for_parts",
  },
  in_progress: {
    label: "In Progress",
    icon: Wrench,
    tone: "blue",
    queryKey: "in_progress",
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
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <div aria-hidden className={cn("h-[3px] w-full", ACCENT_BAR[config.tone])} />
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
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
        <Link
          href={`/jobs?status=${config.queryKey}`}
          className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:underline transition-colors"
        >
          View all
        </Link>
      </div>
      {jobs.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-stone-400 dark:text-stone-500">
          None
        </div>
      ) : (
        <div>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, today }: { job: ShopFloorJob; today: string }) {
  const { customers: customer, vehicles: vehicle } = job;
  const days = daysBetween(job.date_received, today);

  return (
    <ClickableRow
      href={`/jobs/${job.id}`}
      className="flex gap-2 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
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
