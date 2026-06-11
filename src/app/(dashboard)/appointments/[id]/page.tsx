import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, Car, Phone, Mail, Gauge, Hash, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/server";
import {
  getAppointment,
  getAppointmentMessages,
} from "@/lib/actions/appointments";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { AppointmentScheduleDialog } from "@/components/appointments/appointment-schedule-dialog";
import { AppointmentCancelButton } from "@/components/appointments/appointment-cancel-button";
import { AppointmentConvertButton } from "@/components/appointments/appointment-convert-button";
import {
  serviceLabel,
  windowLabel,
  dropOffLabel,
  vehicleLabel,
  customerInitials,
  defaultEtTimeForWindow,
  etDateOf,
  etTimeOf,
  formatEtDate,
  formatEtTime,
  formatHourLabel,
} from "@/lib/appointments/display";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appointment = await getAppointment(id);
  if (!appointment) notFound();

  const a = appointment;
  const messages = await getAppointmentMessages(id);

  // booking-photos is a private bucket; sign the stored paths for display.
  let photoUrls: string[] = [];
  if (a.photo_paths.length > 0) {
    const supabase = await createClient();
    const { data: signed } = await supabase.storage
      .from("booking-photos")
      .createSignedUrls(a.photo_paths, 60 * 60);
    photoUrls = (signed ?? [])
      .map((s) => s.signedUrl)
      .filter((u): u is string => Boolean(u));
  }

  const vehicle = vehicleLabel(
    a.snapshot_vehicle_year,
    a.snapshot_vehicle_make,
    a.snapshot_vehicle_model
  );
  const conditional = Object.entries(
    (a.conditional_data ?? {}) as Record<string, unknown>
  ).filter(([, v]) => v !== null && v !== "" && v !== undefined);

  return (
    <PageShell width="wide">
      <Link
        href="/appointments"
        className="inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        <ChevronLeft className="h-4 w-4" />
        Appointments
      </Link>

      {/* Header */}
      <div className="rounded-md border border-stone-200 bg-card p-5 shadow-card dark:border-stone-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-md border border-violet-200 bg-violet-50 text-sm font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
              {customerInitials(a.snapshot_customer_name)}
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                {a.snapshot_customer_name}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                <a
                  href={`tel:${a.snapshot_customer_phone}`}
                  className="inline-flex items-center gap-1 font-mono tabular-nums hover:text-stone-900 dark:hover:text-stone-100"
                >
                  <Phone className="h-3 w-3" />
                  {a.snapshot_customer_phone}
                </a>
                {a.snapshot_customer_email && (
                  <a
                    href={`mailto:${a.snapshot_customer_email}`}
                    className="inline-flex items-center gap-1 hover:text-stone-900 dark:hover:text-stone-100"
                  >
                    <Mail className="h-3 w-3" />
                    {a.snapshot_customer_email}
                  </a>
                )}
                {a.quo_contact_id && (
                  <a
                    href={`https://my.quo.com/inbox/PNq6UNTzCW/c/${a.quo_contact_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in Quo
                  </a>
                )}
              </p>
            </div>
          </div>
          <AppointmentStatusBadge status={a.status} />
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
          {a.status === "pending" && (
            <>
              <AppointmentScheduleDialog
                appointmentId={a.id}
                mode="confirm"
                defaultEtDate={a.preferred_date}
                defaultEtTime={a.preferred_time ?? defaultEtTimeForWindow(a.preferred_time_window)}
                requestedLabel={`${formatEtDate(a.preferred_date)} · ${a.preferred_time ? formatHourLabel(a.preferred_time) : windowLabel(a.preferred_time_window)}`}
                triggerLabel="Confirm with a time"
                triggerSize="default"
              />
              <AppointmentCancelButton appointmentId={a.id} size="default" />
            </>
          )}
          {a.status === "confirmed" && a.scheduled_at && (
            <>
              <AppointmentConvertButton appointmentId={a.id} size="default" />
              <AppointmentScheduleDialog
                appointmentId={a.id}
                mode="reschedule"
                defaultEtDate={etDateOf(a.scheduled_at)}
                defaultEtTime={etTimeOf(a.scheduled_at)}
                requestedLabel={`${formatEtDate(a.scheduled_at)} · ${formatEtTime(a.scheduled_at)}`}
                triggerLabel="Reschedule"
                triggerVariant="outline"
                triggerSize="default"
              />
              <AppointmentCancelButton appointmentId={a.id} size="default" />
            </>
          )}
          {a.status === "converted_to_job" &&
            (a.converted_job_id ? (
              <Link
                href={`/jobs/${a.converted_job_id}`}
                className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                View job →
              </Link>
            ) : (
              <span className="text-sm text-stone-400 dark:text-stone-500">
                Converted (job removed)
              </span>
            ))}
        </div>
      </div>

      {/* Request details */}
      <div className="rounded-md border border-stone-200 bg-card p-5 shadow-card dark:border-stone-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            {serviceLabel(a.service_category)}
          </span>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {dropOffLabel(a.drop_off_or_wait)}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label={a.status === "confirmed" ? "Scheduled" : "Requested"}>
            <span className="font-mono tabular-nums">
              {a.status === "confirmed" && a.scheduled_at
                ? `${formatEtDate(a.scheduled_at)} · ${formatEtTime(a.scheduled_at)}`
                : `${formatEtDate(a.preferred_date)} · ${a.preferred_time ? formatHourLabel(a.preferred_time) : windowLabel(a.preferred_time_window)}`}
            </span>
          </Field>
          {vehicle && (
            <Field label="Vehicle" icon={<Car className="h-3 w-3" />}>
              {vehicle}
            </Field>
          )}
          {a.snapshot_vehicle_mileage != null && (
            <Field label="Mileage" icon={<Gauge className="h-3 w-3" />}>
              <span className="font-mono tabular-nums">
                {a.snapshot_vehicle_mileage.toLocaleString()} mi
              </span>
            </Field>
          )}
          {a.snapshot_vehicle_plate && (
            <Field label="Plate" icon={<Hash className="h-3 w-3" />}>
              <span className="font-mono uppercase">{a.snapshot_vehicle_plate}</span>
            </Field>
          )}
          {a.snapshot_vehicle_vin && (
            <Field label="VIN" icon={<Hash className="h-3 w-3" />}>
              <span className="font-mono">{a.snapshot_vehicle_vin}</span>
            </Field>
          )}
        </dl>

        <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            What they described
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
            {a.description}
          </p>
        </div>

        {conditional.length > 0 && (
          <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Additional details
            </p>
            <dl className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5">
              {conditional.map(([key, value]) => (
                <div key={key} className="text-sm">
                  <dt className="inline text-stone-500 dark:text-stone-400">
                    {key.replace(/_/g, " ")}:{" "}
                  </dt>
                  <dd className="inline font-medium text-stone-800 dark:text-stone-200">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Photos */}
      {photoUrls.length > 0 && (
        <div className="rounded-md border border-stone-200 bg-card p-5 shadow-card dark:border-stone-800">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Photos
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photoUrls.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square overflow-hidden rounded-md border border-stone-200 dark:border-stone-800"
              >
                <Image
                  src={url}
                  alt={`Appointment photo ${i + 1}`}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 33vw, 150px"
                  className="object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Communication timeline */}
      <div className="rounded-md border border-stone-200 bg-card p-5 shadow-card dark:border-stone-800">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Texts
        </p>
        {messages === null ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load texts — try refreshing.
          </p>
        ) : messages.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            No texts logged yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                <span
                  className={
                    "mt-1.5 h-2 w-2 flex-none rounded-full " +
                    (m.status === "failed"
                      ? "bg-red-500"
                      : "bg-emerald-500")
                  }
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm text-stone-700 dark:text-stone-300">
                    {m.body}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
                    <span className="font-mono tabular-nums">
                      {formatEtDate(m.sent_at)} · {formatEtTime(m.sent_at)}
                    </span>
                    {m.status === "failed" && (
                      <span className="ml-2 font-semibold text-red-500">
                        failed
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-stone-800 dark:text-stone-200">
        {children}
      </dd>
    </div>
  );
}
