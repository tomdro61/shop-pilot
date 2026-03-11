import { notFound } from "next/navigation";
import Link from "next/link";
import { getParkingReservation } from "@/lib/actions/parking";
import { getInvoicesForParkingReservation } from "@/lib/actions/invoices";
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

  const statusColors = PARKING_STATUS_COLORS[reservation.status];

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6">
      {/* Back + Header */}
      <div className="mb-5">
        <Link href="/parking">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-stone-900 dark:text-stone-50">
                {reservation.first_name} {reservation.last_name}
              </h1>
              <Badge
                variant="secondary"
                className={`${statusColors.bg} ${statusColors.text} border-0`}
              >
                {PARKING_STATUS_LABELS[reservation.status]}
              </Badge>
              {reservation.parking_type === "shuttle" && (
                <Badge
                  variant="secondary"
                  className="bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 border-0"
                >
                  Shuttle
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
              {reservation.lot} · #{reservation.confirmation_number}
            </p>
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Contact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <Phone className="h-4 w-4 shrink-0 text-stone-400" />
              <a href={`tel:${reservation.phone}`} className="hover:underline">
                {reservation.phone}
              </a>
            </div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <Mail className="h-4 w-4 shrink-0 text-stone-400" />
              <a
                href={`mailto:${reservation.email}`}
                className="hover:underline truncate"
              >
                {reservation.email}
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <Car className="h-4 w-4 shrink-0 text-stone-400" />
              {reservation.make} {reservation.model}
            </div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <Hash className="h-4 w-4 shrink-0 text-stone-400" />
              {reservation.license_plate}
            </div>
            {reservation.color && (
              <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                <Palette className="h-4 w-4 shrink-0 text-stone-400" />
                {reservation.color}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trip Dates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Trip Dates</CardTitle>
          </CardHeader>
          <CardContent>
            <ParkingDatesForm
              id={reservation.id}
              dropOffDate={reservation.drop_off_date}
              dropOffTime={reservation.drop_off_time}
              pickUpDate={reservation.pick_up_date}
              pickUpTime={reservation.pick_up_time}
            />
          </CardContent>
        </Card>

        {/* Timestamps */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Timestamps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-stone-400" />
              <div>
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  Reserved:
                </span>{" "}
                {formatTimestamp(reservation.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-stone-400" />
              <div>
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  Checked in:
                </span>{" "}
                {formatTimestamp(reservation.checked_in_at)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-stone-400" />
              <div>
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  Checked out:
                </span>{" "}
                {formatTimestamp(reservation.checked_out_at)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Services</CardTitle>
          </CardHeader>
          <CardContent>
            <ParkingServicesForm
              id={reservation.id}
              services={reservation.services_interested}
            />
          </CardContent>
        </Card>

        {/* Invoices */}
        <ParkingInvoiceSection
          reservationId={reservation.id}
          invoices={invoices}
          customerPhone={reservation.phone}
          customerEmail={reservation.email}
        />

        {/* Staff Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Staff Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ParkingNotesForm
              id={reservation.id}
              staffNotes={reservation.staff_notes}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
