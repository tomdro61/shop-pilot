import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/actions/customers";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { formatPhone, formatVehicle } from "@/lib/utils/format";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/constants";
import { CustomerDeleteButton } from "@/components/dashboard/customer-delete-button";
import { VehicleSection } from "@/components/dashboard/vehicle-section";
import { Pencil, Wrench, Phone, Mail, MapPin } from "lucide-react";
import type { JobStatus } from "@/types";

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

  const [vehiclesResult, jobsResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .eq("customer_id", id)
      .order("year", { ascending: false }),
    supabase
      .from("jobs")
      .select("*, vehicles(year, make, model)")
      .eq("customer_id", id)
      .order("date_received", { ascending: false })
      .limit(20),
  ]);

  const vehicles = vehiclesResult.data || [];
  const jobs = jobsResult.data || [];
  const initials = `${customer.first_name?.[0] ?? ""}${customer.last_name?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <div className="mb-6 animate-in-up">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary lg:h-12 lg:w-12 lg:text-base">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight lg:text-2xl">
                  {customer.first_name} {customer.last_name}
                </h2>
                {customer.customer_type === "fleet" && (
                  <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400 text-[10px]">
                    Fleet{customer.fleet_account ? ` — ${customer.fleet_account}` : ""}
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {customer.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {formatPhone(customer.phone)}
                  </span>
                )}
                {customer.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {customer.email}
                  </span>
                )}
                {customer.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {customer.address}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/customers/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            <CustomerDeleteButton customerId={id} />
          </div>
        </div>
      </div>

      {customer.notes && (
        <Card className="mb-4 animate-in-up stagger-1">
          <CardContent className="p-4">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
            <p className="text-sm leading-relaxed">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="animate-in-up stagger-2">
        <VehicleSection customerId={id} vehicles={vehicles} />
      </div>

      {/* Job History */}
      <div className="animate-in-up stagger-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-5 py-3">
            <CardTitle className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Wrench className="h-3.5 w-3.5" />
              Jobs ({jobs.length})
            </CardTitle>
            <Link href={`/jobs/new?customerId=${id}`}>
              <Button variant="outline" size="sm">
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
              <div className="divide-y">
                {jobs.map((job) => {
                  const status = job.status as JobStatus;
                  const colors = JOB_STATUS_COLORS[status];
                  const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                      <div className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{job.category || "General"}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[vehicle ? formatVehicle(vehicle) : null, job.date_received ? new Date(job.date_received).toLocaleDateString() : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] ${colors.bg} ${colors.text} ${colors.border}`}
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
    </div>
  );
}
