import Link from "next/link";
import { Car, CalendarClock, Image as ImageIcon, Wrench } from "lucide-react";
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
  const isConfirmed = a.status === "confirmed" && a.scheduled_at;
  const whenDate = isConfirmed
    ? formatEtDate(a.scheduled_at!)
    : formatEtDate(a.preferred_date);
  const whenTime = isConfirmed
    ? formatEtTime(a.scheduled_at!)
    : windowLabel(a.preferred_time_window);
  return (
    <div className="overflow-hidden rounded-md border border-stone-200 bg-card shadow-card dark:border-stone-800">
      <Link
        href={`/appointments/${a.id}`}
        className="block px-4 py-3 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-stone-800/50"
      >
        {/* Header — who + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-md border border-violet-200 bg-violet-50 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
              {customerInitials(a.snapshot_customer_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-stone-900 dark:text-stone-50">
                {a.snapshot_customer_name}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs tabular-nums text-stone-500 dark:text-stone-400">
                {a.snapshot_customer_phone}
              </p>
            </div>
          </div>
          <AppointmentStatusBadge status={a.status} />
        </div>

        {/* When — the hero datum: bold, blue icon, no container */}
        <div className="mt-3 flex items-baseline gap-2">
          <CalendarClock
            className="h-4 w-4 shrink-0 translate-y-0.5 text-blue-600 dark:text-blue-400"
            aria-hidden
          />
          <span className="font-mono text-[15px] font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {whenDate}
          </span>
          <span aria-hidden className="text-stone-300 dark:text-stone-600">
            ·
          </span>
          <span className="text-sm font-medium text-stone-600 dark:text-stone-300">
            {whenTime}
          </span>
        </div>

        {/* Facts — vehicle (left) + service (right): use the width */}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          {vehicle ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-stone-600 dark:text-stone-300">
              <Car
                className="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500"
                aria-hidden
              />
              <span className="truncate">
                {vehicle}
                {a.snapshot_vehicle_mileage != null && (
                  <span className="text-stone-400 dark:text-stone-500">
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {a.snapshot_vehicle_mileage.toLocaleString()} mi
                    </span>
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">
            <Wrench className="h-3 w-3" aria-hidden />
            {serviceLabel(a.service_category)}
          </span>
        </div>

        {/* What they described */}
        <p className="mt-2.5 line-clamp-2 text-sm leading-snug text-stone-600 dark:text-stone-300">
          {a.description}
        </p>

        {/* Meta — photos (left) + submitted (right) */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-stone-400 dark:text-stone-500">
          <span className="inline-flex items-center gap-1">
            {photoCount > 0 && (
              <>
                <ImageIcon className="h-3 w-3" aria-hidden />
                {photoCount} photo{photoCount === 1 ? "" : "s"}
              </>
            )}
          </span>
          <span>{relativeTime(a.submitted_at)}</span>
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
