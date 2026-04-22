import { getTechJobs, getPendingParkingDviRequests, getStandaloneInspections } from "@/lib/actions/dvi";
import { formatVehicle, formatRONumber, formatDateShort, formatCustomerName } from "@/lib/utils/format";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS } from "@/lib/constants";
import { ClipboardCheck, ChevronRight, Car, Calendar, Wrench } from "lucide-react";
import Link from "next/link";
import { StartParkingDviButton } from "@/components/dvi/start-parking-dvi-button";
import { CreateDviDialog } from "@/components/dvi/create-dvi-dialog";
import { CustomerLink } from "@/components/ui/customer-link";
import { ClickableRow } from "@/components/ui/clickable-row";
import type { DviStatus } from "@/types";

export const metadata = { title: "DVI | ShopPilot" };

export default async function DviJobListPage({
  searchParams,
}: {
  searchParams: Promise<{ showAll?: string }>;
}) {
  const { showAll: showAllParam } = await searchParams;
  const showAll = showAllParam === "true";

  const [jobs, parkingRequests, standaloneInspections] = await Promise.all([
    getTechJobs(),
    getPendingParkingDviRequests(),
    getStandaloneInspections(showAll),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
          Vehicle Inspections
        </h2>
        <CreateDviDialog />
      </div>

      {/* Parking DVI Requests */}
      {parkingRequests.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Parking DVI Requests
            </h3>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">
              {parkingRequests.length}
            </span>
          </div>
          <div className="space-y-2">
            {parkingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-lg bg-card p-4 shadow-card ring-1 ring-emerald-200/20 dark:ring-emerald-800/20 border-l-4 border-emerald-500"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-50 truncate">
                    <CustomerLink customerId={req.customer_id}>
                      {formatCustomerName(req)}
                    </CustomerLink>
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Car className="h-3 w-3" />
                      {req.make} {req.model}
                      {req.color ? ` · ${req.color}` : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDateShort(req.drop_off_date)} – {formatDateShort(req.pick_up_date)}
                    </span>
                  </div>
                </div>
                <div className="ml-3 shrink-0">
                  <StartParkingDviButton reservationId={req.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standalone Parking DVIs */}
      {(standaloneInspections.length > 0 || showAll) && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Parking DVIs
            </h3>
          </div>
          {standaloneInspections.length > 0 ? (
            <div className="space-y-2">
              {standaloneInspections.map((insp) => {
                const dviStatus = insp.status as DviStatus;
                return (
                  <ClickableRow key={insp.id} href={`/dvi/inspect/${insp.id}`} className="flex items-center justify-between rounded-lg bg-card p-4 shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 active:bg-stone-100 dark:active:bg-stone-800 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-50 truncate">
                        {insp.vehicle
                          ? formatVehicle(insp.vehicle)
                          : "Vehicle"}
                      </p>
                      {insp.customer && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <CustomerLink customerId={insp.customer.id} stopPropagation>
                            {formatCustomerName(insp.customer)}
                          </CustomerLink>
                        </p>
                      )}
                    </div>
                    <div className="ml-3 flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${DVI_STATUS_COLORS[dviStatus].bg} ${DVI_STATUS_COLORS[dviStatus].text}`}
                      >
                        {DVI_STATUS_LABELS[dviStatus]}
                      </span>
                      <ChevronRight className="h-4 w-4 text-stone-400" />
                    </div>
                  </ClickableRow>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No parking DVIs to show.</p>
          )}
          <div className="mt-2">
            <Link
              href={showAll ? "/dvi" : "/dvi?showAll=true"}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAll ? "Hide sent DVIs" : "Show sent DVIs"}
            </Link>
          </div>
        </div>
      )}

      {/* Active Jobs */}
      <div className="mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Active Jobs
        </h3>
        <p className="text-xs text-muted-foreground">
          {jobs.length} active job{jobs.length !== 1 ? "s" : ""}
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardCheck className="mb-3 h-12 w-12 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-semibold text-stone-500 dark:text-stone-400">
            No active jobs
          </p>
          <p className="text-xs text-muted-foreground">
            Active jobs will appear here for inspection
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const vehicle = job.vehicles;
            const dviStatus = job.dvi_status as DviStatus | null;

            return (
              <div key={job.id} className="rounded-lg bg-card p-4 shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20">
                <div className="flex items-center justify-between">
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
                        <CustomerLink customerId={job.customers.id}>
                          {formatCustomerName(job.customers)}
                        </CustomerLink>
                      </p>
                    )}
                  </div>
                  <div className="ml-3 flex items-center gap-2 shrink-0">
                    {dviStatus ? (
                      <span
                        className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${DVI_STATUS_COLORS[dviStatus].bg} ${DVI_STATUS_COLORS[dviStatus].text}`}
                      >
                        {DVI_STATUS_LABELS[dviStatus]}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                        No DVI
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-stone-100 dark:border-stone-800">
                  <Link
                    href={`/dvi/${job.id}`}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <ClipboardCheck className="h-3 w-3" />
                    {dviStatus ? "View DVI" : "Start DVI"}
                  </Link>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex items-center gap-1.5 text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:underline"
                  >
                    <Wrench className="h-3 w-3" />
                    View Job
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
