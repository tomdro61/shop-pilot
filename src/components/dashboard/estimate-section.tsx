"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MiniStatusCard, ACCENT_PILL, type Accent } from "@/components/ui/mini-status-card";
import { createEstimateFromJob, deleteEstimate } from "@/lib/actions/estimates";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
import { ClipboardList, ExternalLink } from "lucide-react";
import type { Estimate, EstimateStatus } from "@/types";

interface EstimateSectionProps {
  jobId: string;
  estimate: Estimate | null;
}

const STATUS_ACCENT: Record<EstimateStatus, Accent> = {
  draft: "blue",
  sent: "amber",
  approved: "green",
  declined: "red",
};

const DATE_LABEL: Record<EstimateStatus, (estimate: Estimate) => string> = {
  draft: (e) => `Created ${formatDate(e.created_at)}`,
  sent: (e) => `Sent ${e.sent_at ? formatDate(e.sent_at) : "—"}`,
  approved: (e) => `Signed ${e.approved_at ? formatDate(e.approved_at) : "—"}`,
  declined: (e) => `Declined ${e.declined_at ? formatDate(e.declined_at) : "—"}`,
};

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

  if (!estimate) {
    return (
      <MiniStatusCard
        accent="gray"
        icon={<ClipboardList className="h-4 w-4" />}
        title={
          <>
            <span>Estimate</span>
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
              Not created
            </span>
          </>
        }
        meta="Generate from the job's line items"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={loading}>
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            {loading ? "Creating…" : "Create"}
          </Button>
        }
      />
    );
  }

  const status = estimate.status as EstimateStatus;
  const accent = STATUS_ACCENT[status];
  const canDelete = status === "draft" || status === "sent";

  return (
    <MiniStatusCard
      accent={accent}
      icon={<ClipboardList className="h-4 w-4" />}
      title={
        <>
          <span>Estimate</span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${ACCENT_PILL[accent]}`}
          >
            {ESTIMATE_STATUS_LABELS[status]}
          </span>
        </>
      }
      meta={<span>{DATE_LABEL[status](estimate)}</span>}
      actions={
        <>
          <a href={`/estimates/${estimate.id}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View
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
        </>
      }
    />
  );
}
