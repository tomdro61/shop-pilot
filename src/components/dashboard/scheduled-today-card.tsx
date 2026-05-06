import Link from "next/link";
import { Clock } from "lucide-react";

interface ScheduledJob {
  id: string;
  scheduled_at: string | null;
  title: string | null;
  ro_number: number | null;
  customers: { first_name: string | null; last_name: string | null } | null;
  vehicles: { year: number | null; make: string | null; model: string | null } | null;
}

function formatTimeEt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function customerName(c: ScheduledJob["customers"]): string {
  if (!c) return "(no customer)";
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(no name)";
}

function vehicleLabel(v: ScheduledJob["vehicles"]): string {
  if (!v) return "";
  return [v.year, v.make, v.model].filter(Boolean).join(" ");
}

export function ScheduledTodayCard({ jobs }: { jobs: ScheduledJob[] }) {
  // Empty state is intentional: the strip hides entirely so the dashboard
  // doesn't gain a permanent "No scheduled jobs" sliver. Manager only sees
  // it on days where there's something to look at.
  if (jobs.length === 0) return null;

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Scheduled · Today
        </span>
        <span className="font-mono tabular-nums text-[11px] font-semibold text-stone-500 dark:text-stone-400">
          {jobs.length}
        </span>
      </div>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {jobs.map((job) => {
          const time = job.scheduled_at ? formatTimeEt(job.scheduled_at) : "";
          const v = vehicleLabel(job.vehicles);
          const t = job.title?.trim() || "";
          return (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50 min-w-[5.5rem]">
                  <Clock className="h-3.5 w-3.5 text-stone-400" aria-hidden />
                  {time}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                    {customerName(job.customers)}
                    {v ? <span className="text-stone-500 dark:text-stone-400 font-normal"> · {v}</span> : null}
                  </span>
                  {t ? (
                    <span className="block text-xs text-stone-500 dark:text-stone-400 truncate">
                      {t}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
