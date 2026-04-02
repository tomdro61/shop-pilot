import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/actions/customers";
import { getInspectionsForVehicle } from "@/lib/actions/dvi";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { formatPhone, formatVehicle, formatDate, formatRONumber } from "@/lib/utils/format";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, PARKING_STATUS_LABELS, PARKING_STATUS_COLORS } from "@/lib/constants";
import { CustomerDeleteButton } from "@/components/dashboard/customer-delete-button";
import { VehicleSection } from "@/components/dashboard/vehicle-section";
import { ArrowLeft, Pencil, Wrench, Phone, Mail, MapPin, Car, StickyNote, Plus } from "lucide-react";
import type { JobStatus, ParkingStatus } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) return { title: "Customer Not Found | ShopPilot" };
  return {
    title: `${customer.first_name} ${customer.last_name} | ShopPilot`,
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
  const initials = `${customer.first_name?.[0] ?? ""}${customer.last_name?.[0] ?? ""}`.toUpperCase();

  // Fetch DVI history for each vehicle in parallel
  const vehicleDviMap = new Map<string, Awaited<ReturnType<typeof getInspectionsForVehicle>>>();
  if (vehicles.length > 0) {
    const dviResults = await Promise.all(
      vehicles.map((v) => getInspectionsForVehicle(v.id))
    );
    vehicles.forEach((v, i) => vehicleDviMap.set(v.id, dviResults[i]));
  }

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-10">
      {/* Back button */}
      <div className="mb-4 animate-in-up">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
        </Link>
      </div>

      {/* ── Customer Profile Card ── */}
      <Card className="mb-6 animate-in-up stagger-1">
        <CardContent className="p-5 lg:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-sm font-bold text-blue-700 dark:text-blue-400 lg:h-14 lg:w-14 lg:text-base">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight lg:text-2xl">
                    {customer.first_name} {customer.last_name}
                  </h2>
                  {customer.customer_type === "fleet" && (
                    <Badge variant="outline" className="bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-400 text-[10px]">
                      Fleet{customer.fleet_account ? ` — ${customer.fleet_account}` : ""}
                    </Badge>
                  )}
                  {customer.customer_type === "parking" && (
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 text-[10px]">
                      Parking
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href={`/customers/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              </Link>
              <CustomerDeleteButton customerId={id} />
            </div>
          </div>

          {/* Contact info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-stone-50 dark:bg-stone-900/50 p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-1">Phone</p>
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="text-sm font-medium text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-stone-400" />
                  {formatPhone(customer.phone)}
                </a>
              ) : (
                <p className="text-sm text-stone-400">—</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-1">Email</p>
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="text-sm font-medium text-stone-900 dark:text-stone-100 flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                  <span className="truncate">{customer.email}</span>
                </a>
              ) : (
                <p className="text-sm text-stone-400">—</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-1">Address</p>
              {customer.address ? (
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                  <span className="truncate">{customer.address}</span>
                </p>
              ) : (
                <p className="text-sm text-stone-400">—</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {customer.notes && (
            <div className="mt-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">
                <StickyNote className="h-3 w-3" />
                Notes
              </p>
              <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{customer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Vehicles & Inspections ── */}
      <div className="mb-6 animate-in-up stagger-2">
        <VehicleSection customerId={id} vehicles={vehicles} inspectionsByVehicle={vehicleDviMap} />
      </div>

      {/* ── Jobs ── */}
      <div className="mb-6 animate-in-up stagger-3">
        <Card className="py-0 gap-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 py-3 bg-stone-800 dark:bg-stone-900">
            <CardTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-100">
              <Wrench className="h-3.5 w-3.5" />
              Jobs ({jobs.length})
            </CardTitle>
            <Link href={`/jobs/new?customerId=${id}`}>
              <Button variant="ghost" size="sm" className="text-stone-100 border border-stone-500 hover:bg-stone-700 hover:text-white">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Job
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Wrench className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium text-muted-foreground">No jobs yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Create a job to start tracking work</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-stone-800 px-2">
                {jobs.map((job) => {
                  const status = job.status as JobStatus;
                  const colors = JOB_STATUS_COLORS[status];
                  const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                      <div className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{job.title || "General"}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[
                              vehicle ? formatVehicle(vehicle) : null,
                              (job as { ro_number?: number | null }).ro_number ? formatRONumber((job as { ro_number: number }).ro_number) : null,
                              job.date_received ? formatDate(job.date_received) : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Badge
                          className={`shrink-0 text-[10px] border-transparent ${colors.bg} ${colors.text}`}
                        >
                          {JOB_STATUS_LABELS[status]}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Parking History ── */}
      {parkingReservations.length > 0 && (
        <div className="mb-6 animate-in-up stagger-4">
          <Card className="py-0 gap-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 py-3 bg-stone-800 dark:bg-stone-900">
              <CardTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-100">
                <Car className="h-3.5 w-3.5" />
                Parking History ({parkingReservations.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-stone-100 dark:divide-stone-800 px-2">
                {parkingReservations.map((res) => {
                  const status = res.status as ParkingStatus;
                  const colors = PARKING_STATUS_COLORS[status];
                  return (
                    <Link key={res.id} href={`/parking/${res.id}`} className="block">
                      <div className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {res.make} {res.model} — {res.license_plate}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {res.lot} · {formatDate(res.drop_off_date)} → {formatDate(res.pick_up_date)}
                          </p>
                        </div>
                        <Badge
                          className={`shrink-0 text-[10px] border-transparent ${colors.bg} ${colors.text}`}
                        >
                          {PARKING_STATUS_LABELS[status]}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
