import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInvoiceForJob } from "@/lib/actions/invoices";
import { getEstimateForJob } from "@/lib/actions/estimates";
import { getInspectionForJob } from "@/lib/actions/dvi";
import { getShopSettings } from "@/lib/actions/settings";
import { getPresets } from "@/lib/actions/presets";
import { getTechnicians } from "@/lib/actions/team";
import { calculateTotals } from "@/lib/utils/totals";
import { Button } from "@/components/ui/button";
import { StatusSelect } from "@/components/dashboard/status-select";
import { LineItemsList, LineItemsAddButton } from "@/components/dashboard/line-items-list";
import { EstimateSection } from "@/components/dashboard/estimate-section";
import { InvoiceSection } from "@/components/dashboard/invoice-section";
import { DviSection } from "@/components/dashboard/dvi-section";
import { JobDeleteButton } from "@/components/dashboard/job-delete-button";
import { SendReadyTextButton } from "@/components/dashboard/send-ready-text-button";
import { JobDateEditor } from "@/components/dashboard/job-date-editor";
import { JobTitleEditor } from "@/components/dashboard/job-title-editor";
import { JobNotesEditor } from "@/components/dashboard/job-notes-editor";
import { JobMileageEditor } from "@/components/dashboard/job-mileage-editor";
import { JobTechEditor } from "@/components/dashboard/job-tech-editor";
import { JobProgressStepper } from "@/components/dashboard/job-progress-stepper";
import { SECTION_LABEL } from "@/components/ui/section-card";
import {
  formatPhone,
  formatVehicle,
  formatCustomerName,
  formatRONumber,
  formatDateLong,
  getInitials,
} from "@/lib/utils/format";
import { JobPaymentFooter } from "@/components/dashboard/job-payment-footer";
import { ArrowLeft, Pencil, Printer, User as UserIcon, Truck, ClipboardList } from "lucide-react";
import type { JobStatus, PaymentStatus, PaymentMethod, Customer, Vehicle, JobLineItem, User as UserType } from "@/types";

function SectionTitle({
  num,
  title,
  sub,
  action,
}: {
  num: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-1 mb-2.5">
      <span className="font-mono tabular-nums text-[11px] font-semibold tracking-[0.08em] text-stone-400 dark:text-stone-600">
        {num}
      </span>
      <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50 tracking-tight">
        {title}
      </h2>
      {sub && (
        <span className="text-xs text-stone-500 dark:text-stone-400">{sub}</span>
      )}
      {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
    </div>
  );
}

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
  const [job, invoice, estimate, dviInspection, settings, presets, technicians] = await Promise.all([
    getJob(id),
    getInvoiceForJob(id),
    getEstimateForJob(id),
    getInspectionForJob(id),
    getShopSettings(),
    getPresets(),
    getTechnicians(),
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
      <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-24 space-y-5 lg:space-y-6">

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

        <section className="bg-card border border-stone-300 dark:border-stone-800 rounded-lg overflow-hidden">
          <div className="px-5 lg:px-6 py-5">
            <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
              {job.ro_number ? formatRONumber(job.ro_number) : "—"}
              <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
              Opened {formatDateLong(job.date_received) ?? "—"}
            </div>
            <div className="mt-1.5">
              <JobTitleEditor jobId={id} value={job.title} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <StatusSelect jobId={id} currentStatus={job.status as JobStatus} />
              {tech?.name && (
                <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  {tech.name}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 border-t border-stone-300 dark:border-stone-800 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800">
            <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
              <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
                <UserIcon className="h-3 w-3" /> Customer
              </div>
              {customer ? (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md grid place-items-center text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
                      {getInitials(formatCustomerName(customer))}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="block text-sm font-semibold text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                      >
                        {formatCustomerName(customer)}
                      </Link>
                      {customer.customer_type && (
                        <div className="text-xs text-stone-500 dark:text-stone-400 capitalize mt-0.5">
                          {customer.customer_type}
                        </div>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
                    {customer.phone && (
                      <>
                        <dt className={SECTION_LABEL}>Phone</dt>
                        <dd className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">{formatPhone(customer.phone)}</span>
                          <a href={`tel:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Call</a>
                          <a href={`sms:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Text</a>
                        </dd>
                      </>
                    )}
                    {customer.email && (
                      <>
                        <dt className={SECTION_LABEL}>Email</dt>
                        <dd className="min-w-0 text-stone-900 dark:text-stone-50 truncate">{customer.email}</dd>
                      </>
                    )}
                    {customer.address && (
                      <>
                        <dt className={SECTION_LABEL}>Address</dt>
                        <dd className="min-w-0 text-stone-900 dark:text-stone-50 truncate">{customer.address}</dd>
                      </>
                    )}
                  </dl>
                </>
              ) : (
                <div className="text-sm text-stone-400">—</div>
              )}
            </div>

            <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
              <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
                <Truck className="h-3 w-3" /> Vehicle
              </div>
              {vehicle ? (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md grid place-items-center bg-stone-100 text-stone-600 border border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800 flex-none">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">{formatVehicle(vehicle)}</div>
                      {vehicle.color && (
                        <div className="text-xs text-stone-500 dark:text-stone-400 capitalize mt-0.5">{vehicle.color}</div>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
                    <dt className={SECTION_LABEL}>VIN</dt>
                    <dd className="min-w-0 font-mono tabular-nums text-stone-900 dark:text-stone-50 truncate">
                      {vehicle.vin || <span className="text-stone-400 font-sans">—</span>}
                    </dd>
                    <dt className={SECTION_LABEL}>Plate</dt>
                    <dd className="min-w-0 font-mono tabular-nums text-stone-900 dark:text-stone-50">
                      {vehicle.license_plate || <span className="text-stone-400 font-sans">—</span>}
                    </dd>
                    <dt className={SECTION_LABEL}>Mileage</dt>
                    <dd className="min-w-0 font-mono tabular-nums text-stone-900 dark:text-stone-50">
                      {vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} mi` : <span className="text-stone-400 font-sans">—</span>}
                    </dd>
                  </dl>
                </>
              ) : (
                <div className="text-sm text-stone-400">—</div>
              )}
            </div>

            <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
              <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
                <ClipboardList className="h-3 w-3" /> Details
              </div>
              <JobTechEditor jobId={id} currentTech={tech} techs={technicians} />
              <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
                <dt className={SECTION_LABEL}>Received</dt>
                <dd className="min-w-0 text-xs">
                  <JobDateEditor jobId={id} field="date_received" value={job.date_received} />
                </dd>
                <dt className={SECTION_LABEL}>Finished</dt>
                <dd className="min-w-0 text-xs">
                  <JobDateEditor jobId={id} field="date_finished" value={job.date_finished} />
                </dd>
                <dt className={SECTION_LABEL}>Mileage in</dt>
                <dd className="min-w-0 text-xs">
                  <JobMileageEditor jobId={id} value={job.mileage_in} />
                </dd>
              </dl>
            </div>
          </div>

          <div className="border-t border-stone-300 dark:border-stone-800 px-5 lg:px-6 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Notes
              </span>
            </div>
            <JobNotesEditor jobId={id} value={job.notes} />
          </div>
        </section>

        <section className="pt-2">
          <SectionTitle num="01" title="Progress" />
          <JobProgressStepper
            currentStatus={job.status as JobStatus}
            dateReceived={job.date_received}
            dateFinished={job.date_finished}
          />
        </section>

        <section className="pt-2">
          <SectionTitle
            num="02"
            title="Line items"
            action={<LineItemsAddButton jobId={id} settings={settings} presets={presets} />}
          />
          <LineItemsList jobId={id} lineItems={lineItems} settings={settings} />
        </section>

        <section className="pt-2">
          <SectionTitle num="03" title="Inspection" />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <DviSection jobId={id} inspection={dviInspection as any} />
        </section>

        <section className="pt-2">
          <SectionTitle num="04" title="Estimate & invoice" />
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
        </section>
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
