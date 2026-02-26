import { getEstimateByToken } from "@/lib/actions/estimates";
import { getShopSettings } from "@/lib/actions/settings";
import { calculateTotals } from "@/lib/utils/totals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EstimateApprovalButtons } from "@/components/dashboard/estimate-approval-buttons";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUS_COLORS,
} from "@/lib/constants";
import { formatCurrency, formatVehicle, formatCustomerName } from "@/lib/utils/format";
import { CheckCircle, XCircle } from "lucide-react";
import type { EstimateStatus, EstimateLineItem, Customer, Vehicle } from "@/types";

export async function generateMetadata() {
  return { title: "Estimate Approval | Broadway Motors" };
}

export default async function EstimateApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [estimate, settings] = await Promise.all([
    getEstimateByToken(token),
    getShopSettings(),
  ]);

  if (!estimate) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-lg font-medium">Estimate not found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This link may be invalid or expired.
          </p>
        </CardContent>
      </Card>
    );
  }

  const status = estimate.status as EstimateStatus;
  const statusColors = ESTIMATE_STATUS_COLORS[status];
  const lineItems = (estimate.estimate_line_items || []) as EstimateLineItem[];

  const job = estimate.jobs as {
    id: string;
    title: string | null;
    customers: Customer | null;
    vehicles: Vehicle | null;
  } | null;

  const customer = job?.customers || null;
  const vehicle = job?.vehicles || null;

  const totals = calculateTotals(lineItems, settings);

  // Group by category
  const categoryGroups: Record<string, EstimateLineItem[]> = {};
  lineItems.forEach((li) => {
    const cat = li.category || "Uncategorized";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(li);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Estimate</h2>
        <p className="text-sm text-muted-foreground">
          {job?.title || "Auto Repair Services"}
        </p>
      </div>

      {/* Customer & Vehicle */}
      {(customer || vehicle) && (
        <Card>
          <CardContent className="pt-6">
            {customer && (
              <p className="font-medium">{formatCustomerName(customer)}</p>
            )}
            {vehicle && (
              <p className="text-sm text-muted-foreground">
                {formatVehicle(vehicle)}
                {vehicle.vin && ` · VIN: ${vehicle.vin}`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(categoryGroups).map(([catName, items]) => {
            const catTotal = items.reduce((sum, li) => sum + (li.total || 0), 0);
            return (
              <div key={catName} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {catName}
                  </h4>
                  <span className="text-sm font-medium text-muted-foreground">
                    {formatCurrency(catTotal)}
                  </span>
                </div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} x {formatCurrency(item.unit_cost)}
                        {item.part_number && ` · #${item.part_number}`}
                      </p>
                    </div>
                    <p className="font-medium">{formatCurrency(item.total)}</p>
                  </div>
                ))}
              </div>
            );
          })}

          <Separator />

          <div className="space-y-1 text-right">
            {totals.laborTotal > 0 && (
              <p className="text-sm text-muted-foreground">
                Labor: {formatCurrency(totals.laborTotal)}
              </p>
            )}
            {totals.partsTotal > 0 && (
              <p className="text-sm text-muted-foreground">
                Parts: {formatCurrency(totals.partsTotal)}
              </p>
            )}
            {totals.shopSuppliesEnabled && totals.shopSupplies > 0 && (
              <p className="text-sm text-muted-foreground">
                Shop Supplies: {formatCurrency(totals.shopSupplies)}
              </p>
            )}
            {totals.hazmatEnabled && totals.hazmat > 0 && (
              <p className="text-sm text-muted-foreground">
                {totals.hazmatLabel}: {formatCurrency(totals.hazmat)}
              </p>
            )}
            {totals.taxAmount > 0 && (
              <p className="text-sm text-muted-foreground">
                Tax ({(totals.taxRate * 100).toFixed(2)}%):{" "}
                {formatCurrency(totals.taxAmount)}
              </p>
            )}
            <p className="text-lg font-bold">
              Total: {formatCurrency(totals.grandTotal)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action / Status */}
      {status === "sent" && (
        <EstimateApprovalButtons token={token} />
      )}

      {status === "approved" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium">Estimate Approved</p>
              <p className="text-sm text-muted-foreground">
                An invoice has been sent to your email.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "declined" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium">Estimate Declined</p>
              <p className="text-sm text-muted-foreground">
                Contact us if you&apos;d like to discuss options.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
