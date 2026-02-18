import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/actions/customers";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {customer.first_name} {customer.last_name}
          </h2>
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
        <Card className="mb-6">
          <CardContent className="p-4 text-sm">{customer.notes}</CardContent>
        </Card>
      )}

      <Separator className="mb-6" />

      <VehicleSection customerId={id} vehicles={vehicles} />

      <Separator className="mb-6" />

      {/* Job History */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Wrench className="h-5 w-5" />
            Jobs ({jobs.length})
          </h3>
          <Link href={`/jobs/new?customerId=${id}`}>
            <Button variant="outline" size="sm">
              New Job
            </Button>
          </Link>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs yet</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const status = job.status as JobStatus;
              const colors = JOB_STATUS_COLORS[status];
              return (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <Card className="transition-colors hover:bg-accent">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`${colors.bg} ${colors.text} ${colors.border}`}
                          >
                            {JOB_STATUS_LABELS[status]}
                          </Badge>
                          {job.category && (
                            <span className="text-sm text-muted-foreground">
                              {job.category}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {job.vehicles &&
                            formatVehicle(
                              job.vehicles as {
                                year: number | null;
                                make: string | null;
                                model: string | null;
                              }
                            )}
                          {job.date_received && (
                            <span className="ml-2">
                              {new Date(job.date_received).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
