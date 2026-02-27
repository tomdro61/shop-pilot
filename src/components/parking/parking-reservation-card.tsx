"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PARKING_STATUS_LABELS, PARKING_STATUS_COLORS, PARKING_SERVICE_LABELS } from "@/lib/constants";
import { Car, Clock } from "lucide-react";
import type { ParkingReservation } from "@/types";

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ParkingReservationCard({
  reservation,
  showActions,
}: {
  reservation: ParkingReservation;
  showActions?: React.ReactNode;
}) {
  const statusColors = PARKING_STATUS_COLORS[reservation.status];

  return (
    <Link
      href={`/parking/${reservation.id}`}
      className="block rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
              {reservation.first_name} {reservation.last_name}
            </span>
            <Badge
              variant="secondary"
              className={`${statusColors.bg} ${statusColors.text} border-0 text-[11px]`}
            >
              {PARKING_STATUS_LABELS[reservation.status]}
            </Badge>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1">
              <Car className="h-3 w-3" />
              {reservation.make} {reservation.model}
            </span>
            <span>{reservation.license_plate}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(reservation.drop_off_date)} {formatTime(reservation.drop_off_time)}
              {" → "}
              {formatDate(reservation.pick_up_date)} {formatTime(reservation.pick_up_time)}
            </span>
          </div>

          {reservation.services_interested.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {reservation.services_interested.map((service) => (
                <Badge
                  key={service}
                  variant="secondary"
                  className="bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 border-0 text-[10px]"
                >
                  {PARKING_SERVICE_LABELS[service] || service}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-1.5 text-[11px] text-stone-400 dark:text-stone-500">
            {reservation.lot} · #{reservation.confirmation_number}
          </div>
        </div>

        {showActions && (
          <div
            className="shrink-0"
            onClick={(e) => e.preventDefault()}
          >
            {showActions}
          </div>
        )}
      </div>
    </Link>
  );
}

export function ParkingReservationCardCompact({
  reservation,
  showActions,
  variant = "arrival",
}: {
  reservation: ParkingReservation;
  showActions?: React.ReactNode;
  variant?: "arrival" | "pickup" | "pickup-tomorrow" | "parked";
}) {
  const isPickup = variant === "pickup" || variant === "pickup-tomorrow";
  const timeLabel =
    isPickup
      ? "Pickup"
      : variant === "parked"
        ? "Departs"
        : "Arrival";
  const timeValue =
    isPickup
      ? formatTime(reservation.pick_up_time)
      : variant === "parked"
        ? `${formatDate(reservation.pick_up_date)} ${formatTime(reservation.pick_up_time)}`
        : formatTime(reservation.drop_off_time);

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
      variant === "arrival"
        ? "border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50"
        : variant === "pickup"
          ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50"
        : variant === "pickup-tomorrow"
          ? "border-orange-200 dark:border-orange-900 bg-orange-100 dark:bg-orange-950/50"
          : variant === "parked"
            ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/50"
            : "border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900"
    }`}>
      <Link href={`/parking/${reservation.id}`} className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
          {reservation.first_name} {reservation.last_name}
        </p>
        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              {timeLabel} {timeValue}
            </span>
            {/* Car info inline on desktop */}
            <span className="hidden md:contents">
              <span className="text-stone-300 dark:text-stone-600">·</span>
              <span>{reservation.make} {reservation.model}</span>
              <span className="text-stone-300 dark:text-stone-600">·</span>
              <span>{reservation.license_plate}</span>
              {reservation.color && (
                <>
                  <span className="text-stone-300 dark:text-stone-600">·</span>
                  <span>{reservation.color}</span>
                </>
              )}
            </span>
            {reservation.services_interested.length > 0 && (
              <>
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <span className="text-violet-600 dark:text-violet-400">
                  {reservation.services_interested.length} service{reservation.services_interested.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
          {/* Car info on its own line on mobile */}
          <div className="flex items-center gap-2 mt-0.5 md:hidden">
            <span>{reservation.make} {reservation.model}</span>
            <span className="text-stone-300 dark:text-stone-600">·</span>
            <span>{reservation.license_plate}</span>
            {reservation.color && (
              <>
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <span>{reservation.color}</span>
              </>
            )}
          </div>
        </div>
      </Link>
      {showActions && <div className="shrink-0">{showActions}</div>}
    </div>
  );
}
