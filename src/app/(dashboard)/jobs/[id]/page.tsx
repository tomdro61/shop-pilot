import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusSelect } from "@/components/dashboard/status-select";
import { LineItemsList } from "@/components/dashboard/line-items-list";
import { JobDeleteButton } from "@/components/dashboard/job-delete-button";
import { formatPhone, formatVehicle, formatCustomerName } from "@/lib/utils/format";
import { Pencil, User, Car } from "lucide-react";
import type { JobStatus, Customer, Vehicle, JobLineItem } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return { title: "Job Not Found | ShopPilot" };
  const customer = job.customers as Customer | null;
  return {
    title: `Job - ${customer ? formatCustomerName(customer) : "Unknown"} | ShopPilot`,
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const customer = job.customers as Customer | null;
  const vehicle = job.vehicles as Vehicle | null;
  const lineItems = (job.job_line_items || []) as JobLineItem[];

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {job.category || "Job"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Received {new Date(job.date_received).toLocaleDateString()}
            {job.date_finished &&
              ` | Finished ${new Date(job.date_finished).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect jobId={id} currentStatus={job.status as JobStatus} />
          <Link href={`/jobs/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <JobDeleteButton jobId={id} />
        </div>
      </div>

      {/* Customer & Vehicle Info */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {customer && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/customers/${customer.id}`}
                className="font-medium hover:underline"
              >
                {formatCustomerName(customer)}
              </Link>
              {customer.phone && (
                <p className="text-sm text-muted-foreground">
                  {formatPhone(customer.phone)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {vehicle && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Car className="h-4 w-4" />
                Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{formatVehicle(vehicle)}</p>
              {vehicle.vin && (
                <p className="text-sm text-muted-foreground">
                  VIN: {vehicle.vin}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notes */}
      {job.notes && (
        <>
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{job.notes}</p>
            </CardContent>
          </Card>
        </>
      )}

      <Separator className="mb-6" />

      {/* Line Items */}
      <LineItemsList jobId={id} lineItems={lineItems} />
    </div>
  );
}
