import { notFound } from "next/navigation";
import Link from "next/link";
import { getEstimate } from "@/lib/actions/estimates";
import { getShopSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { EstimateLineItemsList, EstimateLineItemsAddButton } from "@/components/dashboard/estimate-line-items-list";
import { EstimateActions } from "@/components/dashboard/estimate-actions";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { SectionTitle } from "@/components/ui/section-title";
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
import { ArrowLeft, User as UserIcon, Truck } from "lucide-react";
import type {
  EstimateStatus,
  EstimateLineItem,
  Customer,
  Vehicle,
} from "@/types";

const ESTIMATE_DOT: Record<EstimateStatus, string> = {
  draft: "bg-stone-400",
  sent: "bg-green-500",
  approved: "bg-green-500",
  declined: "bg-red-500",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estimate = await getEstimate(id);
  if (!estimate) return { title: "Estimate Not Found | ShopPilot" };
  return { title: `Estimate | ShopPilot` };
}

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [estimate, settings] = await Promise.all([
    getEstimate(id),
    getShopSettings(),
  ]);
  if (!estimate) notFound();

  const status = estimate.status as EstimateStatus;
  const statusColors = ESTIMATE_STATUS_COLORS[status];
  const lineItems = (estimate.estimate_line_items || []) as EstimateLineItem[];

  const job = estimate.jobs as {
    id: string;
    title: string | null;
    customer_id: string;
    vehicle_id: string | null;
    customers: Customer | null;
    vehicles: Vehicle | null;
  } | null;

  const customer = job?.customers || null;
  const vehicle = job?.vehicles || null;
  const isDraft = status === "draft";

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 py-2">
        {job ? (
          <Link href={`/jobs/${job.id}`}>
            <Button variant="ghost" size="sm" className="-ml-3">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Job
            </Button>
          </Link>
        ) : (
          <span />
        )}
      </div>

      <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 lg:px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
                Estimate
                <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                Created {formatDateLong(estimate.created_at) ?? "—"}
              </div>
              <h2 className="mt-1.5 text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50 truncate">
                {job?.title || "Estimate"}
              </h2>
            </div>
            <div className="shrink-0">
              <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColors.bg} ${statusColors.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ESTIMATE_DOT[status]}`} />
                {ESTIMATE_STATUS_LABELS[status]}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-100 dark:divide-stone-800/60 border-t border-stone-100 dark:border-stone-800/60">
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
                  </div>
                </div>
                <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
                  <dt className={SECTION_LABEL}>Phone</dt>
                  <dd className="min-w-0 flex items-center gap-1.5 flex-wrap">
                    {customer.phone ? (
                      <>
                        <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">{formatPhone(customer.phone)}</span>
                        <a href={`tel:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Call</a>
                        <a href={`sms:${customer.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Text</a>
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
                </dl>
              </>
            ) : (
              <div className="text-sm text-stone-400">—</div>
            )}
          </div>
        </div>

        {(estimate.sent_at || estimate.approved_at || estimate.declined_at) && (
          <div className="px-5 lg:px-6 py-3 border-t border-stone-100 dark:border-stone-800/60 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
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
          num="01"
          title="Line items"
          action={isDraft ? <EstimateLineItemsAddButton estimateId={id} /> : undefined}
        />
        <EstimateLineItemsList
          estimateId={id}
          lineItems={lineItems}
          readOnly={!isDraft}
          settings={settings}
        />
      </section>

      <section className="pt-2">
        <SectionTitle num="02" title="Actions" />
        <EstimateActions
          estimateId={id}
          jobId={job?.id || ""}
          status={status}
          approvalToken={estimate.approval_token}
        />
      </section>
    </div>
  );
}
