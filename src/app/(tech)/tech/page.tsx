import { getTechJobs } from "@/lib/actions/dvi";
import { formatVehicle, formatRONumber } from "@/lib/utils/format";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS } from "@/lib/constants";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { DviStatus } from "@/types";

export const metadata = { title: "My Jobs | ShopPilot" };

export default async function TechJobListPage() {
  const jobs = await getTechJobs();

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
          Active Jobs
        </h2>
        <p className="text-sm text-muted-foreground">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} assigned to you
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardCheck className="mb-3 h-12 w-12 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-semibold text-stone-500 dark:text-stone-400">
            No active jobs
          </p>
          <p className="text-xs text-muted-foreground">
            Jobs assigned to you will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const vehicle = job.vehicles;
            const dviStatus = job.dvi_status as DviStatus | null;

            return (
              <Link key={job.id} href={`/tech/${job.id}`}>
                <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 active:bg-stone-50 dark:active:bg-stone-800 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-50 truncate">
                      {vehicle ? formatVehicle(vehicle) : "No Vehicle"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.ro_number ? `${formatRONumber(job.ro_number)} — ` : ""}
                      {job.title || "Job"}
                    </p>
                    {job.customers && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {job.customers.first_name} {job.customers.last_name}
                      </p>
                    )}
                  </div>
                  <div className="ml-3 flex items-center gap-2 shrink-0">
                    {dviStatus ? (
                      <span
                        className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${DVI_STATUS_COLORS[dviStatus].bg} ${DVI_STATUS_COLORS[dviStatus].text}`}
                      >
                        {DVI_STATUS_LABELS[dviStatus]}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                        Start DVI
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-stone-400" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
