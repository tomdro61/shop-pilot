import { Suspense } from "react";
import Link from "next/link";
import { getInvoices } from "@/lib/actions/invoices";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { ExternalLink } from "lucide-react";
import { InvoiceSearch } from "./invoice-search";
import { InvoiceStatusFilter } from "./invoice-status-filter";
import type { InvoiceStatus } from "@/types";

export const metadata = {
  title: "Invoices | ShopPilot",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;
  const invoices = await getInvoices(status, search);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Suspense>
          <InvoiceSearch />
        </Suspense>
        <div className="hidden md:flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          <span className="font-semibold text-stone-900 dark:text-stone-50">All Invoices</span>
          <span>({invoices.length})</span>
        </div>
        <Suspense>
          <InvoiceStatusFilter />
        </Suspense>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-8 text-center text-sm text-stone-500 dark:text-stone-400">
          No invoices found.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-800 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {invoices.map((invoice) => {
                  const job = invoice.jobs as {
                    id: string;
                    title: string;
                    customers: { id: string; first_name: string; last_name: string } | null;
                    vehicles: { year: number | null; make: string | null; model: string | null } | null;
                  } | null;
                  const customer = job?.customers;
                  const vehicle = job?.vehicles;
                  const invoiceStatus = invoice.status as InvoiceStatus;

                  return (
                    <tr key={invoice.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-4 py-3">
                        {customer ? (
                          <Link href={`/customers/${customer.id}`} className="font-medium text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400">
                            {customer.first_name} {customer.last_name}
                          </Link>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                        {vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {job ? (
                          <Link href={`/jobs/${job.id}`} className="text-stone-700 dark:text-stone-300 hover:text-blue-600 dark:hover:text-blue-400">
                            {job.title}
                          </Link>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-stone-900 dark:text-stone-50">
                        ${(invoice.amount ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[invoiceStatus]?.bg ?? ""} ${INVOICE_STATUS_COLORS[invoiceStatus]?.text ?? ""}`}>
                          {INVOICE_STATUS_LABELS[invoiceStatus] ?? invoiceStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400 tabular-nums">
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.stripe_hosted_invoice_url && (
                          <a
                            href={invoice.stripe_hosted_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-stone-400 hover:text-blue-600 dark:hover:text-blue-400"
                            title="View in Stripe"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {invoices.map((invoice) => {
              const job = invoice.jobs as {
                id: string;
                title: string;
                customers: { id: string; first_name: string; last_name: string } | null;
                vehicles: { year: number | null; make: string | null; model: string | null } | null;
              } | null;
              const customer = job?.customers;
              const invoiceStatus = invoice.status as InvoiceStatus;

              return (
                <Link
                  key={invoice.id}
                  href={job ? `/jobs/${job.id}` : "#"}
                  className="block rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-stone-900 dark:text-stone-50">
                      {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                    </span>
                    <span className="font-medium tabular-nums text-stone-900 dark:text-stone-50">
                      ${(invoice.amount ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[invoiceStatus]?.bg ?? ""} ${INVOICE_STATUS_COLORS[invoiceStatus]?.text ?? ""}`}>
                      {INVOICE_STATUS_LABELS[invoiceStatus] ?? invoiceStatus}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                      {new Date(invoice.created_at).toLocaleDateString()}
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
