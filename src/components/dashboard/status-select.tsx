"use client";

import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { updateJobStatus } from "@/lib/actions/jobs";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_ORDER } from "@/lib/constants";
import type { JobStatus } from "@/types";

interface StatusSelectProps {
  jobId: string;
  currentStatus: JobStatus;
}

export function StatusSelect({ jobId, currentStatus }: StatusSelectProps) {
  async function handleChange(newStatus: string) {
    const result = await updateJobStatus(jobId, newStatus as JobStatus);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Status updated to ${JOB_STATUS_LABELS[newStatus as JobStatus]}`);
    }
  }

  const colors = JOB_STATUS_COLORS[currentStatus];

  return (
    <Select value={currentStatus} onValueChange={handleChange}>
      <SelectTrigger className="w-auto">
        <SelectValue>
          <Badge
            className={`border-transparent ${colors.bg} ${colors.text}`}
          >
            {JOB_STATUS_LABELS[currentStatus]}
          </Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {JOB_STATUS_ORDER.map((status) => {
          const statusColors = JOB_STATUS_COLORS[status];
          return (
            <SelectItem key={status} value={status}>
              <Badge
                className={`border-transparent ${statusColors.bg} ${statusColors.text}`}
              >
                {JOB_STATUS_LABELS[status]}
              </Badge>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
