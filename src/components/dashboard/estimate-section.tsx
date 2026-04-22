"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { createEstimateFromJob, deleteEstimate } from "@/lib/actions/estimates";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUS_COLORS,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
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
    <SectionCard
      title={<><ClipboardList className="h-3 w-3" />Estimate</>}
      action={
        status && statusColors ? (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColors.bg} ${statusColors.text}`}>
            {ESTIMATE_STATUS_LABELS[status]}
          </span>
        ) : null
      }
    >
      <div className="px-4 py-3">
        {!estimate ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              No estimate yet. Create one from the job&apos;s line items.
            </p>
            <Button size="sm" onClick={handleCreate} disabled={loading}>
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              {loading ? "Creating..." : "Create Estimate"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-stone-500 dark:text-stone-400">Created</dt>
              <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                {formatDate(estimate.created_at)}
              </dd>
              {estimate.sent_at && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400">Sent</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {formatDate(estimate.sent_at)}
                  </dd>
                </>
              )}
            </dl>
            <div className="flex gap-2">
              <a href={`/estimates/${estimate.id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
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
      </div>
    </SectionCard>
  );
}
