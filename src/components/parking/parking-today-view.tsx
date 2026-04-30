"use client";

import {
  ParkingReservationCardCompact,
} from "@/components/parking/parking-reservation-card";
import { ParkingCardActions } from "@/components/parking/parking-card-actions";
import { PlaneLanding, PlaneTakeoff, CalendarClock, Car } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ACCENT_ICON_TINT,
  type Accent,
} from "@/components/ui/mini-status-card";
import { cn } from "@/lib/utils";
import type { ParkingReservation } from "@/types";

interface DashboardData {
  arrivals: ParkingReservation[];
  pickups: ParkingReservation[];
  tomorrowPickups: ParkingReservation[];
  currentlyParked: ParkingReservation[];
  serviceLeads: ParkingReservation[];
}

function KPICard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Accent;
}) {
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card flex items-center gap-3 p-4">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border",
          ACCENT_ICON_TINT[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-mono tabular-nums text-3xl font-extrabold tracking-tighter text-stone-900 dark:text-stone-50 leading-none">
          {value}
        </p>
        <p className="mt-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
          {label}
        </p>
      </div>
    </div>
  );
}

type ReservationVariant = "arrival" | "pickup" | "pickup-tomorrow";

interface ReservationColumnProps {
  title: string;
  tone: Accent;
  icon: LucideIcon;
  reservations: ParkingReservation[];
  lockBoxCodes: Record<number, string>;
  variant: ReservationVariant;
  emptyMessage: string;
}

function ReservationColumn({
  title,
  tone,
  icon: Icon,
  reservations,
  lockBoxCodes,
  variant,
  emptyMessage,
}: ReservationColumnProps) {
  return (
    <div className="h-full rounded-md border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
        <span
          className={cn(
            "w-7 h-7 rounded-md grid place-items-center border flex-none",
            ACCENT_ICON_TINT[tone]
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
          {title}
        </span>
        <span className="ml-auto font-mono tabular-nums text-base font-bold text-stone-900 dark:text-stone-50">
          {reservations.length}
        </span>
      </div>
      <div className="flex-1 p-2 space-y-2">
        {reservations.length === 0 ? (
          <div className="flex items-center justify-center rounded-md border border-dashed border-stone-300 dark:border-stone-700 py-6">
            <p className="text-xs text-stone-400 dark:text-stone-500">
              {emptyMessage}
            </p>
          </div>
        ) : (
          reservations.map((r) => (
            <ParkingReservationCardCompact
              key={r.id}
              reservation={r}
              lockBoxCodes={lockBoxCodes}
              variant={r.status === "checked_out" ? "checked-out" : variant}
              showActions={<ParkingCardActions reservation={r} />}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function ParkingTodayView({
  data,
  lockBoxCodes = {},
}: {
  data: DashboardData;
  lockBoxCodes?: Record<number, string>;
}) {
  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          label="Picking Up Today"
          value={data.pickups.length}
          icon={PlaneTakeoff}
          tone="amber"
        />
        <KPICard
          label="Picking Up Tomorrow"
          value={data.tomorrowPickups.length}
          icon={CalendarClock}
          tone="stone"
        />
        <KPICard
          label="Arriving Today"
          value={data.arrivals.length}
          icon={PlaneLanding}
          tone="blue"
        />
        <KPICard
          label="Currently Parked"
          value={data.currentlyParked.length}
          icon={Car}
          tone="stone"
        />
      </div>

      {/* Kanban — 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        <ReservationColumn
          title="Picking Up Today"
          tone="amber"
          icon={PlaneTakeoff}
          reservations={data.pickups}
          lockBoxCodes={lockBoxCodes}
          variant="pickup"
          emptyMessage="No pickups today"
        />
        <ReservationColumn
          title="Picking Up Tomorrow"
          tone="stone"
          icon={CalendarClock}
          reservations={data.tomorrowPickups}
          lockBoxCodes={lockBoxCodes}
          variant="pickup-tomorrow"
          emptyMessage="No pickups tomorrow"
        />
        <ReservationColumn
          title="Arriving Today"
          tone="blue"
          icon={PlaneLanding}
          reservations={data.arrivals}
          lockBoxCodes={lockBoxCodes}
          variant="arrival"
          emptyMessage="No arrivals today"
        />
      </div>
    </div>
  );
}
