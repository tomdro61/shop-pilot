import { notFound } from "next/navigation";
import Link from "next/link";
import { getParkingReservation } from "@/lib/actions/parking";
import { getInvoicesForParkingReservation } from "@/lib/actions/invoices";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PARKING_STATUS_LABELS,
  PARKING_STATUS_COLORS,
  PARKING_SERVICE_LABELS,
} from "@/lib/constants";
import { ParkingActionButtons } from "@/components/parking/parking-actions";
import { SendSpecialsButton } from "@/components/parking/send-specials-button";
import { ParkingNotesForm } from "@/components/parking/parking-notes-form";
import { ParkingDatesForm } from "@/components/parking/parking-dates-form";
import { ParkingServicesForm } from "@/components/parking/parking-services-form";
import { ParkingInvoiceSection } from "@/components/parking/parking-invoice-section";
import {
  ArrowLeft,
  Car,
  Calendar,
  Clock,
  Phone,
  Mail,
  Hash,
  Palette,
  KeyRound,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reservation = await getParkingReservation(id);
  if (!reservation) return { title: "Not Found | ShopPilot" };
  return {
    title: `${reservation.first_name} ${reservation.last_name} — Parking | ShopPilot`,
  };
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ParkingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [reservation, invoices] = await Promise.all([
    getParkingReservation(id),
    getInvoicesForParkingReservation(id),
  ]);

  if (!reservation) notFound();

  // Look up lockbox code if checked out with a lockbox
  let lockBoxCode: string | null = null;
  if (reservation.status === "checked_out" && reservation.lock_box_number) {
    const admin = createAdminClient();
    const { data: lb } = await admin
      .from("lock_boxes")
      .select("code")
      .eq("box_number", reservation.lock_box_number)
      .single();
    lockBoxCode = lb?.code ?? null;
  }

  const statusColors = PARKING_STATUS_COLORS[reservation.status];

  const timeline = [
    { label: "Reserved", time: reservation.created_at, active: true },
    { label: "Checked in", time: reservation.checked_in_at, active: !!reservation.checked_in_at },
    { label: "Checked out", time: reservation.checked_out_at, active: !!reservation.checked_out_at },
  ];

  return (
    <div className="p-4 lg:p-10 pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/parking"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Return to Dashboard
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Reservation Detail
            </h1>
            <span className="text-sm text-stone-400 dark:text-stone-500">
              #{reservation.confirmation_number}
            </span>
            <Badge
              variant="secondary"
              className={`${statusColors.bg} ${statusColors.text} border-0`}
            >
              {PARKING_STATUS_LABELS[reservation.status]}
            </Badge>
            {reservation.parking_type === "shuttle" && (
              <Badge
                variant="secondary"
                className="bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border-0"
              >
                Shuttle
              </Badge>
            )}
            {reservation.parking_type === "valet" && (
              <Badge
                variant="secondary"
                className="bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border-0"
              >
                Valet
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ParkingActionButtons
              id={reservation.id}
              status={reservation.status}
              customerName={`${reservation.first_name} ${reservation.last_name}`}
              customerPhone={reservation.phone}
            />
            {reservation.status === "checked_in" && reservation.phone && (
              <SendSpecialsButton reservationId={reservation.id} />
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Left Column ── */}
        <div className="space-y-6">
          {/* Customer & Vehicle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl shadow-card p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">Customer</p>
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50 mb-3">
                {reservation.first_name} {reservation.last_name}
              </h2>
              <div className="space-y-1.5 text-sm text-stone-500 dark:text-stone-400">
                <a href={`tel:${reservation.phone}`} className="flex items-center gap-1.5 hover:underline">
                  <Phone className="h-3.5 w-3.5" />
                  {reservation.phone}
                </a>
                <a href={`mailto:${reservation.email}`} className="flex items-center gap-1.5 hover:underline truncate">
                  <Mail className="h-3.5 w-3.5" />
                  {reservation.email}
                </a>
              </div>
            </div>
            <div className="bg-card rounded-xl shadow-card p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">Vehicle</p>
              <div className="space-y-2.5 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-0.5">Make / Model</p>
                  <p className="font-medium text-stone-900 dark:text-stone-50">{reservation.make} {reservation.model}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-0.5">License Plate</p>
                  <p className="font-medium text-stone-900 dark:text-stone-50">{reservation.license_plate}</p>
                </div>
                {reservation.color && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-0.5">Color</p>
                    <p className="font-medium text-stone-900 dark:text-stone-50">{reservation.color}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trip Dates + Timeline */}
          <div className="bg-card rounded-xl shadow-card p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
              Trip Dates
            </p>
            <ParkingDatesForm
              id={reservation.id}
              dropOffDate={reservation.drop_off_date}
              dropOffTime={reservation.drop_off_time}
              pickUpDate={reservation.pick_up_date}
              pickUpTime={reservation.pick_up_time}
            />

            {/* Timeline */}
            <div className="mt-6 space-y-4">
              {timeline.map((step, i) => (
                <div key={step.label} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 ${
                      step.active
                        ? "bg-blue-600 dark:bg-blue-500"
                        : "bg-stone-200 dark:bg-stone-700"
                    }`} />
                    {i < timeline.length - 1 && (
                      <div className="w-px h-6 bg-stone-200 dark:bg-stone-700 mt-1" />
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${
                      step.active
                        ? "text-stone-900 dark:text-stone-50"
                        : "text-stone-400 dark:text-stone-500"
                    }`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-stone-400 dark:text-stone-500">
                      {formatTimestamp(step.time)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Pickup — only when checked out */}
          {reservation.status === "checked_out" && (
            <div className="bg-card rounded-xl shadow-card p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
                Key Pickup
              </p>
              {reservation.lock_box_number ? (
                <div className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 shrink-0 text-stone-400" />
                    <span>
                      <span className="font-medium text-stone-700 dark:text-stone-300">Lock box:</span>{" "}
                      #{reservation.lock_box_number}
                    </span>
                  </div>
                  {lockBoxCode && (
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 shrink-0 text-stone-400" />
                      <span>
                        <span className="font-medium text-stone-700 dark:text-stone-300">Code:</span>{" "}
                        {lockBoxCode}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4 shrink-0 text-stone-400" />
                  <span className="font-medium text-stone-700 dark:text-stone-300">In person pickup</span>
                </div>
              )}
            </div>
          )}

          {/* Service Interests */}
          <div className="bg-card rounded-xl shadow-card p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
              Service Interests
            </p>
            <ParkingServicesForm
              id={reservation.id}
              services={reservation.services_interested}
            />
          </div>
        </div>

        {/* ── Right Column ── */}
        <div className="space-y-6">
          {/* Invoices */}
          <ParkingInvoiceSection
            reservationId={reservation.id}
            invoices={invoices}
            customerPhone={reservation.phone}
            customerEmail={reservation.email}
          />

          {/* Staff Notes */}
          <div className="bg-card rounded-xl shadow-card p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
              Staff Notes
            </p>
            <ParkingNotesForm
              id={reservation.id}
              staffNotes={reservation.staff_notes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
