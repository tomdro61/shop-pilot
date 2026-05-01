import {
  getTechJobs,
  getPendingParkingDviRequests,
  getStandaloneInspections,
  getRecentCompletedInspections,
} from "@/lib/actions/dvi";
import {
  formatVehicle,
  formatRONumber,
  formatDateShort,
  formatCustomerName,
  formatDate,
} from "@/lib/utils/format";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS } from "@/lib/constants";
import {
  ClipboardCheck,
  ChevronRight,
  Car,
  Calendar,
  Wrench,
  History,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { StartParkingDviButton } from "@/components/dvi/start-parking-dvi-button";
import { CreateDviDialog } from "@/components/dvi/create-dvi-dialog";
import { CustomerLink } from "@/components/ui/customer-link";
import { ClickableRow } from "@/components/ui/clickable-row";
import { SectionHeader } from "@/components/dashboard/section-header";
import { PageShell } from "@/components/layout/page-shell";
import { TONE_CLASSES } from "@/lib/ui/alert-tone";
import type { DviStatus } from "@/types";

export const metadata = { title: "DVI | ShopPilot" };

const TILE = "bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card";

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

  const pendingCount = parkingRequests.length + standaloneInspections.length + jobs.length;

  return (
    <PageShell width="narrow">
      {/* Page header — match the inbox / dashboard pattern */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-md grid place-items-center border bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 flex-none">
            <ClipboardCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Vehicle Inspections
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {pendingCount === 0
                ? "All caught up"
                : `${pendingCount} item${pendingCount === 1 ? "" : "s"} pending`}
            </p>
          </div>
        </div>
        <CreateDviDialog />
      </div>

      {/* Parking DVI Requests — alert-style cards with 3px accent strip */}
      {parkingRequests.length > 0 && (
        <section>
          <SectionHeader
            icon={Car}
            iconTone="green"
            title="Parking DVI Requests"
            count={parkingRequests.length}
          />
          <div className="space-y-2">
            {parkingRequests.map((req) => (
              <div
                key={req.id}
                className={`relative flex items-center gap-3 rounded-md border px-4 py-3.5 shadow-card ${TONE_CLASSES.emerald.card}`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${TONE_CLASSES.emerald.bar}`}
                />
                <span
                  className={`w-9 h-9 rounded-md grid place-items-center border flex-none ${TONE_CLASSES.emerald.tile}`}
                >
                  <Car className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                    <CustomerLink customerId={req.customer_id}>
                      {formatCustomerName(req)}
                    </CustomerLink>
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>
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
          <SectionHeader
            icon={ClipboardCheck}
            iconTone="blue"
            title="Parking DVIs"
            count={standaloneInspections.length}
            action={
              <Link
                href={showAll ? "/dvi" : "/dvi?showAll=true"}
                className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:underline transition-colors"
              >
                {showAll ? "Hide sent" : "Show sent"}
              </Link>
            }
          />
          {standaloneInspections.length > 0 ? (
            <div className={`${TILE} overflow-hidden`}>
              <ul className="divide-y divide-stone-200 dark:divide-stone-800">
                {standaloneInspections.map((insp) => {
                  const dviStatus = insp.status as DviStatus;
                  return (
                    <li key={insp.id}>
                      <ClickableRow
                        href={`/dvi/inspect/${insp.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
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
                          <ChevronRight className="h-4 w-4 text-stone-400 dark:text-stone-500" />
                        </div>
                      </ClickableRow>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className={`${TILE} px-4 py-8 text-center`}>
              <p className="text-sm text-stone-500 dark:text-stone-400">No parking DVIs to show.</p>
            </div>
          )}
        </section>
      )}

      {/* Active Jobs */}
      <section>
        <SectionHeader
          icon={Wrench}
          iconTone="indigo"
          title="Active Jobs"
          count={jobs.length}
        />
        {jobs.length === 0 ? (
          <div className={`${TILE} flex flex-col items-center justify-center py-12 text-center`}>
            <div className="w-10 h-10 rounded-full grid place-items-center bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-700 dark:text-stone-200">
              No active jobs
            </p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Jobs needing inspection will appear here.
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
                          <span className="font-mono tabular-nums">
                            {formatRONumber(job.ro_number)}
                          </span>
                        )}
                        {job.ro_number ? " · " : ""}
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
                  <div className="mt-3 pt-3 flex items-center gap-4 border-t border-stone-200 dark:border-stone-800">
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
          <SectionHeader
            icon={History}
            iconTone="stone"
            title="Recent Inspections"
            count={recentCompleted.length}
          />
          <div className={`${TILE} overflow-hidden`}>
            <ul className="divide-y divide-stone-200 dark:divide-stone-800">
              {recentCompleted.map((insp) => {
                const status = insp.status as DviStatus;
                const colors = DVI_STATUS_COLORS[status];
                const href = insp.job
                  ? `/jobs/${insp.job.id}/dvi`
                  : `/dvi/inspect/${insp.id}`;
                const dateShown = insp.completed_at ?? insp.created_at;
                return (
                  <li key={insp.id}>
                    <ClickableRow
                      href={href}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
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
                        <ChevronRight className="h-4 w-4 text-stone-400 dark:text-stone-500" />
                      </div>
                    </ClickableRow>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </PageShell>
  );
}
