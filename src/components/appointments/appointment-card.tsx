import Link from "next/link";
import { Car, Image as ImageIcon, Clock } from "lucide-react";
import type { Database } from "@/types/supabase";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { AppointmentScheduleDialog } from "./appointment-schedule-dialog";
import { AppointmentCancelButton } from "./appointment-cancel-button";
import {
  serviceLabel,
  windowLabel,
  vehicleLabel,
  customerInitials,
  defaultEtTimeForWindow,
  etDateOf,
  etTimeOf,
  formatEtDate,
  formatEtTime,
  relativeTime,
} from "@/lib/appointments/display";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];

export function AppointmentCard({ appointment: a }: { appointment: Appointment }) {
  const vehicle = vehicleLabel(
    a.snapshot_vehicle_year,
    a.snapshot_vehicle_make,
    a.snapshot_vehicle_model
  );
  const photoCount = a.photo_paths.length;

  const scheduling =
    a.status === "confirmed" && a.scheduled_at
      ? `${formatEtDate(a.scheduled_at)} · ${formatEtTime(a.scheduled_at)}`
      : `${formatEtDate(a.preferred_date)} · ${windowLabel(a.preferred_time_window)}`;

  return (
    <div className="overflow-hidden rounded-md border border-stone-200 bg-card shadow-card dark:border-stone-800">
      <Link
        href={`/appointments/${a.id}`}
        className="block px-4 py-3 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-stone-800/50"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-md border border-violet-200 bg-violet-50 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
            {customerInitials(a.snapshot_customer_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">
                {a.snapshot_customer_name}
              </p>
              <AppointmentStatusBadge status={a.status} />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
              <span className="font-mono tabular-nums">
                {a.snapshot_customer_phone}
              </span>
              {vehicle && (
                <span className="inline-flex items-center gap-1">
                  <Car className="h-3 w-3" />
                  {vehicle}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                {serviceLabel(a.service_category)}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-stone-600 dark:text-stone-300">
                <Clock className="h-3 w-3" />
                {scheduling}
              </span>
              {photoCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                  <ImageIcon className="h-3 w-3" />
                  {photoCount}
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-stone-700 dark:text-stone-300">
              {a.description}
            </p>
            <p className="mt-1.5 text-[11px] text-stone-400 dark:text-stone-500">
              {relativeTime(a.submitted_at)}
            </p>
          </div>
        </div>
      </Link>

      <AppointmentCardActions appointment={a} />
    </div>
  );
}

function AppointmentCardActions({ appointment: a }: { appointment: Appointment }) {
  if (a.status === "pending") {
    return (
      <div className="flex items-center gap-2 border-t border-stone-200 px-4 py-2.5 dark:border-stone-800">
        <AppointmentScheduleDialog
          appointmentId={a.id}
          mode="confirm"
          defaultEtDate={a.preferred_date}
          defaultEtTime={defaultEtTimeForWindow(a.preferred_time_window)}
          requestedLabel={`${formatEtDate(a.preferred_date)} · ${windowLabel(a.preferred_time_window)}`}
          triggerLabel="Confirm"
        />
        <AppointmentCancelButton appointmentId={a.id} />
      </div>
    );
  }

  if (a.status === "confirmed" && a.scheduled_at) {
    return (
      <div className="flex items-center gap-2 border-t border-stone-200 px-4 py-2.5 dark:border-stone-800">
        <AppointmentScheduleDialog
          appointmentId={a.id}
          mode="reschedule"
          defaultEtDate={etDateOf(a.scheduled_at)}
          defaultEtTime={etTimeOf(a.scheduled_at)}
          requestedLabel={`${formatEtDate(a.scheduled_at)} · ${formatEtTime(a.scheduled_at)}`}
          triggerLabel="Reschedule"
          triggerVariant="outline"
        />
        <AppointmentCancelButton appointmentId={a.id} />
      </div>
    );
  }

  if (a.status === "converted_to_job") {
    return (
      <div className="border-t border-stone-200 px-4 py-2.5 dark:border-stone-800">
        {a.converted_job_id ? (
          <Link
            href={`/jobs/${a.converted_job_id}`}
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            View job →
          </Link>
        ) : (
          <span className="text-xs text-stone-400 dark:text-stone-500">
            Converted (job removed)
          </span>
        )}
      </div>
    );
  }

  return null; // cancelled / completed — terminal, no actions
}
