import { Check } from "lucide-react";
import { JOB_STATUS_ORDER, JOB_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
import type { JobStatus } from "@/types";

interface JobProgressStepperProps {
  currentStatus: JobStatus;
  dateReceived: string | null;
  dateFinished: string | null;
}

export function JobProgressStepper({
  currentStatus,
  dateReceived,
  dateFinished,
}: JobProgressStepperProps) {
  const currentIdx = JOB_STATUS_ORDER.indexOf(currentStatus);
  const safeIdx = currentIdx === -1 ? 0 : currentIdx;
  const isTerminal = safeIdx === JOB_STATUS_ORDER.length - 1;

  return (
    <div className="bg-card border border-stone-300 dark:border-stone-800 rounded-lg overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x md:divide-x divide-y md:divide-y-0 divide-stone-200 dark:divide-stone-800">
        {JOB_STATUS_ORDER.map((status, idx) => {
          const done = isTerminal ? idx <= safeIdx : idx < safeIdx;
          const current = !isTerminal && idx === safeIdx;
          const label = JOB_STATUS_LABELS[status] ?? status;

          let subline: string | null = null;
          if (status === "not_started" && dateReceived) {
            subline = formatDate(dateReceived);
          } else if (status === "complete" && dateFinished) {
            subline = formatDate(dateFinished);
          } else if (current) {
            subline = "Current";
          }

          return (
            <div
              key={status}
              className={`flex flex-col gap-1 px-4 py-3 ${
                current ? "bg-blue-50/70 dark:bg-blue-950/20" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full grid place-items-center flex-none ${
                    done
                      ? "bg-emerald-600 text-white"
                      : current
                        ? "bg-blue-600 text-white"
                        : "bg-card border border-stone-300 dark:border-stone-700"
                  }`}
                >
                  {done && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    done || current
                      ? "text-stone-900 dark:text-stone-50"
                      : "text-stone-500 dark:text-stone-500"
                  }`}
                >
                  {label}
                </span>
              </div>
              <div className="ml-7 text-[11px] font-mono tabular-nums text-stone-500 dark:text-stone-400">
                {subline ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
