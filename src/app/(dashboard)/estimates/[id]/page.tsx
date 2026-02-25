import { notFound } from "next/navigation";
import Link from "next/link";
import { getEstimate } from "@/lib/actions/estimates";
import { getShopSettings } from "@/lib/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EstimateLineItemsList } from "@/components/dashboard/estimate-line-items-list";
import { EstimateActions } from "@/components/dashboard/estimate-actions";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUS_COLORS,
} from "@/lib/constants";
import {
  formatCustomerName,
  formatVehicle,
  formatPhone,
  formatDate,
} from "@/lib/utils/format";
import { ArrowLeft, User, Car } from "lucide-react";
import type {
  EstimateStatus,
  EstimateLineItem,
  Customer,
  Vehicle,
} from "@/types";

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
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4">
        {job && (
          <Link href={`/jobs/${job.id}`}>
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Job
            </Button>
          </Link>
        )}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">Estimate</h2>
            <p className="text-sm text-muted-foreground">
              {job?.title || "Auto Repair"} &middot; Created{" "}
              {formatDate(estimate.created_at)}
            </p>
          </div>
          <Badge
            className={`border-transparent ${statusColors.bg} ${statusColors.text}`}
          >
            {ESTIMATE_STATUS_LABELS[status]}
          </Badge>
        </div>
      </div>

      {/* Customer & Vehicle Info */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {customer && (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">
                <User className="h-3.5 w-3.5" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/customers/${customer.id}`}
                className="font-medium hover:underline"
              >
                {formatCustomerName(customer)}
              </Link>
              {customer.phone && (
                <p className="text-sm text-muted-foreground">
                  {formatPhone(customer.phone)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {vehicle && (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">
                <Car className="h-3.5 w-3.5" />
                Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{formatVehicle(vehicle)}</p>
              {vehicle.vin && (
                <p className="text-sm text-muted-foreground">
                  VIN: {vehicle.vin}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Status-specific info */}
      {estimate.sent_at && (
        <p className="mb-4 text-sm text-muted-foreground">
          Sent {formatDate(estimate.sent_at)}
          {estimate.approved_at &&
            ` · Approved ${formatDate(estimate.approved_at)}`}
          {estimate.declined_at &&
            ` · Declined ${formatDate(estimate.declined_at)}`}
        </p>
      )}

      <Separator className="mb-4" />

      {/* Line Items */}
      <EstimateLineItemsList
        estimateId={id}
        lineItems={lineItems}
        readOnly={!isDraft}
        settings={settings}
      />

      {/* Actions */}
      <div className="mt-4">
        <EstimateActions
          estimateId={id}
          status={status}
          approvalToken={estimate.approval_token}
        />
      </div>
    </div>
  );
}
