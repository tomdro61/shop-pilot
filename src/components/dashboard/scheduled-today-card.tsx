import Link from "next/link";
import { Clock } from "lucide-react";
import { formatTimeEt } from "@/lib/utils";
import type { Job, Customer, Vehicle } from "@/types";

// Derived from the generated supabase row types so a schema rename or
// nullability change becomes a compile error here, not a runtime surprise.
type ScheduledJob = Pick<Job, "id" | "scheduled_at" | "title" | "ro_number"> & {
  customers: Pick<Customer, "first_name" | "last_name"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model"> | null;
};

function customerName(c: ScheduledJob["customers"]): string {
  if (!c) return "(no customer)";
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(no name)";
}

function vehicleLabel(v: ScheduledJob["vehicles"]): string {
  if (!v) return "";
  return [v.year, v.make, v.model].filter(Boolean).join(" ");
}

export function ScheduledTodayCard({ jobs }: { jobs: ScheduledJob[] }) {
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
