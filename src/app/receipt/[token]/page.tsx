import { getReceiptByToken, getReceiptShopSettings } from "@/lib/actions/receipts";
import { calculateTotals } from "@/lib/utils/totals";
import {
  formatCurrency,
  formatVehicle,
  formatCustomerName,
  formatRONumber,
  formatDate,
} from "@/lib/utils/format";
import { AlertCircle, CheckCircle2, Phone } from "lucide-react";
import { WALK_IN_CUSTOMER_ID } from "@/lib/constants";

export const metadata = {
  title: "Receipt — Broadway Motors",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: "Card",
  terminal: "Card (In-Person)",
  ach: "ACH Transfer",
  cash: "Cash",
  check: "Check",
};

function methodLabel(method: string | null): string {
  if (!method) return "Paid";
  return PAYMENT_METHOD_LABELS[method] ?? method.charAt(0).toUpperCase() + method.slice(1);
}

function NotAvailable({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full grid place-items-center bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
        Receipt Not Available
      </h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{message}</p>
    </div>
  );
}

type LineItem = {
  id: string;
  type: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total: number;
  part_number: string | null;
  category: string | null;
};

export default async function CustomerReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [job, settings] = await Promise.all([getReceiptByToken(token), getReceiptShopSettings()]);

  // getReceiptByToken gates payment_status = 'paid' in the query, so a bad token
  // and an unpaid job both arrive here as null — no unpaid-job details are ever
  // fetched for this public page.
  if (!job) {
    return <NotAvailable message="This receipt link may have expired or is invalid." />;
  }

  // Refuse to render a total we can't compute correctly rather than silently
  // fall back to DEFAULT_SETTINGS (which would drop shop supplies / hazmat and
  // could differ from what the customer actually paid).
  if (!settings) {
    return <NotAvailable message="We're having trouble loading this receipt. Please try again shortly." />;
  }

  const customer = job.customers as {
    first_name: string;
    last_name: string;
  } | null;

  const vehicle = job.vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;

  const lineItems = (job.job_line_items || []) as LineItem[];
  const totals = calculateTotals(lineItems, settings, job.charge_sales_tax);

  const isWalkIn = job.customer_id === WALK_IN_CUSTOMER_ID;

  // formatVehicle joins year/make/model, so a plate-only vehicle yields "" — fall
  // through instead of rendering an empty heading. "Counter Sale" is only true of
  // the sentinel; a real customer's vehicle-less job must not claim to be one.
  const vehicleName = vehicle ? formatVehicle(vehicle) : "";
  const heading = vehicleName || job.title || (isWalkIn ? "Counter Sale" : "Service");

  const grouped = new Map<string, LineItem[]>();
  for (const li of lineItems) {
    const cat = li.category || "General";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(li);
  }

  return (
    <div className="space-y-5">
      {/* Paid confirmation */}
      <div className="relative rounded-md border bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 p-5 shadow-card text-center">
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-emerald-500"
        />
        <div className="mx-auto w-10 h-10 rounded-full grid place-items-center bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
          Payment Received
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
          {formatCurrency(totals.grandTotal)}
        </p>
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
          {methodLabel(job.payment_method)}
          {job.paid_at ? ` · ${formatDate(job.paid_at)}` : ""}
        </p>
      </div>

      {/* RO + vehicle + customer */}
      <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-card p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
              {heading}
            </h2>
            {job.title && job.title !== heading && (
              <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-300">{job.title}</p>
            )}
            {customer && !isWalkIn && (
              <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
                {formatCustomerName(customer)}
              </p>
            )}
          </div>
          <div className="text-right flex-none">
            <div className="font-mono tabular-nums text-sm font-bold text-stone-900 dark:text-stone-50">
              {formatRONumber(job.ro_number)}
            </div>
            {job.date_finished && (
              <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                {formatDate(job.date_finished)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Itemized detail */}
      <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-card p-4 shadow-card">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Details
        </p>
        <div className="space-y-4">
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category} className="space-y-2">
              {grouped.size > 1 && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  {category}
                </h4>
              )}
              {items.map((li) => (
                <div key={li.id} className="flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-stone-900 dark:text-stone-100">
                      {li.description}
                      {li.part_number && (
                        <span className="ml-1 text-xs text-stone-400">#{li.part_number}</span>
                      )}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                      {li.quantity} × {formatCurrency(li.unit_cost)}
                    </p>
                  </div>
                  <p className="tabular-nums text-stone-900 dark:text-stone-100 flex-none">
                    {formatCurrency(li.total)}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 space-y-1 text-sm">
          <div className="flex justify-between text-stone-600 dark:text-stone-300">
            <span>Labor</span>
            <span className="tabular-nums">{formatCurrency(totals.laborTotal)}</span>
          </div>
          <div className="flex justify-between text-stone-600 dark:text-stone-300">
            <span>Parts</span>
            <span className="tabular-nums">{formatCurrency(totals.partsTotal)}</span>
          </div>
          {totals.shopSuppliesEnabled && totals.shopSupplies > 0 && (
            <div className="flex justify-between text-stone-500 dark:text-stone-400">
              <span>Shop Supplies</span>
              <span className="tabular-nums">{formatCurrency(totals.shopSupplies)}</span>
            </div>
          )}
          {totals.hazmatEnabled && totals.hazmat > 0 && (
            <div className="flex justify-between text-stone-500 dark:text-stone-400">
              <span>{totals.hazmatLabel}</span>
              <span className="tabular-nums">{formatCurrency(totals.hazmat)}</span>
            </div>
          )}
          {totals.taxAmount > 0 && (
            <div className="flex justify-between text-stone-500 dark:text-stone-400">
              <span>Tax ({(totals.taxRate * 100).toFixed(2)}%)</span>
              <span className="tabular-nums">{formatCurrency(totals.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 mt-1 border-t border-stone-200 dark:border-stone-800 text-base font-bold text-stone-900 dark:text-stone-50">
            <span>Total Paid</span>
            <span className="tabular-nums">{formatCurrency(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2 text-center">
        <p className="text-xs text-stone-500 dark:text-stone-400">Thank you for your business!</p>
        <a
          href="tel:6179968371"
          className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Phone className="h-3.5 w-3.5" />
          (617) 996-8371
        </a>
      </div>
    </div>
  );
}
