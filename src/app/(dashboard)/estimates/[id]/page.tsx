import { notFound } from "next/navigation";
import Link from "next/link";
import { getEstimate } from "@/lib/actions/estimates";
import { getPresets } from "@/lib/actions/presets";
import { getShopSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import {
  EstimateLineItemsList,
  EstimateLineItemsAddButton,
} from "@/components/dashboard/estimate-line-items-list";
import { EstimateActions } from "@/components/dashboard/estimate-actions";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { SectionTitle } from "@/components/ui/section-title";
import { PageShell } from "@/components/layout/page-shell";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUS_COLORS,
} from "@/lib/constants";
import {
  formatCustomerName,
  formatVehicle,
  formatPhone,
  formatDateLong,
  getInitials,
} from "@/lib/utils/format";
import { ArrowLeft, FileText, User as UserIcon, Truck } from "lucide-react";
import type {
  EstimateStatus,
  EstimateLineItem,
  Customer,
  Vehicle,
} from "@/types";

const ESTIMATE_DOT: Record<EstimateStatus, string> = {
  draft: "bg-stone-400",
  sent: "bg-indigo-500",
  approved: "bg-emerald-500",
  declined: "bg-red-500",
};

const APPROVAL_METHOD_LABELS: Record<string, string> = {
  link: "via approval link",
  verbal: "verbally",
  in_person: "in person",
};

function formatEstimateNumber(n: number | null | undefined) {
  if (!n) return null;
  return `EST-${String(n).padStart(4, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estimate = await getEstimate(id);
  if (!estimate) return { title: "Estimate Not Found | ShopPilot" };
  const num = formatEstimateNumber(estimate.estimate_number);
  return { title: `${num ?? "Estimate"} | ShopPilot` };
}

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [estimate, settings, presets] = await Promise.all([
    getEstimate(id),
    getShopSettings(),
    getPresets(),
  ]);
  if (!estimate) notFound();

  const status = estimate.status as EstimateStatus;
  const statusColors = ESTIMATE_STATUS_COLORS[status];
  const lineItems = (estimate.estimate_line_items || []) as EstimateLineItem[];

  const customer = (estimate.customers as Customer | null) ?? null;
  const vehicle = (estimate.vehicles as Vehicle | null) ?? null;
  const job = estimate.jobs as {
    id: string;
    title: string | null;
    ro_number: number | null;
    status: string;
  } | null;

  const isDraft = status === "draft";
  const estimateNumber = formatEstimateNumber(estimate.estimate_number);

  // Back link points to the parent job when there is one (estimate was
  // created from a job), otherwise back to the customer.
  const backHref = job ? `/jobs/${job.id}` : customer ? `/customers/${customer.id}` : "/dashboard";
  const backLabel = job
    ? job.ro_number
      ? `RO-${String(job.ro_number).padStart(4, "0")}`
      : "Job"
    : customer
      ? formatCustomerName(customer)
      : "Dashboard";

  return (
    <PageShell width="wide">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 py-2">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            {backLabel}
          </Button>
        </Link>
      </div>

      <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
        <div className="px-5 lg:px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="w-9 h-9 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
                  {estimateNumber ?? "Estimate"}
                  <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                  Created {formatDateLong(estimate.created_at) ?? "—"}
                </div>
                <h2 className="mt-1.5 text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50 truncate">
                  Estimate
                </h2>
              </div>
            </div>
            <div className="shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${statusColors.bg} ${statusColors.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${ESTIMATE_DOT[status]}`} />
                {ESTIMATE_STATUS_LABELS[status]}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800 border-t border-stone-200 dark:border-stone-800">
          <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
            <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <UserIcon className="h-3 w-3" /> Customer
            </div>
            {customer ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-md grid place-items-center text-sm font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 flex-none">
                    {getInitials(formatCustomerName(customer))}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="block text-sm font-semibold text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                    >
                      {formatCustomerName(customer)}
                    </Link>
                  </div>
                </div>
                <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
                  <dt className={SECTION_LABEL}>Phone</dt>
                  <dd className="min-w-0 flex items-center gap-1.5 flex-wrap">
                    {customer.phone ? (
                      <>
                        <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                          {formatPhone(customer.phone)}
                        </span>
                        <a href={`tel:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                          Call
                        </a>
                        <a href={`sms:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                          Text
                        </a>
                      </>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </dd>
                  <dt className={SECTION_LABEL}>Email</dt>
                  <dd className="min-w-0 text-stone-900 dark:text-stone-50 truncate">
                    {customer.email || <span className="text-stone-400">—</span>}
                  </dd>
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
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                      {formatVehicle(vehicle)}
                    </div>
                    {vehicle.color && (
                      <div className="text-xs text-stone-500 dark:text-stone-400 capitalize mt-0.5">
                        {vehicle.color}
                      </div>
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
                </dl>
              </>
            ) : (
              <div className="text-sm text-stone-400">—</div>
            )}
          </div>
        </div>

        {(estimate.sent_at || estimate.approved_at || estimate.declined_at) && (
          <div className="px-5 lg:px-6 py-3 border-t border-stone-200 dark:border-stone-800 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
            {estimate.sent_at && (
              <span>
                <span className={SECTION_LABEL}>Sent</span>{" "}
                <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                  {formatDateLong(estimate.sent_at)}
                </span>
              </span>
            )}
            {estimate.approved_at && (
              <span>
                <span className={SECTION_LABEL}>Approved</span>{" "}
                <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                  {formatDateLong(estimate.approved_at)}
                </span>
                {estimate.approval_method && (
                  <span className="ml-1 text-stone-500 dark:text-stone-400">
                    {APPROVAL_METHOD_LABELS[estimate.approval_method]}
                  </span>
                )}
              </span>
            )}
            {estimate.declined_at && (
              <span>
                <span className={SECTION_LABEL}>Declined</span>{" "}
                <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                  {formatDateLong(estimate.declined_at)}
                </span>
              </span>
            )}
          </div>
        )}
      </section>

      <section className="pt-2">
        <SectionTitle
          title="Line items"
          action={
            isDraft ? (
              <EstimateLineItemsAddButton
                estimateId={id}
                presets={presets}
                settings={settings}
              />
            ) : undefined
          }
        />
        <EstimateLineItemsList
          estimateId={id}
          lineItems={lineItems}
          readOnly={!isDraft}
          settings={settings}
        />
      </section>

      <section className="pt-2">
        <SectionTitle title="Actions" />
        <EstimateActions
          estimateId={id}
          status={status}
          approvalToken={estimate.approval_token}
          jobId={job?.id ?? null}
          customerId={customer?.id ?? null}
        />
      </section>
    </PageShell>
  );
}
