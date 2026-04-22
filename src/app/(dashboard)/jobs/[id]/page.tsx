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
import { JobProgressStepper } from "@/components/dashboard/job-progress-stepper";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { formatPhone, formatVehicle, formatCustomerName, formatRONumber, formatDate } from "@/lib/utils/format";
import { JobPaymentFooter } from "@/components/dashboard/job-payment-footer";
import { ArrowLeft, Pencil, Printer, User as UserIcon, Truck, ClipboardList } from "lucide-react";
import type { JobStatus, PaymentStatus, PaymentMethod, Customer, Vehicle, JobLineItem, User as UserType } from "@/types";

function formatDateLong(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(value: string | null | undefined, fallback = "?"): string {
  if (!value) return fallback;
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SectionTitle({ num, title, sub }: { num: string; title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-1 mb-2.5">
      <span className="font-mono tabular-nums text-[11px] font-semibold tracking-[0.08em] text-stone-400 dark:text-stone-600">
        {num}
      </span>
      <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50 tracking-tight">
        {title}
      </h2>
      {sub && (
        <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">{sub}</span>
      )}
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
      <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-24 space-y-5 lg:space-y-6">

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

        {/* Hero — identity + 3-column overview + notes, all in one flat card */}
        <section className="bg-card border border-stone-300 dark:border-stone-800 rounded-lg overflow-hidden">

          {/* Hero top: RO/opened strip, title, status pills */}
          <div className="px-5 lg:px-6 py-5">
            <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
              {job.ro_number ? formatRONumber(job.ro_number) : "—"}
              <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
              Opened {formatDateLong(job.date_received) ?? "—"}
            </div>
            <h1 className="text-[22px] lg:text-[26px] font-semibold tracking-tight text-stone-900 dark:text-stone-50 mt-1.5 leading-tight">
              {job.title || <span className="italic text-stone-400 font-normal">Untitled job</span>}
            </h1>
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

          {/* 3-column overview: Customer / Vehicle / Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 border-t border-stone-300 dark:border-stone-800 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800">

            {/* CUSTOMER */}
            <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
              <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
                <UserIcon className="h-3 w-3" /> Customer
              </div>
              {customer ? (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md grid place-items-center text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
                      {initials(formatCustomerName(customer))}
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
                        <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Phone</dt>
                        <dd className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono tabular-nums text-stone-800 dark:text-stone-200">{formatPhone(customer.phone)}</span>
                          <a href={`tel:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Call</a>
                          <a href={`sms:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Text</a>
                        </dd>
                      </>
                    )}
                    {customer.email && (
                      <>
                        <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Email</dt>
                        <dd className="min-w-0 text-stone-800 dark:text-stone-200 truncate">{customer.email}</dd>
                      </>
                    )}
                    {customer.address && (
                      <>
                        <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Address</dt>
                        <dd className="min-w-0 text-stone-800 dark:text-stone-200 truncate">{customer.address}</dd>
                      </>
                    )}
                  </dl>
                </>
              ) : (
                <div className="text-sm text-stone-400">—</div>
              )}
            </div>

            {/* VEHICLE */}
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
                    {vehicle.vin && (
                      <>
                        <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>VIN</dt>
                        <dd className="min-w-0 font-mono tabular-nums text-stone-800 dark:text-stone-200 truncate">{vehicle.vin}</dd>
                      </>
                    )}
                    {vehicle.license_plate && (
                      <>
                        <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Plate</dt>
                        <dd className="min-w-0 font-mono tabular-nums text-stone-800 dark:text-stone-200">{vehicle.license_plate}</dd>
                      </>
                    )}
                    {vehicle.mileage != null && (
                      <>
                        <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Mileage</dt>
                        <dd className="min-w-0 font-mono tabular-nums text-stone-800 dark:text-stone-200">{vehicle.mileage.toLocaleString()} mi</dd>
                      </>
                    )}
                  </dl>
                </>
              ) : (
                <div className="text-sm text-stone-400">—</div>
              )}
            </div>

            {/* DETAILS */}
            <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
              <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
                <ClipboardList className="h-3 w-3" /> Details
              </div>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-md grid place-items-center text-sm font-semibold flex-none ${
                  tech?.name
                    ? "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900"
                    : "bg-stone-100 text-stone-400 border border-stone-200 dark:bg-stone-900 dark:text-stone-600 dark:border-stone-800"
                }`}>
                  {tech?.name ? initials(tech.name) : "—"}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                    {tech?.name || <span className="text-stone-400 font-normal">Unassigned</span>}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Technician</div>
                </div>
              </div>
              <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
                <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Received</dt>
                <dd className={`min-w-0 font-mono tabular-nums ${DL_VALUE}`}>{formatDate(job.date_received)}</dd>
                <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Finished</dt>
                <dd className="min-w-0">
                  {job.date_finished ? (
                    <DateFinishedEditor jobId={id} dateFinished={job.date_finished} />
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400">Not set</span>
                  )}
                </dd>
                {job.mileage_in != null && (
                  <>
                    <dt className={`${DL_TERM} text-[11px] uppercase tracking-wide font-semibold`}>Mileage in</dt>
                    <dd className={`min-w-0 font-mono tabular-nums ${DL_VALUE}`}>{job.mileage_in.toLocaleString()} mi</dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* Notes — labeled "Customer concern" with amber accent */}
          {job.notes && (
            <div className="border-t border-stone-300 dark:border-stone-800 px-5 lg:px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Customer concern
                </span>
              </div>
              <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed">
                {job.notes}
              </p>
            </div>
          )}
        </section>

        {/* Progress */}
        <section className="pt-2">
          <SectionTitle num="01" title="Progress" />
          <JobProgressStepper
            currentStatus={job.status as JobStatus}
            dateReceived={job.date_received}
            dateFinished={job.date_finished}
          />
        </section>

        {/* Line Items */}
        <section className="pt-2">
          <SectionTitle num="02" title="Line items" />
          <LineItemsList jobId={id} lineItems={lineItems} settings={settings} presets={presets} />
        </section>

        {/* Inspection */}
        <section className="pt-2">
          <SectionTitle num="03" title="Inspection" />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <DviSection jobId={id} inspection={dviInspection as any} />
        </section>

        {/* Estimate + Invoice */}
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
