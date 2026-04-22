import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInvoiceForJob } from "@/lib/actions/invoices";
import { getEstimateForJob } from "@/lib/actions/estimates";
import { getInspectionForJob } from "@/lib/actions/dvi";
import { getShopSettings } from "@/lib/actions/settings";
import { getPresets } from "@/lib/actions/presets";
import { calculateTotals } from "@/lib/utils/totals";
import { Button } from "@/components/ui/button";
import { StatusSelect } from "@/components/dashboard/status-select";
import { LineItemsList } from "@/components/dashboard/line-items-list";
import { EstimateSection } from "@/components/dashboard/estimate-section";
import { InvoiceSection } from "@/components/dashboard/invoice-section";
import { DviSection } from "@/components/dashboard/dvi-section";
import { JobDeleteButton } from "@/components/dashboard/job-delete-button";
import { SendReadyTextButton } from "@/components/dashboard/send-ready-text-button";
import { DateFinishedEditor } from "@/components/dashboard/date-finished-editor";
import { formatPhone, formatVehicle, formatCustomerName, formatRONumber, formatDate } from "@/lib/utils/format";
import { JobPaymentFooter } from "@/components/dashboard/job-payment-footer";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
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

const SECTION_LABEL = "text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";
const DL_TERM = "text-stone-500 dark:text-stone-400";
const DL_VALUE = "text-stone-900 dark:text-stone-50";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, invoice, estimate, dviInspection, settings, presets] = await Promise.all([
    getJob(id),
    getInvoiceForJob(id),
    getEstimateForJob(id),
    getInspectionForJob(id),
    getShopSettings(),
    getPresets(),
  ]);
  if (!job) notFound();

  const customer = job.customers as (Customer & { email: string | null; customer_type: string | null }) | null;
  const vehicle = job.vehicles as Vehicle | null;
  const tech = job.users as Pick<UserType, "id" | "name"> | null;
  const lineItems = (job.job_line_items || []) as JobLineItem[];
  const totals = calculateTotals(lineItems, settings);
  const grandTotal = totals.grandTotal;

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-24 space-y-4">

        {/* Action strip — page-level chrome on the gray bg */}
        <div className="flex items-center justify-between py-2">
          <Link href="/jobs">
            <Button variant="ghost" size="sm" className="-ml-3">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Jobs
            </Button>
          </Link>
          <div className="flex items-center gap-1.5">
            {job.status === "complete" && customer?.phone && (
              <SendReadyTextButton jobId={id} />
            )}
            <Link href={`/jobs/${id}/print`}>
              <Button variant="outline" size="sm">
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
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

        {/* Job info card — light container, internal sections separated by borders */}
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">

          {/* Identity strip: RO + status + title */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800 flex-wrap">
            {job.ro_number && (
              <span className="font-mono text-xs text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
                {formatRONumber(job.ro_number)}
              </span>
            )}
            <div className="shrink-0">
              <StatusSelect jobId={id} currentStatus={job.status as JobStatus} />
            </div>
            <h1 className="text-base lg:text-lg font-semibold text-stone-900 dark:text-stone-50 min-w-0 truncate">
              {job.title || <span className="italic text-stone-400 font-normal">Untitled job</span>}
            </h1>
          </div>

          {/* Info grid: customer · vehicle · details */}
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-10 px-4 py-4 ${job.notes ? "border-b border-stone-200 dark:border-stone-800" : ""}`}>
          {/* Customer */}
          <div>
            <div className={`${SECTION_LABEL} mb-1.5`}>Customer</div>
            {customer ? (
              <div className="space-y-1">
                <Link
                  href={`/customers/${customer.id}`}
                  className="block text-sm font-medium text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {formatCustomerName(customer)}
                </Link>
                {customer.phone && (
                  <div className="flex items-center gap-1.5 text-xs flex-wrap">
                    <span className="font-mono tabular-nums text-stone-600 dark:text-stone-400">
                      {formatPhone(customer.phone)}
                    </span>
                    <span className="text-stone-300 dark:text-stone-700">·</span>
                    <a href={`tel:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Call</a>
                    <span className="text-stone-300 dark:text-stone-700">·</span>
                    <a href={`sms:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Text</a>
                  </div>
                )}
                {customer.email && (
                  <div className="text-xs text-stone-600 dark:text-stone-400 truncate">{customer.email}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-stone-400">—</div>
            )}
          </div>

          {/* Vehicle */}
          <div>
            <div className={`${SECTION_LABEL} mb-1.5`}>Vehicle</div>
            {vehicle ? (
              <div className="space-y-1">
                <div className="text-sm font-medium text-stone-900 dark:text-stone-50">{formatVehicle(vehicle)}</div>
                {(vehicle.color || vehicle.mileage != null) && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400 flex-wrap">
                    {vehicle.color && <span>{vehicle.color}</span>}
                    {vehicle.color && vehicle.mileage != null && <span className="text-stone-300 dark:text-stone-700">·</span>}
                    {vehicle.mileage != null && (
                      <span className="font-mono tabular-nums">{vehicle.mileage.toLocaleString()} mi</span>
                    )}
                  </div>
                )}
                {vehicle.vin && (
                  <div className="text-xs font-mono text-stone-500 dark:text-stone-500 truncate">
                    <span className="uppercase text-stone-400">VIN </span>
                    {vehicle.vin}
                  </div>
                )}
                {vehicle.license_plate && (
                  <div className="text-xs font-mono text-stone-500 dark:text-stone-500">
                    <span className="uppercase text-stone-400">Plate </span>
                    {vehicle.license_plate}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-stone-400">—</div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className={`${SECTION_LABEL} mb-1.5`}>Details</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className={DL_TERM}>Received</dt>
              <dd className={`font-mono tabular-nums ${DL_VALUE}`}>{formatDate(job.date_received)}</dd>
              <dt className={DL_TERM}>Finished</dt>
              <dd>
                {job.date_finished ? (
                  <DateFinishedEditor jobId={id} dateFinished={job.date_finished} />
                ) : (
                  <span className="text-blue-600 dark:text-blue-400">Not set</span>
                )}
              </dd>
              <dt className={DL_TERM}>Tech</dt>
              <dd className={DL_VALUE}>
                {tech?.name || <span className="text-stone-400">Unassigned</span>}
              </dd>
              <dt className={DL_TERM}>Mileage in</dt>
              <dd className={`font-mono tabular-nums ${DL_VALUE}`}>
                {job.mileage_in ? `${job.mileage_in.toLocaleString()} mi` : "—"}
              </dd>
            </dl>
          </div>
        </div>

          {/* Notes */}
          {job.notes && (
            <div className="px-4 py-4">
              <div className={`${SECTION_LABEL} mb-1.5`}>Primary Complaint / Notes</div>
              <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed">
                {job.notes}
              </p>
            </div>
          )}
        </div>

        {/* Line Items — primary work area */}
        <div>
          <LineItemsList jobId={id} lineItems={lineItems} settings={settings} presets={presets} />
        </div>

        {/* Inspection */}
        <div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <DviSection jobId={id} inspection={dviInspection as any} />
        </div>

        {/* Estimate + Invoice */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EstimateSection jobId={id} estimate={estimate} />
          <InvoiceSection
            jobId={id}
            jobStatus={job.status as JobStatus}
            invoice={invoice}
            customerEmail={customer?.email || null}
            customerPhone={customer?.phone || null}
            isFleet={customer?.customer_type === "fleet"}
          />
        </div>
      </div>

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
