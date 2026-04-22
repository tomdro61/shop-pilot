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
    <div className="p-4 lg:p-10 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Suspense>
          <InvoiceSearch />
        </Suspense>
        <div className="hidden md:flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          <span className="font-bold text-stone-900 dark:text-stone-50">All Invoices</span>
          <span>({invoices.length})</span>
        </div>
        <Suspense>
          <InvoiceStatusFilter />
        </Suspense>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-card rounded-lg shadow-card p-8 text-center text-sm text-stone-500 dark:text-stone-400">
          No invoices found.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-lg shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-widest bg-sidebar text-stone-100">
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Vehicle</th>
                  <th className="px-5 py-4">Job</th>
                  <th className="px-5 py-4 text-right">Amount</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
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
                  const vehicle = job?.vehicles;
                  const invoiceStatus = invoice.status as InvoiceStatus;

                  const customerName = customer
                    ? `${customer.first_name} ${customer.last_name}`
                    : parking
                      ? `${parking.first_name} ${parking.last_name}`
                      : null;
                  const customerLink = customer ? `/customers/${customer.id}` : null;
                  const initials = customerName
                    ? customerName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                    : "??";

                  return (
                    <tr key={invoice.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-5 py-4">
                        {customerName ? (
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-[11px] font-bold text-blue-700 dark:text-blue-400">
                              {initials}
                            </div>
                            {customerLink ? (
                              <Link href={customerLink} className="font-bold text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400">
                                {customerName}
                              </Link>
                            ) : (
                              <span className="font-bold text-stone-900 dark:text-stone-50">{customerName}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-stone-500 dark:text-stone-400">
                        {vehicle
                          ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
                          : parking
                            ? parking.lot
                            : "—"}
                      </td>
                      <td className="px-5 py-4">
                        {job ? (
                          <Link href={`/jobs/${job.id}`} className="text-stone-700 dark:text-stone-300 hover:text-blue-600 dark:hover:text-blue-400">
                            {job.title}
                          </Link>
                        ) : parking ? (
                          <Link href={`/parking/${parking.id}`} className="text-stone-700 dark:text-stone-300 hover:text-blue-600 dark:hover:text-blue-400">
                            Parking
                          </Link>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-bold tabular-nums text-stone-900 dark:text-stone-50">
                        ${(invoice.amount ?? 0).toFixed(2)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${INVOICE_STATUS_COLORS[invoiceStatus]?.bg ?? ""} ${INVOICE_STATUS_COLORS[invoiceStatus]?.text ?? ""}`}>
                          {INVOICE_STATUS_LABELS[invoiceStatus] ?? invoiceStatus}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-stone-500 dark:text-stone-400 tabular-nums">
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
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
              const parking = invoice.parking_reservations as {
                id: string;
                first_name: string;
                last_name: string;
                lot: string;
              } | null;
              const customer = job?.customers;
              const invoiceStatus = invoice.status as InvoiceStatus;

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
                  className="block bg-card rounded-lg shadow-card p-4 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-stone-900 dark:text-stone-50">
                      {displayName}
                    </span>
                    <span className="font-bold tabular-nums text-stone-900 dark:text-stone-50">
                      ${(invoice.amount ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${INVOICE_STATUS_COLORS[invoiceStatus]?.bg ?? ""} ${INVOICE_STATUS_COLORS[invoiceStatus]?.text ?? ""}`}>
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
