import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/actions/customers";
import { getInspectionsForVehicle } from "@/lib/actions/dvi";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SectionCard, SECTION_LABEL } from "@/components/ui/section-card";
import { formatPhone, formatVehicle, formatDate, formatRONumber, formatCustomerName } from "@/lib/utils/format";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, PARKING_STATUS_LABELS, PARKING_STATUS_COLORS, CUSTOMER_TYPE_COLORS } from "@/lib/constants";
import { CustomerDeleteButton } from "@/components/dashboard/customer-delete-button";
import { VehicleSection } from "@/components/dashboard/vehicle-section";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import type { JobStatus, ParkingStatus } from "@/types";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      .select("id, status, title, date_received, ro_number, vehicles(year, make, model)")
      .eq("customer_id", id)
      .order("date_received", { ascending: false })
      .limit(20),
    supabase
      .from("parking_reservations")
      .select("id, status, make, model, license_plate, lot, drop_off_date, pick_up_date")
      .eq("customer_id", id)
      .order("drop_off_date", { ascending: false })
      .limit(20),
  ]);

  const vehicles = vehiclesResult.data || [];
  const jobs = jobsResult.data || [];
  const parkingReservations = parkingResult.data || [];

  // Fetch DVI history for each vehicle in parallel
  const vehicleDviMap = new Map<string, Awaited<ReturnType<typeof getInspectionsForVehicle>>>();
  if (vehicles.length > 0) {
    const dviResults = await Promise.all(
      vehicles.map((v) => getInspectionsForVehicle(v.id))
    );
    vehicles.forEach((v, i) => vehicleDviMap.set(v.id, dviResults[i]));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-4">

      {/* Action strip */}
      <div className="flex items-center justify-between py-2">
        <Link href="/customers">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Customers
          </Button>
        </Link>
        <div className="flex items-center gap-1.5">
          <Link href={`/customers/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
          <CustomerDeleteButton customerId={id} />
        </div>
      </div>

      {/* Customer profile card */}
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
        {/* Identity strip */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800 flex-wrap">
          <h1 className="text-base lg:text-lg font-semibold text-stone-900 dark:text-stone-50 min-w-0">
            {formatCustomerName(customer)}
          </h1>
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

        {/* Contact info grid */}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-10 px-4 py-4 ${customer.notes ? "border-b border-stone-200 dark:border-stone-800" : ""}`}>
          <div>
            <div className={`${SECTION_LABEL} mb-1.5`}>Phone</div>
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className="font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400">
                {formatPhone(customer.phone)}
              </a>
            ) : (
              <p className="text-sm text-stone-400">—</p>
            )}
          </div>
          <div>
            <div className={`${SECTION_LABEL} mb-1.5`}>Email</div>
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="text-sm text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 truncate block">
                {customer.email}
              </a>
            ) : (
              <p className="text-sm text-stone-400">—</p>
            )}
          </div>
          <div>
            <div className={`${SECTION_LABEL} mb-1.5`}>Address</div>
            {customer.address ? (
              <p className="text-sm text-stone-900 dark:text-stone-50">{customer.address}</p>
            ) : (
              <p className="text-sm text-stone-400">—</p>
            )}
          </div>
        </div>

        {/* Notes */}
        {customer.notes && (
          <div className="px-4 py-4">
            <div className={`${SECTION_LABEL} mb-1.5`}>Notes</div>
            <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed">
              {customer.notes}
            </p>
          </div>
        )}
      </div>

      {/* Vehicles & Inspections */}
      <div>
        <VehicleSection customerId={id} vehicles={vehicles} inspectionsByVehicle={vehicleDviMap} />
      </div>

      {/* Jobs */}
      <SectionCard
        title={`Jobs (${jobs.length})`}
        action={
          <Link href={`/jobs/new?customerId=${id}`}>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Job
            </Button>
          </Link>
        }
      >
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
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">
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
      </SectionCard>

      {/* Parking History */}
      {parkingReservations.length > 0 && (
        <SectionCard title={`Parking History (${parkingReservations.length})`}>
          <div>
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
                      {[res.make, res.model].filter(Boolean).join(" ")}
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
        </SectionCard>
      )}
    </div>
  );
}
