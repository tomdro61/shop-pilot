import { notFound } from "next/navigation";
import { getEstimate } from "@/lib/actions/estimates";
import { getShopSettings } from "@/lib/actions/settings";
import { calculateTotals } from "@/lib/utils/totals";
import {
  formatCurrency,
  formatPhone,
  formatVehicle,
  formatCustomerName,
  formatDate,
} from "@/lib/utils/format";
import { PrintButton } from "@/components/dashboard/print-button";
import type { Customer, EstimateLineItem, Vehicle } from "@/types";

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
  if (!estimate) return { title: "Not Found | ShopPilot" };

  const customer = estimate.customers as Pick<
    Customer,
    "first_name" | "last_name"
  > | null;
  const num = formatEstimateNumber(estimate.estimate_number) ?? "Estimate";
  return {
    title: `${num} - ${customer ? formatCustomerName(customer) : "Estimate"} | ShopPilot`,
  };
}

export default async function PrintEstimatePage({
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

  const customer = (estimate.customers as Customer | null) ?? null;
  const vehicle = (estimate.vehicles as Vehicle | null) ?? null;
  const lineItems = (estimate.estimate_line_items || []) as EstimateLineItem[];

  const grouped = new Map<string, EstimateLineItem[]>();
  for (const li of lineItems) {
    const cat = li.category || "General";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(li);
  }

  const totals = calculateTotals(lineItems, settings, estimate.charge_sales_tax);

  return (
    <div className="print-ro mx-auto max-w-3xl bg-white p-8 text-stone-900">
      <PrintButton />

      {/* Shop Header */}
      <div className="mb-6 border-b-2 border-stone-900 pb-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Broadway Motors</h1>
        <p className="mt-1 text-sm text-stone-600">
          88 Broadway, Revere, MA 02151
        </p>
        <p className="text-sm text-stone-600">(617) 996-8371</p>
      </div>

      {/* Estimate Number + Dates */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <span className="text-2xl font-bold">
            {formatEstimateNumber(estimate.estimate_number) ?? "Estimate"}
          </span>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Estimate
          </p>
        </div>
        <div className="text-right text-sm">
          <p>
            <span className="font-medium">Date:</span>{" "}
            {formatDate(estimate.created_at)}
          </p>
          {estimate.approved_at && (
            <p>
              <span className="font-medium">Approved:</span>{" "}
              {formatDate(estimate.approved_at)}
            </p>
          )}
        </div>
      </div>

      {/* Customer + Vehicle */}
      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Customer
          </h3>
          {customer && (
            <div className="text-sm">
              <p className="font-medium">{formatCustomerName(customer)}</p>
              {customer.phone && <p>{formatPhone(customer.phone)}</p>}
              {customer.email && <p>{customer.email}</p>}
              {customer.address && <p>{customer.address}</p>}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Vehicle
          </h3>
          {vehicle && (
            <div className="text-sm">
              <p className="font-medium">{formatVehicle(vehicle)}</p>
              {vehicle.vin && (
                <p>
                  <span className="text-stone-500">VIN:</span> {vehicle.vin}
                </p>
              )}
              {vehicle.license_plate && (
                <p>
                  <span className="text-stone-500">Plate:</span>{" "}
                  {vehicle.license_plate}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-stone-900">
              <th className="py-2 text-left font-semibold">Description</th>
              <th className="py-2 text-center font-semibold w-16">Type</th>
              <th className="py-2 text-right font-semibold w-12">Qty</th>
              <th className="py-2 text-right font-semibold w-24">Unit Price</th>
              <th className="py-2 text-right font-semibold w-24">Total</th>
            </tr>
          </thead>
          {[...grouped.entries()].map(([category, items]) => (
            <tbody key={category}>
              {grouped.size > 1 && (
                <tr>
                  <td
                    colSpan={5}
                    className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-500"
                  >
                    {category}
                  </td>
                </tr>
              )}
              {items.map((li) => (
                <tr key={li.id} className="border-b border-stone-200">
                  <td className="py-1.5">
                    {li.description}
                    {li.part_number && (
                      <span className="ml-1 text-xs text-stone-400">
                        #{li.part_number}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-center capitalize">{li.type}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {li.quantity}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatCurrency(li.unit_cost)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatCurrency(li.total ?? li.quantity * li.unit_cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* Totals */}
      <div className="mb-8 flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between py-1">
            <span>Labor Subtotal</span>
            <span className="tabular-nums">
              {formatCurrency(totals.laborTotal)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span>Parts Subtotal</span>
            <span className="tabular-nums">
              {formatCurrency(totals.partsTotal)}
            </span>
          </div>
          {totals.shopSuppliesEnabled && totals.shopSupplies > 0 && (
            <div className="flex justify-between py-1 text-stone-500">
              <span>Shop Supplies</span>
              <span className="tabular-nums">
                {formatCurrency(totals.shopSupplies)}
              </span>
            </div>
          )}
          {totals.hazmatEnabled && totals.hazmat > 0 && (
            <div className="flex justify-between py-1 text-stone-500">
              <span>{totals.hazmatLabel}</span>
              <span className="tabular-nums">
                {formatCurrency(totals.hazmat)}
              </span>
            </div>
          )}
          {totals.taxAmount > 0 && (
            <div className="flex justify-between py-1 text-stone-500">
              <span>Tax ({(totals.taxRate * 100).toFixed(2)}%)</span>
              <span className="tabular-nums">
                {formatCurrency(totals.taxAmount)}
              </span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t-2 border-stone-900 pt-2 text-base font-bold">
            <span>Estimated Total</span>
            <span className="tabular-nums">
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {estimate.notes && (
        <div className="mb-8">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-sm">{estimate.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-stone-200 pt-4 text-center text-sm text-stone-500">
        <p>
          This is an estimate, not a final bill. Additional work will be quoted
          for your approval before it is performed.
        </p>
      </div>
    </div>
  );
}
