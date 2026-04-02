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
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { JobPaymentFooter } from "@/components/dashboard/job-payment-footer";
import { ArrowLeft, Pencil, Car, Printer, StickyNote } from "lucide-react";
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
  const initials = customer ? `${customer.first_name?.[0] ?? ""}${customer.last_name?.[0] ?? ""}`.toUpperCase() : null;

  return (
    <><div className="p-4 pb-24 lg:p-10 lg:pb-24 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-8 animate-in-up">
        <Link href="/jobs">
          <Button variant="ghost" size="sm" className="mb-3">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Button>
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
                Repair Order Detail
              </span>
              <StatusSelect jobId={id} currentStatus={job.status as JobStatus} />
            </div>
            <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
              {job.title || "Job"}
            </h2>
            {job.ro_number && (
              <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">{formatRONumber(job.ro_number)}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "complete" && customer?.phone && (
              <SendReadyTextButton jobId={id} />
            )}
            <Link href={`/jobs/${id}/print`}>
              <Button variant="outline" size="sm" className="rounded-full">
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print RO
              </Button>
            </Link>
            <Link href={`/jobs/${id}/edit`}>
              <Button variant="outline" size="sm" className="rounded-full">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            <JobDeleteButton jobId={id} />
          </div>
        </div>
      </div>

      {/* ── Metadata Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 lg:gap-8 mb-8 pt-6 border-t border-stone-200/50 dark:border-stone-700/30 animate-in-up stagger-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">Date Received</p>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{formatDate(job.date_received)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">Date Finished</p>
          {job.date_finished ? (
            <DateFinishedEditor jobId={id} dateFinished={job.date_finished} />
          ) : (
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Not Set</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">Assigned Tech</p>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{tech?.name || "Unassigned"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">Current Mileage</p>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{job.mileage_in ? `${job.mileage_in.toLocaleString()} mi` : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">Payment Status</p>
          {job.payment_status ? (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${PAYMENT_STATUS_COLORS[job.payment_status as PaymentStatus].bg} ${PAYMENT_STATUS_COLORS[job.payment_status as PaymentStatus].text}`}>
                {PAYMENT_STATUS_LABELS[job.payment_status as PaymentStatus]}
              </span>
              {job.payment_method && (
                <span className="text-xs text-stone-400 dark:text-stone-500">
                  {PAYMENT_METHOD_LABELS[job.payment_method as PaymentMethod]}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-stone-400 dark:text-stone-500">Not Set</p>
          )}
        </div>
      </div>

      {/* ── Customer & Vehicle Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6 mb-8 animate-in-up stagger-2">
        {customer && (
          <div className="bg-card rounded-xl shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 overflow-hidden">
            <div className="flex items-center justify-between bg-stone-800 dark:bg-stone-900 px-5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Customer</p>
              <Link href={`/customers/${customer.id}`} className="text-stone-300 hover:text-white transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              </Link>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-sm font-black text-blue-700 dark:text-blue-400 border-4 border-white dark:border-stone-900 shadow-sm">
                  {initials}
                </div>
                <div>
                  <p className="text-base font-bold text-stone-900 dark:text-stone-50">{formatCustomerName(customer)}</p>
                  {customer.phone && <p className="text-sm text-stone-500 dark:text-stone-400">{formatPhone(customer.phone)}</p>}
                  {customer.email && <p className="text-sm text-blue-600 dark:text-blue-400 truncate max-w-[180px]">{customer.email}</p>}
                </div>
              </div>
              {customer.phone && (
                <div className="flex gap-2">
                  <a href={`tel:${customer.phone}`} className="flex-1 py-2 bg-stone-100 dark:bg-stone-800 text-[11px] font-bold uppercase text-center text-stone-900 dark:text-stone-50 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors">
                    Call
                  </a>
                  <a href={`sms:${customer.phone}`} className="flex-1 py-2 bg-stone-100 dark:bg-stone-800 text-[11px] font-bold uppercase text-center text-stone-900 dark:text-stone-50 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors">
                    Text
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {vehicle && (
          <div className="bg-card rounded-xl shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 overflow-hidden">
            <div className="flex items-center justify-between bg-stone-800 dark:bg-stone-900 px-5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Vehicle</p>
              <Car className="h-4 w-4 text-stone-300" />
            </div>
            <div className="p-5">
              <div>
                <p className="text-[10px] font-bold uppercase text-stone-400 dark:text-stone-500">Model</p>
                <p className="text-lg font-bold text-stone-900 dark:text-stone-50 leading-tight">{formatVehicle(vehicle)}</p>
                {vehicle.color && <p className="text-sm text-stone-500 dark:text-stone-400">{vehicle.color}</p>}
              </div>
              {vehicle.vin && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase text-stone-400 dark:text-stone-500">VIN</p>
                  <p className="text-sm text-stone-600 dark:text-stone-400 bg-stone-50 dark:bg-stone-800 px-2 py-1 rounded inline-block mt-0.5">{vehicle.vin}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      {job.notes && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden mb-8 animate-in-up stagger-2">
          <div className="flex items-center gap-2 bg-stone-800 dark:bg-stone-900 px-5 py-3">
            <StickyNote className="h-3.5 w-3.5 text-stone-300" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Primary Complaint / Notes</p>
          </div>
          <div className="p-5">
            <p className="text-sm text-stone-900 dark:text-stone-50 leading-relaxed italic whitespace-pre-wrap">{job.notes}</p>
          </div>
        </div>
      )}

      {/* ── Line Items ── */}
      <div className="mb-8 animate-in-up stagger-3">
        <LineItemsList jobId={id} lineItems={lineItems} settings={settings} presets={presets} />
      </div>

      {/* ── DVI ── */}
      <div className="mb-8 animate-in-up stagger-3">
        <DviSection jobId={id} inspection={dviInspection as any} />
      </div>

      {/* ── Estimate + Invoice ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 animate-in-up stagger-4">
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
