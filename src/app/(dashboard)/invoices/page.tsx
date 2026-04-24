import { Suspense } from "react";
import Link from "next/link";
import { getInvoices } from "@/lib/actions/invoices";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { ExternalLink } from "lucide-react";
import { InvoiceSearch } from "./invoice-search";
import { InvoiceStatusFilter } from "./invoice-status-filter";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { formatCurrencyWhole, formatDate, getInitials } from "@/lib/utils/format";
import type { InvoiceStatus } from "@/types";

export const metadata = {
  title: "Invoices | ShopPilot",
};

const STATUS_BORDER: Record<InvoiceStatus, string> = {
  draft: "border-l-stone-300 dark:border-l-stone-700",
  sent: "border-l-amber-500",
  paid: "border-l-emerald-500",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;
  const invoices = await getInvoices(status, search);

  return (
    <div className="p-4 lg:p-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Suspense>
          <InvoiceSearch />
        </Suspense>
        <Suspense>
          <InvoiceStatusFilter />
        </Suspense>
        <span className="hidden md:inline text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
          {invoices.length.toLocaleString()}
        </span>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm py-12 text-center">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">No invoices found</p>
          <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">Try adjusting your filters</p>
        </div>
      ) : (
        <>
          {/* Desktop: dense table */}
          <div className="hidden md:block bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900/40">
                  <th className={`text-left px-3 py-2 ${SECTION_LABEL}`}>Customer</th>
                  <th className={`text-left px-3 py-2 ${SECTION_LABEL}`}>Vehicle</th>
                  <th className={`text-left px-3 py-2 ${SECTION_LABEL}`}>Job</th>
                  <th className={`text-right px-3 py-2 ${SECTION_LABEL}`}>Amount</th>
                  <th className={`text-left px-3 py-2 ${SECTION_LABEL}`}>Status</th>
                  <th className={`text-left px-3 py-2 ${SECTION_LABEL}`}>Date</th>
                  <th className={`text-left px-3 py-2 w-8 ${SECTION_LABEL}`}></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const job = invoice.jobs as {
                    id: string;
                    title: string;
                    customers: { id: string; first_name: string; last_name: string } | null;
                    vehicles: { year: number | null; make: string | null; model: string | null } | null;
                  } | null;
                  const parking = invoice.parking_reservations as {
                    id: string;
                    customer_id: string | null;
                    first_name: string;
                    last_name: string;
                    lot: string;
                  } | null;
                  const customer = job?.customers;
                  const vehicle = job?.vehicles;
                  const invoiceStatus = invoice.status as InvoiceStatus;

                  const customerName = customer
                    ? `${customer.first_name} ${customer.last_name}`
                    : parking
                      ? `${parking.first_name} ${parking.last_name}`
                      : null;
                  const customerLink = customer
                    ? `/customers/${customer.id}`
                    : parking?.customer_id
                      ? `/customers/${parking.customer_id}`
                      : null;
                  const statusColors = INVOICE_STATUS_COLORS[invoiceStatus];

                  return (
                    <tr
                      key={invoice.id}
                      className={`border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 border-l-2 ${STATUS_BORDER[invoiceStatus]} hover:bg-stone-50 dark:hover:bg-stone-800/40`}
                    >
                      <td className="px-3 py-2 align-middle">
                        {customerName ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 text-[11px] font-semibold">
                              {getInitials(customerName)}
                            </div>
                            {customerLink ? (
                              <Link href={customerLink} className="text-sm font-medium text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                                {customerName}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">{customerName}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-sm text-stone-600 dark:text-stone-400">
                        {vehicle
                          ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
                          : parking
                            ? parking.lot
                            : "—"}
                      </td>
                      <td className="px-3 py-2 align-middle text-sm">
                        {job ? (
                          <Link href={`/jobs/${job.id}`} className="text-stone-700 dark:text-stone-300 hover:text-blue-600 dark:hover:text-blue-400 truncate block max-w-[240px]">
                            {job.title || "Job"}
                          </Link>
                        ) : parking ? (
                          <Link href={`/parking/${parking.id}`} className="text-stone-700 dark:text-stone-300 hover:text-blue-600 dark:hover:text-blue-400">
                            Parking
                          </Link>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-right font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
                        {formatCurrencyWhole(invoice.amount ?? 0)}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColors?.bg ?? ""} ${statusColors?.text ?? ""}`}>
                          {INVOICE_STATUS_LABELS[invoiceStatus] ?? invoiceStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
                        {formatDate(invoice.created_at)}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {invoice.stripe_hosted_invoice_url && (
                          <a
                            href={invoice.stripe_hosted_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-stone-400 hover:text-blue-600 dark:hover:text-blue-400"
                            title="View in Stripe"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: dense stacked rows */}
          <div className="md:hidden bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden divide-y divide-stone-100 dark:divide-stone-800/60">
            {invoices.map((invoice) => {
              const job = invoice.jobs as {
                id: string;
                title: string;
                customers: { id: string; first_name: string; last_name: string } | null;
                vehicles: { year: number | null; make: string | null; model: string | null } | null;
              } | null;
              const parking = invoice.parking_reservations as {
                id: string;
                first_name: string;
                last_name: string;
                lot: string;
              } | null;
              const customer = job?.customers;
              const invoiceStatus = invoice.status as InvoiceStatus;
              const statusColors = INVOICE_STATUS_COLORS[invoiceStatus];

              const displayName = customer
                ? `${customer.first_name} ${customer.last_name}`
                : parking
                  ? `${parking.first_name} ${parking.last_name}`
                  : "Unknown";
              const href = job
                ? `/jobs/${job.id}`
                : parking
                  ? `/parking/${parking.id}`
                  : "#";

              return (
                <Link
                  key={invoice.id}
                  href={href}
                  className={`block px-3 py-2.5 border-l-2 ${STATUS_BORDER[invoiceStatus]} hover:bg-stone-50 dark:hover:bg-stone-800/40`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                      {displayName}
                    </p>
                    <span className="font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50 shrink-0">
                      {formatCurrencyWhole(invoice.amount ?? 0)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColors?.bg ?? ""} ${statusColors?.text ?? ""}`}>
                      {INVOICE_STATUS_LABELS[invoiceStatus] ?? invoiceStatus}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-stone-500 dark:text-stone-400">
                      {formatDate(invoice.created_at)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
