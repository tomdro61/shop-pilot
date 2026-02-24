"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createEstimateFromJob } from "@/lib/actions/estimates";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUS_COLORS,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/format";
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

  const status = estimate?.status as EstimateStatus | undefined;
  const statusColors = status ? ESTIMATE_STATUS_COLORS[status] : null;

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
                {new Date(estimate.created_at).toLocaleDateString()}
              </span>
            </div>
            {estimate.sent_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sent</span>
                <span>
                  {new Date(estimate.sent_at).toLocaleDateString()}
                </span>
              </div>
            )}
            <a href={`/estimates/${estimate.id}`}>
              <Button variant="outline" size="sm" className="mt-2 w-full">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Estimate
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
