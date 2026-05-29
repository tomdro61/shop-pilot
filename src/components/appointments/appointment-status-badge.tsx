import { cn } from "@/lib/utils";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
} from "@/lib/constants";

export function AppointmentStatusBadge({ status }: { status: string }) {
  const color =
    APPOINTMENT_STATUS_COLORS[status] ?? APPOINTMENT_STATUS_COLORS.cancelled;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider",
        color.bg,
        color.text
      )}
    >
      {APPOINTMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}
