"use client";

import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateJobStatus } from "@/lib/actions/jobs";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_ORDER } from "@/lib/constants";
import type { JobStatus } from "@/types";

interface StatusSelectProps {
  jobId: string;
  currentStatus: JobStatus;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  not_started: "bg-red-500",
  waiting_for_parts: "bg-amber-500",
  in_progress: "bg-blue-500",
  complete: "bg-green-500",
};

function StatusChip({ status }: { status: JobStatus }) {
  const colors = JOB_STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[status] || "bg-stone-400"}`} />
      {JOB_STATUS_LABELS[status]}
    </span>
  );
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

  return (
    <Select value={currentStatus} onValueChange={handleChange}>
      <SelectTrigger className="w-auto border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0 gap-1">
        <SelectValue>
          <StatusChip status={currentStatus} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {JOB_STATUS_ORDER.map((status) => (
          <SelectItem key={status} value={status}>
            <StatusChip status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
