import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInvoiceForJob } from "@/lib/actions/invoices";
import { getEstimateForJob } from "@/lib/actions/estimates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusSelect } from "@/components/dashboard/status-select";
import { LineItemsList } from "@/components/dashboard/line-items-list";
import { EstimateSection } from "@/components/dashboard/estimate-section";
import { InvoiceSection } from "@/components/dashboard/invoice-section";
import { JobDeleteButton } from "@/components/dashboard/job-delete-button";
import { formatPhone, formatVehicle, formatCustomerName } from "@/lib/utils/format";
import { Pencil, User, Car, HardHat } from "lucide-react";
import type { JobStatus, Customer, Vehicle, JobLineItem, User as UserType } from "@/types";

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
  const [job, invoice, estimate] = await Promise.all([
    getJob(id),
    getInvoiceForJob(id),
    getEstimateForJob(id),
  ]);
  if (!job) notFound();

  const customer = job.customers as (Customer & { email: string | null }) | null;
  const vehicle = job.vehicles as Vehicle | null;
  const tech = job.users as Pick<UserType, "id" | "name"> | null;
  const lineItems = (job.job_line_items || []) as JobLineItem[];

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {job.category || "Job"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Received {new Date(job.date_received).toLocaleDateString()}
            {job.date_finished &&
              ` | Finished ${new Date(job.date_finished).toLocaleDateString()}`}
          </p>
          {tech && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <HardHat className="h-3.5 w-3.5" />
              {tech.name}
            </p>
          )}
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
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {customer && (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
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
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
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
          <Card className="mb-4">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{job.notes}</p>
            </CardContent>
          </Card>
        </>
      )}

      <Separator className="mb-4" />

      {/* Line Items */}
      <LineItemsList jobId={id} lineItems={lineItems} />

      {/* Estimate */}
      <div className="mt-4">
        <EstimateSection jobId={id} estimate={estimate} />
      </div>

      {/* Invoice */}
      <div className="mt-4">
        <InvoiceSection
          jobId={id}
          jobStatus={job.status as JobStatus}
          invoice={invoice}
          customerEmail={customer?.email || null}
        />
      </div>
    </div>
  );
}
