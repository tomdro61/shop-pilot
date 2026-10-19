"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateJobStatus, type ActiveJobStatus } from "@/lib/actions/jobs";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  JOB_STATUS_ORDER,
  JOB_STATUS_BAR,
} from "@/lib/constants";
import type { JobStatus } from "@/types";

interface StatusSelectProps {
  jobId: string;
  currentStatus: JobStatus;
}

function StatusChip({ status }: { status: JobStatus }) {
  const colors = JOB_STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${JOB_STATUS_BAR[status] || "bg-stone-400"}`} />
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

export function StatusSelect({ jobId, currentStatus }: StatusSelectProps) {
  // The chip flips as soon as a status is picked. updateJobStatus revalidates
  // the pages this renders on, so the fresh prop arrives in the action's own
  // response; a refusal (e.g. leaving Complete on a paid job) ends the
  // transition with the prop unchanged and the chip snaps back.
  const [status, setOptimisticStatus] = useOptimistic(currentStatus);
  const [pending, startTransition] = useTransition();

  function handleChange(newStatus: string) {
    // A second pick while one is in flight is ignored rather than disabling
    // the trigger, which would drop keyboard focus mid-change.
    if (pending) return;
    // Dropdown only renders JOB_STATUS_ORDER values (excludes cancelled),
    // so the cast to ActiveJobStatus is sound here.
    const next = newStatus as ActiveJobStatus;
    startTransition(async () => {
      setOptimisticStatus(next);
      try {
        const result = await updateJobStatus(jobId, next);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success(`Status updated to ${JOB_STATUS_LABELS[next]}`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update the status");
      }
    });
  }

  return (
    <Select value={status} onValueChange={handleChange}>
      <SelectTrigger
        aria-disabled={pending}
        className={`w-auto border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0 gap-1 ${pending ? "opacity-70" : ""}`}
      >
        <SelectValue>
          <StatusChip status={status} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {JOB_STATUS_ORDER.map((s) => (
          <SelectItem key={s} value={s}>
            <StatusChip status={s} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
