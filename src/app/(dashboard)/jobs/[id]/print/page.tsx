import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRONumber, formatCurrency, formatPhone, formatVehicle, formatCustomerName } from "@/lib/utils/format";
import { getShopSettings } from "@/lib/actions/settings";
import { calculateTotals } from "@/lib/utils/totals";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("ro_number, title, customers(first_name, last_name)")
    .eq("id", id)
    .single();

  if (!job) return { title: "Not Found | ShopPilot" };
  const customer = job.customers as { first_name: string; last_name: string } | null;
  const ro = formatRONumber(job.ro_number);
  return {
    title: `${ro} - ${customer ? formatCustomerName(customer) : "Repair Order"} | ShopPilot`,
  };
}

export default async function PrintRepairOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, first_name, last_name, phone, email, address), vehicles(id, year, make, model, vin, license_plate, mileage), job_line_items(*)"
    )
    .eq("id", id)
    .single();

  if (error || !job) notFound();

  const customer = job.customers as {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;

  const vehicle = job.vehicles as {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    license_plate: string | null;
    mileage: number | null;
  } | null;

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

  const lineItems = (job.job_line_items || []) as LineItem[];

  // Group line items by category
  const grouped = new Map<string, LineItem[]>();
  for (const li of lineItems) {
    const cat = li.category || "General";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(li);
  }

  // Calculate totals
  const settings = await getShopSettings();
  const totals = calculateTotals(lineItems, settings);

  return (
    <div className="print-ro mx-auto max-w-3xl bg-white p-8 text-stone-900">
      <PrintButton />

      {/* Shop Header */}
      <div className="mb-6 border-b-2 border-stone-900 pb-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Broadway Motors</h1>
        <p className="mt-1 text-sm text-stone-600">
          265 Broadway, Revere, MA 02151
        </p>
        <p className="text-sm text-stone-600">(781) 284-4000</p>
      </div>

      {/* RO Number + Dates */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <span className="text-2xl font-bold">{formatRONumber(job.ro_number)}</span>
        </div>
        <div className="text-right text-sm">
          <p>
            <span className="font-medium">Date In:</span>{" "}
            {new Date(job.date_received).toLocaleDateString()}
          </p>
          {job.date_finished && (
            <p>
              <span className="font-medium">Date Out:</span>{" "}
              {new Date(job.date_finished).toLocaleDateString()}
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
              {(vehicle.mileage || job.mileage_in) && (
                <p>
                  <span className="text-stone-500">Mileage:</span>{" "}
                  {(job.mileage_in || vehicle.mileage)?.toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Job Title */}
      {job.title && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Description
          </h3>
          <p className="text-sm font-medium">{job.title}</p>
        </div>
      )}

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
                  <td className="py-1.5 text-center capitalize">
                    {li.type}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {li.quantity}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatCurrency(li.unit_cost)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatCurrency(li.total)}
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
            <span className="tabular-nums">{formatCurrency(totals.laborTotal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Parts Subtotal</span>
            <span className="tabular-nums">{formatCurrency(totals.partsTotal)}</span>
          </div>
          {totals.shopSuppliesEnabled && totals.shopSupplies > 0 && (
            <div className="flex justify-between py-1 text-stone-500">
              <span>Shop Supplies</span>
              <span className="tabular-nums">{formatCurrency(totals.shopSupplies)}</span>
            </div>
          )}
          {totals.hazmatEnabled && totals.hazmat > 0 && (
            <div className="flex justify-between py-1 text-stone-500">
              <span>{totals.hazmatLabel}</span>
              <span className="tabular-nums">{formatCurrency(totals.hazmat)}</span>
            </div>
          )}
          <div className="flex justify-between py-1 text-stone-500">
            <span>Tax ({(totals.taxRate * 100).toFixed(2)}%)</span>
            <span className="tabular-nums">{formatCurrency(totals.taxAmount)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t-2 border-stone-900 pt-2 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {job.notes && (
        <div className="mb-8">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-sm">{job.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-stone-300 pt-4 text-center text-sm text-stone-500">
        <p>Thank you for your business!</p>
      </div>
    </div>
  );
}
