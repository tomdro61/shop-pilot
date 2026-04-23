import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/actions/customers";
import { getInspectionsForVehicle } from "@/lib/actions/dvi";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SECTION_LABEL } from "@/components/ui/section-card";
import {
  formatPhone,
  formatVehicle,
  formatDate,
  formatDateLong,
  formatRONumber,
  formatCustomerName,
  getInitials,
} from "@/lib/utils/format";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  PARKING_STATUS_LABELS,
  PARKING_STATUS_COLORS,
  CUSTOMER_TYPE_COLORS,
} from "@/lib/constants";
import { CustomerDeleteButton } from "@/components/dashboard/customer-delete-button";
import { VehicleSection } from "@/components/dashboard/vehicle-section";
import { ArrowLeft, Pencil, User as UserIcon, Activity } from "lucide-react";
import type { JobStatus, ParkingStatus } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) return { title: "Customer Not Found | ShopPilot" };
  return {
    title: `${formatCustomerName(customer)} | ShopPilot`,
  };
}

function SectionTitle({
  num,
  title,
  sub,
  action,
}: {
  num: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-1 mb-2.5">
      <span className="font-mono tabular-nums text-[11px] font-semibold tracking-[0.08em] text-stone-400 dark:text-stone-600">
        {num}
      </span>
      <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50 tracking-tight">
        {title}
      </h2>
      {sub && <span className="text-xs text-stone-500 dark:text-stone-400">{sub}</span>}
      {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const supabase = await createClient();

  const [vehiclesResult, jobsResult, jobsCountResult, parkingResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .eq("customer_id", id)
      .order("year", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, status, title, date_received, ro_number, vehicles(year, make, model)")
      .eq("customer_id", id)
      .order("date_received", { ascending: false })
      .limit(20),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id),
    supabase
      .from("parking_reservations")
      .select("id, status, make, model, license_plate, lot, drop_off_date, pick_up_date")
      .eq("customer_id", id)
      .order("drop_off_date", { ascending: false })
      .limit(20),
  ]);

  const vehicles = vehiclesResult.data || [];
  const jobs = jobsResult.data || [];
  const totalJobs = jobsCountResult.count ?? 0;
  const parkingReservations = parkingResult.data || [];
  const lastVisit = jobs[0]?.date_received ?? null;

  const vehicleDviMap = new Map<string, Awaited<ReturnType<typeof getInspectionsForVehicle>>>();
  if (vehicles.length > 0) {
    const dviResults = await Promise.all(vehicles.map((v) => getInspectionsForVehicle(v.id)));
    vehicles.forEach((v, i) => vehicleDviMap.set(v.id, dviResults[i]));
  }

  const customerName = formatCustomerName(customer);

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 py-2">
        <Link href="/customers">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Customers
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Link href={`/customers/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
          <CustomerDeleteButton customerId={id} />
        </div>
      </div>

      <section className="bg-card border border-stone-300 dark:border-stone-800 rounded-lg overflow-hidden">
        <div className="px-5 lg:px-6 py-5">
          <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
            Customer since {formatDateLong(customer.created_at) ?? "—"}
          </div>
          <h1 className="text-[22px] lg:text-[26px] font-semibold tracking-tight text-stone-900 dark:text-stone-50 mt-1.5 leading-tight">
            {customerName}
          </h1>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {customer.customer_type === "fleet" && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${CUSTOMER_TYPE_COLORS.fleet}`}>
                Fleet{customer.fleet_account ? ` · ${customer.fleet_account}` : ""}
              </span>
            )}
            {customer.customer_type === "parking" && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${CUSTOMER_TYPE_COLORS.parking}`}>
                Parking
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 border-t border-stone-300 dark:border-stone-800 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800">
          <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
            <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <UserIcon className="h-3 w-3" /> Contact
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-md grid place-items-center text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
                {getInitials(customerName)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                  {customerName}
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 capitalize mt-0.5">
                  {customer.customer_type || "retail"}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
              <dt className={SECTION_LABEL}>Phone</dt>
              <dd className="min-w-0 flex items-center gap-1.5 flex-wrap">
                {customer.phone ? (
                  <>
                    <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">{formatPhone(customer.phone)}</span>
                    <a href={`tel:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Call</a>
                    <a href={`sms:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Text</a>
                  </>
                ) : (
                  <span className="text-stone-400">—</span>
                )}
              </dd>
              <dt className={SECTION_LABEL}>Email</dt>
              <dd className="min-w-0 text-stone-900 dark:text-stone-50 truncate">
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="hover:text-blue-600 dark:hover:text-blue-400 truncate">
                    {customer.email}
                  </a>
                ) : (
                  <span className="text-stone-400">—</span>
                )}
              </dd>
              <dt className={SECTION_LABEL}>Address</dt>
              <dd className="min-w-0 text-stone-900 dark:text-stone-50 truncate">
                {customer.address || <span className="text-stone-400">—</span>}
              </dd>
            </dl>
          </div>

          <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
            <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <Activity className="h-3 w-3" /> Activity
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs items-center min-w-0">
              <dt className={SECTION_LABEL}>Total jobs</dt>
              <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                {totalJobs}
              </dd>
              <dt className={SECTION_LABEL}>Last visit</dt>
              <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                {lastVisit ? formatDate(lastVisit) : <span className="text-stone-400 font-sans">Never</span>}
              </dd>
              <dt className={SECTION_LABEL}>Vehicles</dt>
              <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                {vehicles.length}
              </dd>
              {parkingReservations.length > 0 && (
                <>
                  <dt className={SECTION_LABEL}>Parking</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {parkingReservations.length}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </div>

        {customer.notes && (
          <div className="border-t border-stone-300 dark:border-stone-800 px-5 lg:px-6 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Notes
              </span>
            </div>
            <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed">
              {customer.notes}
            </p>
          </div>
        )}
      </section>

      <section className="pt-2">
        <SectionTitle num="01" title="Vehicles" sub={`${vehicles.length} on file`} />
        <VehicleSection customerId={id} vehicles={vehicles} inspectionsByVehicle={vehicleDviMap} />
      </section>

      <section className="pt-2">
        <SectionTitle
          num="02"
          title="Jobs"
          sub={totalJobs > jobs.length ? `${totalJobs} total · showing ${jobs.length}` : `${totalJobs} total`}
          action={
            <Link href={`/jobs/new?customerId=${id}`}>
              <Button size="sm">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                New Job
              </Button>
            </Link>
          }
        />
        <div className="bg-card border border-stone-300 dark:border-stone-800 rounded-lg overflow-hidden">
          {jobs.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-stone-500 dark:text-stone-400">No jobs yet</p>
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">Create a job to start tracking work</p>
            </div>
          ) : (
            <div>
              {jobs.map((job) => {
                const status = job.status as JobStatus;
                const colors = JOB_STATUS_COLORS[status];
                const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                const meta = [
                  vehicle ? formatVehicle(vehicle) : null,
                  job.ro_number ? formatRONumber(job.ro_number) : null,
                  job.date_received ? formatDate(job.date_received) : null,
                ].filter(Boolean).join(" · ");
                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                        {job.title || "General"}
                      </p>
                      {meta && (
                        <p className="mt-0.5 font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400 truncate">
                          {meta}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 ml-3 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${colors.bg} ${colors.text}`}>
                      {JOB_STATUS_LABELS[status]}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {parkingReservations.length > 0 && (
        <section className="pt-2">
          <SectionTitle num="03" title="Parking" sub={`${parkingReservations.length} reservation${parkingReservations.length === 1 ? "" : "s"}`} />
          <div className="bg-card border border-stone-300 dark:border-stone-800 rounded-lg overflow-hidden">
            {parkingReservations.map((res) => {
              const status = res.status as ParkingStatus;
              const colors = PARKING_STATUS_COLORS[status];
              return (
                <Link
                  key={res.id}
                  href={`/parking/${res.id}`}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                      {[res.make, res.model].filter(Boolean).join(" ") || "Vehicle"}
                      {res.license_plate && (
                        <span className="ml-1.5 font-mono text-xs text-stone-500 dark:text-stone-400">
                          {res.license_plate}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">
                      {res.lot}{" · "}
                      <span className="font-mono tabular-nums">
                        {formatDate(res.drop_off_date)} → {formatDate(res.pick_up_date)}
                      </span>
                    </p>
                  </div>
                  <span className={`shrink-0 ml-3 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${colors.bg} ${colors.text}`}>
                    {PARKING_STATUS_LABELS[status]}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
