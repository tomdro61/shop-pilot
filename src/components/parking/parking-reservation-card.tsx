"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PARKING_STATUS_LABELS, PARKING_STATUS_COLORS, PARKING_SERVICE_LABELS } from "@/lib/constants";
import { formatCustomerName } from "@/lib/utils/format";
import { CustomerLink } from "@/components/ui/customer-link";
import { Car, Clock, KeyRound } from "lucide-react";
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
  const router = useRouter();
  const statusColors = PARKING_STATUS_COLORS[reservation.status];

  return (
    <div
      onClick={() => router.push(`/parking/${reservation.id}`)}
      className="cursor-pointer bg-card rounded-lg shadow-card p-4 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-stone-900 dark:text-stone-50">
              <CustomerLink customerId={reservation.customer_id} stopPropagation>
                {formatCustomerName(reservation)}
              </CustomerLink>
            </span>
            <Badge
              variant="secondary"
              className={`${statusColors.bg} ${statusColors.text} border-0 text-[11px]`}
            >
              {PARKING_STATUS_LABELS[reservation.status]}
            </Badge>
            {reservation.parking_type === "shuttle" && (
              <Badge
                variant="secondary"
                className="bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border-0 text-[11px]"
              >
                Shuttle
              </Badge>
            )}
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

          {reservation.services_interested && reservation.services_interested.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {reservation.services_interested.map((service) => (
                <Badge
                  key={service}
                  variant="secondary"
                  className="bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400 border-0 text-[10px]"
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
            onClick={(e) => e.stopPropagation()}
          >
            {showActions}
          </div>
        )}
      </div>
    </div>
  );
}

export function ParkingReservationCardCompact({
  reservation,
  showActions,
  variant = "arrival",
  lockBoxCodes = {},
}: {
  reservation: ParkingReservation;
  showActions?: React.ReactNode;
  variant?: "arrival" | "pickup" | "pickup-tomorrow" | "parked" | "checked-out";
  lockBoxCodes?: Record<number, string>;
}) {
  const router = useRouter();
  const variantStyles: Record<string, string> = {
    arrival: "border-l-blue-400 dark:border-l-blue-500 border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-950/50",
    pickup: "border-l-amber-400 dark:border-l-amber-500 border-amber-200 dark:border-amber-800 bg-amber-100 dark:bg-amber-950/50",
    "pickup-tomorrow": "border-l-orange-400 dark:border-l-orange-500 border-orange-200 dark:border-orange-800 bg-orange-100 dark:bg-orange-950/50",
    "checked-out": "border-l-green-400 dark:border-l-green-500 border-green-200 dark:border-green-800 bg-green-100 dark:bg-green-950/50",
    parked: "border-l-stone-300 dark:border-l-stone-600 border-stone-200 dark:border-stone-700 bg-card",
  };

  const isPickup = variant === "pickup" || variant === "pickup-tomorrow" || variant === "checked-out";
  const timeLabel = isPickup ? "Pickup" : variant === "parked" ? "Departs" : "Arrival";
  const timeValue =
    isPickup
      ? formatTime(reservation.pick_up_time)
      : variant === "parked"
        ? `${formatDate(reservation.pick_up_date)} ${formatTime(reservation.pick_up_time)}`
        : formatTime(reservation.drop_off_time);

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-l-4 px-4 py-3 ${variantStyles[variant]}`}>
      <div
        onClick={() => router.push(`/parking/${reservation.id}`)}
        className="cursor-pointer min-w-0 flex-1"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-stone-900 dark:text-stone-50 truncate">
            <CustomerLink customerId={reservation.customer_id} stopPropagation>
              {formatCustomerName(reservation)}
            </CustomerLink>
          </p>
          {reservation.parking_type === "shuttle" && (
            <Badge
              variant="secondary"
              className="bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border-0 text-[10px] shrink-0"
            >
              Shuttle
            </Badge>
          )}
        </div>
        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              {timeLabel} {timeValue}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Car className="h-3 w-3" />
            <span>{reservation.make} {reservation.model}</span>
            <span className="text-stone-300 dark:text-stone-600">·</span>
            <span>{reservation.license_plate}</span>
            {reservation.color && (
              <>
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <span>{reservation.color}</span>
              </>
            )}
            {reservation.services_interested && reservation.services_interested.length > 0 && (
              <>
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <span className="text-violet-600 dark:text-violet-400">
                  {reservation.services_interested.length} service{reservation.services_interested.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
          {/* Lockbox info for checked-out reservations */}
          {reservation.status === "checked_out" && (
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <KeyRound className="h-3 w-3 text-stone-400" />
              {reservation.lock_box_number ? (
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  Lockbox #{reservation.lock_box_number}
                  {lockBoxCodes[reservation.lock_box_number] && (
                    <span className="text-stone-400 dark:text-stone-500"> · Code: {lockBoxCodes[reservation.lock_box_number]}</span>
                  )}
                </span>
              ) : (
                <span className="text-stone-400 dark:text-stone-500">In person pickup</span>
              )}
            </div>
          )}
        </div>
      </div>
      {showActions && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{showActions}</div>}
    </div>
  );
}
