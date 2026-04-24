import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/actions/customers";
import { getInspectionsForVehicle } from "@/lib/actions/dvi";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SECTION_LABEL, COLUMN_HEADER } from "@/components/ui/section-card";
import {
  formatPhone,
  formatVehicle,
  formatDate,
  formatDateLong,
  formatRONumber,
  formatCustomerName,
  formatCurrencyWhole,
  getInitials,
} from "@/lib/utils/format";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PARKING_STATUS_LABELS,
  PARKING_STATUS_COLORS,
} from "@/lib/constants";
import { CustomerDeleteButton } from "@/components/dashboard/customer-delete-button";
import { VehicleSection, VehicleSectionAddButton } from "@/components/dashboard/vehicle-section";
import { CustomerNameEditor } from "@/components/dashboard/customer-name-editor";
import { CustomerTextFieldEditor } from "@/components/dashboard/customer-text-field-editor";
import { CustomerNotesEditor } from "@/components/dashboard/customer-notes-editor";
import { CustomerTypeEditor } from "@/components/dashboard/customer-type-editor";
import { SectionTitle } from "@/components/ui/section-title";
import { ArrowLeft, Plus, DollarSign } from "lucide-react";
import type { JobStatus, PaymentStatus, ParkingStatus, Vehicle } from "@/types";

const JOBS_DISPLAY_LIMIT = 20;
const VEHICLE_DOT_PALETTE = [
  "bg-blue-500",
  "bg-orange-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
];

function vehicleDotClass(index: number): string {
  return VEHICLE_DOT_PALETTE[index % VEHICLE_DOT_PALETTE.length];
}

type JobRow = {
  id: string;
  status: JobStatus;
  title: string | null;
  date_received: string;
  ro_number: number | null;
  payment_status: PaymentStatus | null;
  vehicle_id: string | null;
  job_line_items: { total: number | null }[];
};

function jobTotal(job: JobRow): number {
  return job.job_line_items.reduce((s, li) => s + (li.total ?? 0), 0);
}

type AccentTone = "blue" | "amber" | "green" | "stone";

function accentFor(job: JobRow): AccentTone {
  if (job.status === "in_progress" || job.status === "waiting_for_parts") return "blue";
  if (job.status === "complete") {
    if (job.payment_status === "paid") return "green";
    if (job.payment_status === "waived") return "stone";
    return "amber";
  }
  return "stone";
}

const ACCENT_BAR: Record<AccentTone, string> = {
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  stone: "bg-stone-300 dark:bg-stone-700",
};

type CustomerType = "retail" | "fleet" | "parking";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) return { title: "Customer Not Found | ShopPilot" };
  return {
    title: `${formatCustomerName(customer)} | ShopPilot`,
  };
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const { id } = await params;
  const { vehicle: vehicleFilter } = await searchParams;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const supabase = await createClient();

  const [vehiclesResult, jobsResult, parkingResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .eq("customer_id", id)
      .order("year", { ascending: false }),
    supabase
      .from("jobs")
      .select(
        "id, status, title, date_received, ro_number, payment_status, vehicle_id, job_line_items(total)"
      )
      .eq("customer_id", id)
      .order("date_received", { ascending: false }),
    supabase
      .from("parking_reservations")
      .select("id, status, make, model, license_plate, lot, drop_off_date, pick_up_date")
      .eq("customer_id", id)
      .order("drop_off_date", { ascending: false })
      .limit(20),
  ]);

  const vehicles = (vehiclesResult.data || []) as Vehicle[];
  const allJobs = (jobsResult.data || []) as JobRow[];
  const parkingReservations = parkingResult.data || [];

  const vehicleDotIndex = new Map<string, number>();
  vehicles.forEach((v, i) => vehicleDotIndex.set(v.id, i));
  const vehicleById = new Map<string, Vehicle>();
  vehicles.forEach((v) => vehicleById.set(v.id, v));

  const totalJobs = allJobs.length;
  const openJobs = allJobs.filter((j) => j.status !== "complete").length;
  const lifetimeSpend = allJobs.reduce((s, j) => s + jobTotal(j), 0);
  const outstandingJobs = allJobs.filter(
    (j) =>
      j.status === "complete" &&
      j.payment_status !== "paid" &&
      j.payment_status !== "waived"
  );
  const outstandingSpend = outstandingJobs.reduce((s, j) => s + jobTotal(j), 0);
  const avgRO = totalJobs > 0 ? lifetimeSpend / totalJobs : 0;
  const lastVisit = allJobs[0]?.date_received ?? null;

  const filteredJobs =
    vehicleFilter && vehicleFilter !== "all"
      ? allJobs.filter((j) => j.vehicle_id === vehicleFilter)
      : allJobs;
  const displayJobs = filteredJobs.slice(0, JOBS_DISPLAY_LIMIT);
  const moreCount = Math.max(0, filteredJobs.length - JOBS_DISPLAY_LIMIT);

  const vehicleDviMap = new Map<string, Awaited<ReturnType<typeof getInspectionsForVehicle>>>();
  if (vehicles.length > 0) {
    const dviResults = await Promise.all(vehicles.map((v) => getInspectionsForVehicle(v.id)));
    vehicles.forEach((v, i) => vehicleDviMap.set(v.id, dviResults[i]));
  }

  const customerName = formatCustomerName(customer);
  const showVehicleFilter = vehicles.length > 1;

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
          <Link href={`/jobs/new?customerId=${id}`}>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Job
            </Button>
          </Link>
          <CustomerDeleteButton customerId={id} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">

        <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 lg:px-6 py-5 flex items-start gap-4">
            <div className="w-14 h-14 rounded-md grid place-items-center text-base font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 flex-none">
              {getInitials(customerName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
                Customer since {formatDateLong(customer.created_at) ?? "—"}
              </div>
              <div className="mt-1">
                <CustomerNameEditor
                  customerId={id}
                  firstName={customer.first_name}
                  lastName={customer.last_name}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <CustomerTypeEditor
                  customerId={id}
                  currentType={(customer.customer_type as CustomerType) ?? "retail"}
                  fleetAccount={customer.fleet_account}
                />
                <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                  {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}
                </span>
                {parkingReservations.length > 0 && customer.customer_type !== "parking" && (
                  <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {parkingReservations.length} parking
                  </span>
                )}
              </div>
            </div>
          </div>

          <dl>
            <div className="grid grid-cols-[100px_1fr] items-center px-5 lg:px-6 py-2.5 border-b border-stone-100 dark:border-stone-800/60">
              <dt className={SECTION_LABEL}>Phone</dt>
              <dd className="min-w-0 text-sm">
                <CustomerTextFieldEditor
                  customerId={id}
                  field="phone"
                  value={customer.phone}
                  inputType="tel"
                  placeholder="(555) 555-1234"
                  successMessage="Phone saved"
                >
                  {customer.phone ? (
                    <>
                      <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">{formatPhone(customer.phone)}</span>
                      <a href={`tel:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Call</a>
                      <a href={`sms:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Text</a>
                    </>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </CustomerTextFieldEditor>
              </dd>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center px-5 lg:px-6 py-2.5 border-b border-stone-100 dark:border-stone-800/60">
              <dt className={SECTION_LABEL}>Email</dt>
              <dd className="min-w-0 text-sm">
                <CustomerTextFieldEditor
                  customerId={id}
                  field="email"
                  value={customer.email}
                  inputType="email"
                  placeholder="name@example.com"
                  successMessage="Email saved"
                >
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`} className="text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                      {customer.email}
                    </a>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </CustomerTextFieldEditor>
              </dd>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center px-5 lg:px-6 py-2.5">
              <dt className={SECTION_LABEL}>Address</dt>
              <dd className="min-w-0 text-sm">
                <CustomerTextFieldEditor
                  customerId={id}
                  field="address"
                  value={customer.address}
                  placeholder="Street address, city, ZIP"
                  successMessage="Address saved"
                >
                  <span className="text-stone-900 dark:text-stone-50 truncate">
                    {customer.address || <span className="text-stone-400">—</span>}
                  </span>
                </CustomerTextFieldEditor>
              </dd>
            </div>
          </dl>

          <div className="px-5 lg:px-6 pt-3 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Notes
              </span>
            </div>
            <CustomerNotesEditor customerId={id} value={customer.notes} />
          </div>
        </section>

        <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
          <div className={`${SECTION_LABEL} flex items-center gap-1.5 px-5 py-3 border-b border-stone-100 dark:border-stone-800/60`}>
            <DollarSign className="h-3 w-3" /> Financial Snapshot
          </div>
          <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800/60">
            <div className={SECTION_LABEL}>Lifetime spend</div>
            <div className="font-mono tabular-nums text-[26px] font-bold text-stone-900 dark:text-stone-50 leading-tight mt-1">
              {formatCurrencyWhole(lifetimeSpend)}
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Across {totalJobs} job{totalJobs === 1 ? "" : "s"}
            </div>
          </div>

          <dl className="grid grid-cols-2 divide-x divide-stone-100 dark:divide-stone-800/60 border-b border-stone-100 dark:border-stone-800/60">
            <div className="px-5 py-3 flex flex-col gap-0.5">
              <dt className={SECTION_LABEL}>Last visit</dt>
              <dd className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">
                {lastVisit ? formatDate(lastVisit) : <span className="text-stone-400 font-normal font-sans">Never</span>}
              </dd>
            </div>
            <div className="px-5 py-3 flex flex-col gap-0.5">
              <dt className={SECTION_LABEL}>Avg RO</dt>
              <dd className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">
                {totalJobs > 0 ? formatCurrencyWhole(avgRO) : <span className="text-stone-400 font-normal font-sans">—</span>}
              </dd>
            </div>
            <div className="px-5 py-3 flex flex-col gap-0.5 border-t border-stone-100 dark:border-stone-800/60">
              <dt className={SECTION_LABEL}>Open jobs</dt>
              <dd className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">
                {openJobs}
              </dd>
            </div>
            <div className="px-5 py-3 flex flex-col gap-0.5 border-t border-stone-100 dark:border-stone-800/60">
              <dt className={SECTION_LABEL}>Vehicles</dt>
              <dd className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">
                {vehicles.length}
              </dd>
            </div>
          </dl>

          {outstandingSpend > 0 ? (
            <div className="px-5 py-4 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Outstanding balance
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400/80 mt-0.5">
                    Across {outstandingJobs.length} completed job{outstandingJobs.length === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="font-mono tabular-nums text-base font-bold text-amber-900 dark:text-amber-200">
                  {formatCurrencyWhole(outstandingSpend)}
                </span>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="pt-2">
        <SectionTitle
          num="01"
          title="Vehicles"
          sub={`${vehicles.length} on file`}
          action={<VehicleSectionAddButton customerId={id} />}
        />
        <VehicleSection customerId={id} vehicles={vehicles} inspectionsByVehicle={vehicleDviMap} />
      </section>

      <section className="pt-2">
        <SectionTitle
          num="02"
          title="Job history"
          sub={
            <span>
              {totalJobs} job{totalJobs === 1 ? "" : "s"}
              {openJobs > 0 && <> · <span className="text-blue-700 dark:text-blue-400">{openJobs} open</span></>}
              {lifetimeSpend > 0 && <> · {formatCurrencyWhole(lifetimeSpend)} lifetime</>}
            </span>
          }
          action={
            <>
              {showVehicleFilter && (
                <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-stone-100 dark:bg-stone-800">
                  <Link
                    href={`/customers/${id}`}
                    className={`inline-flex items-center h-6 px-2 rounded text-[11px] font-medium transition-colors ${
                      !vehicleFilter || vehicleFilter === "all"
                        ? "bg-card text-stone-900 dark:text-stone-50 shadow-sm"
                        : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                    }`}
                  >
                    All
                  </Link>
                  {vehicles.map((v, i) => (
                    <Link
                      key={v.id}
                      href={`/customers/${id}?vehicle=${v.id}`}
                      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11px] font-medium transition-colors ${
                        vehicleFilter === v.id
                          ? "bg-card text-stone-900 dark:text-stone-50 shadow-sm"
                          : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${vehicleDotClass(i)}`} />
                      {v.model || formatVehicle(v) || "Vehicle"}
                    </Link>
                  ))}
                </div>
              )}
              <Link href={`/jobs/new?customerId=${id}`}>
                <Button size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Job
                </Button>
              </Link>
            </>
          }
        />
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
          {displayJobs.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {vehicleFilter ? "No jobs on this vehicle" : "No jobs yet"}
              </p>
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                {vehicleFilter ? "Try removing the filter" : "Create a job to start tracking work"}
              </p>
            </div>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800">
                    <th className={`text-left px-4 py-2 ${COLUMN_HEADER}`}>Repair Order</th>
                    <th className={`text-left px-3 py-2 ${COLUMN_HEADER}`}>Vehicle</th>
                    <th className={`text-left px-3 py-2 ${COLUMN_HEADER}`}>Received</th>
                    <th className={`text-left px-3 py-2 ${COLUMN_HEADER}`}>Status</th>
                    <th className={`text-left px-3 py-2 ${COLUMN_HEADER}`}>Payment</th>
                    <th className={`text-right px-4 py-2 ${COLUMN_HEADER}`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {displayJobs.map((job) => {
                    const status = job.status;
                    const statusColors = JOB_STATUS_COLORS[status];
                    const paymentStatus = (job.payment_status ?? "unpaid") as PaymentStatus;
                    const paymentColors = PAYMENT_STATUS_COLORS[paymentStatus];
                    const vehicle = job.vehicle_id ? vehicleById.get(job.vehicle_id) : null;
                    const vehicleIdx = job.vehicle_id ? vehicleDotIndex.get(job.vehicle_id) ?? 0 : 0;
                    const total = jobTotal(job);
                    const accent = accentFor(job);
                    return (
                      <tr
                        key={job.id}
                        className="relative border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40"
                      >
                        <td className="relative px-4 py-3 align-top">
                          <span
                            aria-hidden
                            className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${ACCENT_BAR[accent]}`}
                          />
                          <Link href={`/jobs/${job.id}`} className="block group">
                            <div className="font-mono tabular-nums text-[11px] text-stone-400 dark:text-stone-500">
                              {job.ro_number ? formatRONumber(job.ro_number) : "—"}
                            </div>
                            <div className="text-sm font-medium text-stone-900 dark:text-stone-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 mt-0.5 truncate max-w-[280px]">
                              {job.title || "General"}
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          {vehicle ? (
                            <span className="inline-flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300">
                              <span className={`w-1.5 h-1.5 rounded-full ${vehicleDotClass(vehicleIdx)}`} />
                              {formatVehicle(vehicle) || "Vehicle"}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-middle font-mono tabular-nums text-xs text-stone-700 dark:text-stone-300">
                          {formatDate(job.date_received)}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColors.bg} ${statusColors.text}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                            {JOB_STATUS_LABELS[status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${paymentColors.bg} ${paymentColors.text}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                            {PAYMENT_STATUS_LABELS[paymentStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-right font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
                          {total > 0 ? formatCurrencyWhole(total) : <span className="text-stone-400 font-normal">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {moreCount > 0 && (
                <div className="px-4 py-2.5 text-center text-xs text-stone-500 dark:text-stone-400 border-t border-stone-200 dark:border-stone-800">
                  {moreCount} older job{moreCount === 1 ? "" : "s"} not shown
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {parkingReservations.length > 0 && (
        <section className="pt-2">
          <SectionTitle num="03" title="Parking" sub={`${parkingReservations.length} reservation${parkingReservations.length === 1 ? "" : "s"}`} />
          <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
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
