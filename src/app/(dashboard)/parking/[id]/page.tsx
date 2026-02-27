import { notFound } from "next/navigation";
import Link from "next/link";
import { getParkingReservation } from "@/lib/actions/parking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PARKING_STATUS_LABELS,
  PARKING_STATUS_COLORS,
  PARKING_SERVICE_LABELS,
} from "@/lib/constants";
import { ParkingActionButtons } from "@/components/parking/parking-actions";
import { ParkingNotesForm } from "@/components/parking/parking-notes-form";
import {
  ArrowLeft,
  Car,
  Calendar,
  Clock,
  Phone,
  Mail,
  MapPin,
  Hash,
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
  const reservation = await getParkingReservation(id);

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
            </div>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
              {reservation.lot} · #{reservation.confirmation_number}
            </p>
          </div>

          <ParkingActionButtons
            id={reservation.id}
            status={reservation.status}
          />
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
            {reservation.spot_number && (
              <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                <MapPin className="h-4 w-4 shrink-0 text-stone-400" />
                Spot {reservation.spot_number}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trip Dates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Trip Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <Calendar className="h-4 w-4 shrink-0 text-stone-400" />
              <div>
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  Drop-off:
                </span>{" "}
                {formatDate(reservation.drop_off_date)}{" "}
                at {formatTime(reservation.drop_off_time)}
              </div>
            </div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <Calendar className="h-4 w-4 shrink-0 text-stone-400" />
              <div>
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  Pick-up:
                </span>{" "}
                {formatDate(reservation.pick_up_date)}{" "}
                at {formatTime(reservation.pick_up_time)}
              </div>
            </div>
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

        {/* Services Interested */}
        {reservation.services_interested.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Services Interested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {reservation.services_interested.map((service) => (
                  <Badge
                    key={service}
                    variant="secondary"
                    className="bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 border-0"
                  >
                    {PARKING_SERVICE_LABELS[service] || service}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes & Spot */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Staff Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ParkingNotesForm
              id={reservation.id}
              spotNumber={reservation.spot_number}
              staffNotes={reservation.staff_notes}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
