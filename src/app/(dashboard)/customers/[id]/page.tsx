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
import { Pencil, Wrench } from "lucide-react";
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

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">
              {customer.first_name} {customer.last_name}
            </h2>
            {customer.customer_type === "fleet" && (
              <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900">
                Fleet{customer.fleet_account ? ` — ${customer.fleet_account}` : ""}
              </Badge>
            )}
          </div>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {customer.phone && <p>{formatPhone(customer.phone)}</p>}
            {customer.email && <p>{customer.email}</p>}
            {customer.address && <p>{customer.address}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/customers/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <CustomerDeleteButton customerId={id} />
        </div>
      </div>

      {customer.notes && (
        <Card className="mb-4">
          <CardContent className="p-4 text-sm">{customer.notes}</CardContent>
        </Card>
      )}

      <VehicleSection customerId={id} vehicles={vehicles} />

      {/* Job History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Wrench className="h-4 w-4" />
            Jobs ({jobs.length})
          </CardTitle>
          <Link href={`/jobs/new?customerId=${id}`}>
            <Button variant="outline" size="sm">
              New Job
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No jobs yet</p>
          ) : (
            <div className="-mx-5 divide-y">
              {jobs.map((job) => {
                const status = job.status as JobStatus;
                const colors = JOB_STATUS_COLORS[status];
                const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                    <div className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{job.category || "General"}</p>
                        <p className="text-xs text-muted-foreground">
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
  );
}
