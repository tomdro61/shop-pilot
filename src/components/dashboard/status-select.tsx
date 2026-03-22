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
  in_progress: "bg-blue-500 animate-pulse",
  complete: "bg-green-500",
};

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
      <SelectTrigger className="w-auto border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0">
        <SelectValue>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${colors.bg} ${colors.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[currentStatus] || "bg-stone-400"}`} />
            {JOB_STATUS_LABELS[currentStatus]}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {JOB_STATUS_ORDER.map((status) => {
          const statusColors = JOB_STATUS_COLORS[status];
          return (
            <SelectItem key={status} value={status}>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusColors.bg} ${statusColors.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[status] || "bg-stone-400"}`} />
                {JOB_STATUS_LABELS[status]}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
