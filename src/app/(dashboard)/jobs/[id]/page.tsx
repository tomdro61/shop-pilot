import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInvoiceForJob } from "@/lib/actions/invoices";
import { getEstimateForJob } from "@/lib/actions/estimates";
import { getShopSettings } from "@/lib/actions/settings";
import { calculateTotals } from "@/lib/utils/totals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusSelect } from "@/components/dashboard/status-select";
import { LineItemsList } from "@/components/dashboard/line-items-list";
import { EstimateSection } from "@/components/dashboard/estimate-section";
import { InvoiceSection } from "@/components/dashboard/invoice-section";
import { JobDeleteButton } from "@/components/dashboard/job-delete-button";
import { formatPhone, formatVehicle, formatCustomerName, formatRONumber } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { JobPaymentFooter } from "@/components/dashboard/job-payment-footer";
import { ArrowLeft, Pencil, User, Car, HardHat, Calendar, Printer } from "lucide-react";
import type { JobStatus, PaymentStatus, PaymentMethod, Customer, Vehicle, JobLineItem, User as UserType } from "@/types";

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
  const [job, invoice, estimate, settings] = await Promise.all([
    getJob(id),
    getInvoiceForJob(id),
    getEstimateForJob(id),
    getShopSettings(),
  ]);
  if (!job) notFound();

  const customer = job.customers as (Customer & { email: string | null; customer_type: string | null }) | null;
  const vehicle = job.vehicles as Vehicle | null;
  const tech = job.users as Pick<UserType, "id" | "name"> | null;
  const lineItems = (job.job_line_items || []) as JobLineItem[];
  const totals = calculateTotals(lineItems, settings);
  const grandTotal = totals.grandTotal;

  return (
    <><div className="mx-auto max-w-4xl p-4 pb-20 lg:p-6 lg:pb-20">
      {/* Header */}
      <div className="mb-6 animate-in-up">
        <Link href="/jobs">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Button>
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight lg:text-2xl text-stone-900 dark:text-stone-50">
                {job.title || "Job"}
              </h2>
              {job.ro_number && (
                <span className="text-sm font-medium text-stone-400 dark:text-stone-500">
                  {formatRONumber(job.ro_number)}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(job.date_received).toLocaleDateString()}
              </span>
              {job.date_finished && (
                <span>Finished {new Date(job.date_finished).toLocaleDateString()}</span>
              )}
              {tech && (
                <span className="inline-flex items-center gap-1">
                  <HardHat className="h-3 w-3" />
                  {tech.name}
                </span>
              )}
              {job.mileage_in && (
                <span>{job.mileage_in.toLocaleString()} mi</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {job.payment_status && (
                <Badge
                  className={`border-transparent ${PAYMENT_STATUS_COLORS[job.payment_status as PaymentStatus].bg} ${PAYMENT_STATUS_COLORS[job.payment_status as PaymentStatus].text}`}
                >
                  {PAYMENT_STATUS_LABELS[job.payment_status as PaymentStatus]}
                </Badge>
              )}
              {job.payment_method && (
                <span className="text-xs text-muted-foreground">
                  via {PAYMENT_METHOD_LABELS[job.payment_method as PaymentMethod]}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusSelect jobId={id} currentStatus={job.status as JobStatus} />
            <Link href={`/jobs/${id}/print`}>
              <Button variant="outline" size="sm">
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print RO
              </Button>
            </Link>
            <Link href={`/jobs/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            <JobDeleteButton jobId={id} />
          </div>
        </div>
      </div>

      {/* Customer & Vehicle Info */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 animate-in-up stagger-1">
        {customer && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-xs font-semibold text-blue-700 dark:text-blue-400">
                  {customer.first_name?.[0]}{customer.last_name?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Customer</p>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {formatCustomerName(customer)}
                  </Link>
                  {customer.phone && (
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(customer.phone)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {vehicle && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950">
                  <Car className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Vehicle</p>
                  <p className="text-sm font-medium">{formatVehicle(vehicle)}</p>
                  {vehicle.vin && (
                    <p className="font-mono text-xs text-muted-foreground">
                      {vehicle.vin}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notes */}
      {job.notes && (
        <Card className="mb-4 animate-in-up stagger-2">
          <CardContent className="p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Notes</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{job.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <div className="animate-in-up stagger-3">
        <LineItemsList jobId={id} lineItems={lineItems} settings={settings} />
      </div>

      {/* Estimate + Invoice */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 animate-in-up stagger-4">
        <EstimateSection jobId={id} estimate={estimate} />
        <InvoiceSection
          jobId={id}
          jobStatus={job.status as JobStatus}
          invoice={invoice}
          customerEmail={customer?.email || null}
          isFleet={customer?.customer_type === "fleet"}
        />
      </div>

    </div>

    {/* Sticky Payment Footer */}
    <JobPaymentFooter
      jobId={id}
      jobStatus={job.status as JobStatus}
      paymentStatus={(job.payment_status || "unpaid") as PaymentStatus}
      paymentMethod={(job.payment_method as PaymentMethod) || null}
      grandTotal={grandTotal}
    />
    </>
  );
}
