"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createEstimateFromJob, deleteEstimate } from "@/lib/actions/estimates";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUS_COLORS,
} from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { MA_SALES_TAX_RATE } from "@/lib/constants";
import { ClipboardList, ExternalLink } from "lucide-react";
import type { Estimate, EstimateStatus } from "@/types";

interface EstimateSectionProps {
  jobId: string;
  estimate: Estimate | null;
}

export function EstimateSection({ jobId, estimate }: EstimateSectionProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate() {
    setLoading(true);
    const result = await createEstimateFromJob(jobId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data) {
      toast.success("Estimate created");
      router.push(`/estimates/${result.data.id}`);
    }
  }

  async function handleDelete() {
    if (!estimate) return { error: "No estimate" };
    const result = await deleteEstimate(estimate.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Estimate deleted");
    }
    return result;
  }

  const status = estimate?.status as EstimateStatus | undefined;
  const statusColors = status ? ESTIMATE_STATUS_COLORS[status] : null;
  const canDelete = status === "draft" || status === "sent";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          <ClipboardList className="h-3.5 w-3.5" />
          Estimate
        </CardTitle>
        {status && statusColors && (
          <Badge
            variant="outline"
            className={`${statusColors.bg} ${statusColors.text}`}
          >
            {ESTIMATE_STATUS_LABELS[status]}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {!estimate ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              No estimate yet. Create one from the job&apos;s line items.
            </p>
            <Button size="sm" onClick={handleCreate} disabled={loading}>
              <ClipboardList className="mr-2 h-4 w-4" />
              {loading ? "Creating..." : "Create Estimate"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span>
                {formatDate(estimate.created_at)}
              </span>
            </div>
            {estimate.sent_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sent</span>
                <span>
                  {formatDate(estimate.sent_at)}
                </span>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <a href={`/estimates/${estimate.id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Estimate
                </Button>
              </a>
              {canDelete && (
                <DeleteConfirmDialog
                  title="Delete Estimate"
                  description={
                    status === "sent"
                      ? "This estimate has been sent to the customer. Deleting it will invalidate the approval link. You can create a new one from the job's current line items."
                      : "This will delete the estimate. You can create a new one from the job's current line items."
                  }
                  onConfirm={handleDelete}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
