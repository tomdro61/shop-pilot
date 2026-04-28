import { getTechJobs, getPendingParkingDviRequests, getStandaloneInspections, getRecentCompletedInspections } from "@/lib/actions/dvi";
import { formatVehicle, formatRONumber, formatDateShort, formatCustomerName, formatDate } from "@/lib/utils/format";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS } from "@/lib/constants";
import { ClipboardCheck, ChevronRight, Car, Calendar, Wrench } from "lucide-react";
import Link from "next/link";
import { StartParkingDviButton } from "@/components/dvi/start-parking-dvi-button";
import { CreateDviDialog } from "@/components/dvi/create-dvi-dialog";
import { CustomerLink } from "@/components/ui/customer-link";
import { ClickableRow } from "@/components/ui/clickable-row";
import { SECTION_LABEL } from "@/components/ui/section-card";
import type { DviStatus } from "@/types";

export const metadata = { title: "DVI | ShopPilot" };

const TILE = "bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm";

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h3 className={SECTION_LABEL}>{title}</h3>
      {count != null && (
        <span className="font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
          {count}
        </span>
      )}
    </div>
  );
}

export default async function DviJobListPage({
  searchParams,
}: {
  searchParams: Promise<{ showAll?: string }>;
}) {
  const { showAll: showAllParam } = await searchParams;
  const showAll = showAllParam === "true";

  const [jobs, parkingRequests, standaloneInspections, recentCompleted] = await Promise.all([
    getTechJobs(),
    getPendingParkingDviRequests(),
    getStandaloneInspections(showAll),
    getRecentCompletedInspections(25),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2 py-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Vehicle Inspections
          </h1>
          <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
            Active jobs and parking DVI requests
          </p>
        </div>
        <CreateDviDialog />
      </div>

      {/* Parking DVI Requests */}
      {parkingRequests.length > 0 && (
        <section>
          <SectionHeader title="Parking DVI Requests" count={parkingRequests.length} />
          <div className="space-y-2">
            {parkingRequests.map((req) => (
              <div
                key={req.id}
                className={`${TILE} flex items-center justify-between gap-3 p-4 border-l-4 border-l-emerald-500`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                    <CustomerLink customerId={req.customer_id}>
                      {formatCustomerName(req)}
                    </CustomerLink>
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3" />
                      {req.make} {req.model}
                      {req.color ? ` · ${req.color}` : ""}
                    </span>
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Calendar className="h-3 w-3" />
                      {formatDateShort(req.drop_off_date)} – {formatDateShort(req.pick_up_date)}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  <StartParkingDviButton reservationId={req.id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Standalone Parking DVIs */}
      {(standaloneInspections.length > 0 || showAll) && (
        <section>
          <SectionHeader title="Parking DVIs" />
          {standaloneInspections.length > 0 ? (
            <div className="space-y-2">
              {standaloneInspections.map((insp) => {
                const dviStatus = insp.status as DviStatus;
                return (
                  <ClickableRow
                    key={insp.id}
                    href={`/dvi/inspect/${insp.id}`}
                    className={`${TILE} flex items-center justify-between gap-3 p-4 hover:bg-stone-50 dark:hover:bg-stone-800/40 active:bg-stone-100 dark:active:bg-stone-800 transition-colors`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                        {insp.vehicle ? formatVehicle(insp.vehicle) : "Vehicle"}
                      </p>
                      {insp.customer && (
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">
                          <CustomerLink customerId={insp.customer.id} stopPropagation>
                            {formatCustomerName(insp.customer)}
                          </CustomerLink>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
            <div className={`${TILE} px-4 py-6 text-center`}>
              <p className="text-sm text-stone-500 dark:text-stone-400">No parking DVIs to show.</p>
            </div>
          )}
          <div className="mt-2">
            <Link
              href={showAll ? "/dvi" : "/dvi?showAll=true"}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAll ? "Hide sent DVIs" : "Show sent DVIs"}
            </Link>
          </div>
        </section>
      )}

      {/* Active Jobs */}
      <section>
        <SectionHeader title="Active Jobs" count={jobs.length} />
        {jobs.length === 0 ? (
          <div className={`${TILE} flex flex-col items-center justify-center py-12 text-center`}>
            <ClipboardCheck className="mb-3 h-10 w-10 text-stone-300 dark:text-stone-600" />
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              No active jobs
            </p>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              Active jobs will appear here for inspection
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const vehicle = job.vehicles;
              const dviStatus = job.dvi_status as DviStatus | null;

              return (
                <div key={job.id} className={`${TILE} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                        {vehicle ? formatVehicle(vehicle) : "No Vehicle"}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">
                        {job.ro_number && (
                          <span className="font-mono tabular-nums">{formatRONumber(job.ro_number)}</span>
                        )}
                        {job.ro_number ? " — " : ""}
                        {job.title || "Job"}
                      </p>
                      {job.customers && (
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">
                          <CustomerLink customerId={job.customers.id}>
                            {formatCustomerName(job.customers)}
                          </CustomerLink>
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
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
                  <div className="mt-2 pt-2 flex items-center gap-4 border-t border-stone-100 dark:border-stone-800/60">
                    <Link
                      href={`/dvi/${job.id}`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <ClipboardCheck className="h-3 w-3" />
                      {dviStatus ? "View DVI" : "Start DVI"}
                    </Link>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:underline"
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
      </section>

      {/* Recent Inspections — completed/sent history */}
      {recentCompleted.length > 0 && (
        <section>
          <SectionHeader title="Recent Inspections" count={recentCompleted.length} />
          <div className="space-y-2">
            {recentCompleted.map((insp) => {
              const status = insp.status as DviStatus;
              const colors = DVI_STATUS_COLORS[status];
              const href = insp.job
                ? `/jobs/${insp.job.id}/dvi`
                : `/dvi/inspect/${insp.id}`;
              const dateShown = insp.completed_at ?? insp.created_at;
              return (
                <ClickableRow
                  key={insp.id}
                  href={href}
                  className={`${TILE} flex items-center justify-between gap-3 p-4 hover:bg-stone-50 dark:hover:bg-stone-800/40 active:bg-stone-100 dark:active:bg-stone-800 transition-colors`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                      {insp.vehicle ? formatVehicle(insp.vehicle) : "Vehicle"}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">
                      {insp.customer ? formatCustomerName(insp.customer) : "—"}
                      {insp.job?.ro_number && (
                        <>
                          {" · "}
                          <span className="font-mono tabular-nums">
                            {formatRONumber(insp.job.ro_number)}
                          </span>
                        </>
                      )}
                      {" · "}
                      <span className="font-mono tabular-nums">{formatDate(dateShown)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${colors.bg} ${colors.text}`}
                    >
                      {DVI_STATUS_LABELS[status]}
                    </span>
                    <ChevronRight className="h-4 w-4 text-stone-400" />
                  </div>
                </ClickableRow>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
