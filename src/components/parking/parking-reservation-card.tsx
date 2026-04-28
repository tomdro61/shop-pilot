"use client";

import { useRouter } from "next/navigation";
import { PARKING_STATUS_LABELS, PARKING_STATUS_COLORS, PARKING_SERVICE_LABELS } from "@/lib/constants";
import { formatCustomerName } from "@/lib/utils/format";
import { CustomerLink } from "@/components/ui/customer-link";
import { Car, KeyRound, Wrench, ArrowRight } from "lucide-react";
import type { ParkingReservation, ParkingStatus } from "@/types";

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

const STATUS_TINT: Record<ParkingStatus, string> = {
  reserved: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900",
  checked_in: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
  checked_out: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
  no_show: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900",
  cancelled: "bg-stone-50 border-stone-200 dark:bg-stone-900/50 dark:border-stone-800",
};

const STATUS_BAR: Record<ParkingStatus, string> = {
  reserved: "bg-blue-500",
  checked_in: "bg-amber-500",
  checked_out: "bg-emerald-500",
  no_show: "bg-red-500",
  cancelled: "bg-stone-300 dark:bg-stone-700",
};

const STATUS_PANEL: Record<ParkingStatus, string> = {
  reserved: "bg-blue-100/60 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900",
  checked_in: "bg-amber-100/60 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900",
  checked_out: "bg-emerald-100/60 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900",
  no_show: "bg-red-100/60 border-red-200 dark:bg-red-950/40 dark:border-red-900",
  cancelled: "bg-stone-100/60 border-stone-200 dark:bg-stone-900/50 dark:border-stone-800/60",
};

export function ParkingReservationCard({
  reservation,
  showActions,
}: {
  reservation: ParkingReservation;
  showActions?: React.ReactNode;
}) {
  const router = useRouter();
  const status = reservation.status as ParkingStatus;
  const isTerminal = status === "no_show" || status === "cancelled";
  const vehicleText = [reservation.make, reservation.model].filter(Boolean).join(" ");

  return (
    <div className={`relative overflow-hidden rounded-lg border shadow-sm transition-colors ${STATUS_TINT[status]}`}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${STATUS_BAR[status]}`} aria-hidden />

      <div className="pl-4 pr-3 py-3 flex items-start gap-3">
        <div
          onClick={() => router.push(`/parking/${reservation.id}`)}
          className="cursor-pointer min-w-0 flex-1 space-y-2"
        >
          {/* Header: customer name + (shuttle/valet/terminal-status) pills */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                <CustomerLink customerId={reservation.customer_id} stopPropagation>
                  {formatCustomerName(reservation)}
                </CustomerLink>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
                <span className="font-mono tabular-nums">
                  {formatDate(reservation.drop_off_date)} {formatTime(reservation.drop_off_time)}
                </span>
                <ArrowRight className="h-3 w-3 text-stone-400" />
                <span className="font-mono tabular-nums">
                  {formatDate(reservation.pick_up_date)} {formatTime(reservation.pick_up_time)}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {reservation.parking_type === "shuttle" && (
                <span className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                  Shuttle
                </span>
              )}
              {reservation.parking_type === "valet" && (
                <span className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                  Valet
                </span>
              )}
              {isTerminal && (
                <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${PARKING_STATUS_COLORS[status].bg} ${PARKING_STATUS_COLORS[status].text}`}>
                  {PARKING_STATUS_LABELS[status]}
                </span>
              )}
            </div>
          </div>

          {/* Vehicle row — recessed, plate inline */}
          {(vehicleText || reservation.license_plate) && (
            <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${STATUS_PANEL[status]}`}>
              <Car className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
              <span className="min-w-0 flex-1 text-xs text-stone-800 dark:text-stone-200 truncate">
                <span className="font-medium">{vehicleText || "Vehicle"}</span>
                {reservation.color && (
                  <span className="text-stone-500 dark:text-stone-400 capitalize"> · {reservation.color}</span>
                )}
                {reservation.license_plate && (
                  <>
                    <span className="text-stone-300 dark:text-stone-600"> · </span>
                    <span className="font-mono tabular-nums text-stone-500 dark:text-stone-400">
                      {reservation.license_plate}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Conditional service indicator */}
          {!isTerminal && status !== "checked_out" && reservation.services_interested && reservation.services_interested.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <Wrench className="h-3 w-3 text-violet-600 dark:text-violet-400 shrink-0" />
              {reservation.services_interested.slice(0, 3).map((service) => (
                <span
                  key={service}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400"
                >
                  {PARKING_SERVICE_LABELS[service] || service}
                </span>
              ))}
              {reservation.services_interested.length > 3 && (
                <span className="text-[10px] text-violet-600 dark:text-violet-400">
                  +{reservation.services_interested.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Lockbox info for checked-out */}
          {status === "checked_out" && (
            <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
              <KeyRound className="h-3 w-3 text-stone-400" />
              {reservation.lock_box_number ? (
                <span>
                  <span className="text-stone-700 dark:text-stone-300">
                    Lockbox <span className="font-mono tabular-nums">#{reservation.lock_box_number}</span>
                  </span>
                </span>
              ) : (
                <span>In person pickup</span>
              )}
            </div>
          )}

          {/* Footer: lot + confirmation # */}
          <div className="text-[11px] text-stone-500 dark:text-stone-400">
            {reservation.lot}
            <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
            <span className="font-mono tabular-nums">#{reservation.confirmation_number}</span>
          </div>
        </div>

        {showActions && (
          <div className="shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
            {showActions}
          </div>
        )}
      </div>
    </div>
  );
}

const VARIANT_TINT: Record<string, string> = {
  arrival: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900",
  pickup: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
  "pickup-tomorrow": "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900",
  "checked-out": "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
  parked: "bg-card border-stone-200 dark:border-stone-800",
};

const VARIANT_BAR: Record<string, string> = {
  arrival: "bg-blue-500",
  pickup: "bg-amber-500",
  "pickup-tomorrow": "bg-orange-500",
  "checked-out": "bg-emerald-500",
  parked: "bg-stone-300 dark:bg-stone-700",
};

const VARIANT_PANEL: Record<string, string> = {
  arrival: "bg-blue-100/60 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900",
  pickup: "bg-amber-100/60 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900",
  "pickup-tomorrow": "bg-orange-100/60 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900",
  "checked-out": "bg-emerald-100/60 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900",
  parked: "bg-stone-50 border-stone-100 dark:bg-stone-900/50 dark:border-stone-800/60",
};

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

  const isPickup = variant === "pickup" || variant === "pickup-tomorrow" || variant === "checked-out";
  const timeLabel = isPickup ? "Pickup" : variant === "parked" ? "Departs" : "Arrival";
  const timeValue =
    isPickup
      ? formatTime(reservation.pick_up_time)
      : variant === "parked"
        ? `${formatDate(reservation.pick_up_date)} ${formatTime(reservation.pick_up_time)}`
        : formatTime(reservation.drop_off_time);

  const vehicleText = [reservation.make, reservation.model].filter(Boolean).join(" ");

  return (
    <div className={`relative overflow-hidden rounded-lg border shadow-sm transition-colors ${VARIANT_TINT[variant]}`}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${VARIANT_BAR[variant]}`} aria-hidden />
      <div className="pl-4 pr-3 py-3 flex items-start gap-3">
        <div
          onClick={() => router.push(`/parking/${reservation.id}`)}
          className="cursor-pointer min-w-0 flex-1 space-y-2"
        >
          {/* Header: name + time on left, status/type pills on right */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                <CustomerLink customerId={reservation.customer_id} stopPropagation>
                  {formatCustomerName(reservation)}
                </CustomerLink>
              </div>
              <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                <span className="font-medium text-stone-700 dark:text-stone-300">{timeLabel}</span>{" "}
                <span className="font-mono tabular-nums">{timeValue}</span>
              </div>
            </div>
            {(reservation.parking_type === "shuttle" || reservation.parking_type === "valet") && (
              <div className="flex shrink-0 items-center gap-1">
                {reservation.parking_type === "shuttle" && (
                  <span className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                    Shuttle
                  </span>
                )}
                {reservation.parking_type === "valet" && (
                  <span className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                    Valet
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Vehicle row — recessed, plate inline */}
          {(vehicleText || reservation.license_plate) && (
            <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${VARIANT_PANEL[variant]}`}>
              <Car className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
              <span className="min-w-0 flex-1 text-xs text-stone-800 dark:text-stone-200 truncate">
                <span className="font-medium">{vehicleText || "Vehicle"}</span>
                {reservation.color && (
                  <span className="text-stone-500 dark:text-stone-400 capitalize"> · {reservation.color}</span>
                )}
                {reservation.license_plate && (
                  <>
                    <span className="text-stone-300 dark:text-stone-600"> · </span>
                    <span className="font-mono tabular-nums text-stone-500 dark:text-stone-400">
                      {reservation.license_plate}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Conditional footer: lockbox (checked-out) or services indicator */}
          {reservation.status === "checked_out" ? (
            <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
              <KeyRound className="h-3 w-3 text-stone-400" />
              {reservation.lock_box_number ? (
                <span>
                  <span className="text-stone-700 dark:text-stone-300">
                    Lockbox <span className="font-mono tabular-nums">#{reservation.lock_box_number}</span>
                  </span>
                  {lockBoxCodes[reservation.lock_box_number] && (
                    <>
                      {" · "}
                      <span className="font-mono tabular-nums">code {lockBoxCodes[reservation.lock_box_number]}</span>
                    </>
                  )}
                </span>
              ) : (
                <span>In person pickup</span>
              )}
            </div>
          ) : (
            reservation.services_interested && reservation.services_interested.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
                <Wrench className="h-3 w-3" />
                <span>
                  <span className="font-mono tabular-nums">{reservation.services_interested.length}</span>{" "}
                  service request{reservation.services_interested.length > 1 ? "s" : ""}
                </span>
              </div>
            )
          )}
        </div>

        {showActions && (
          <div className="shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
            {showActions}
          </div>
        )}
      </div>
    </div>
  );
}
