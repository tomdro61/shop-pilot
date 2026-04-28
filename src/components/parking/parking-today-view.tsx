"use client";

import {
  ParkingReservationCardCompact,
} from "@/components/parking/parking-reservation-card";
import { ParkingCardActions } from "@/components/parking/parking-card-actions";
import { PlaneLanding, PlaneTakeoff, Car } from "lucide-react";
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
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm flex items-center gap-3 p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent || "bg-stone-100 dark:bg-stone-800"}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-mono tabular-nums text-3xl font-extrabold tracking-tighter text-stone-900 dark:text-stone-50">
          {value}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">{label}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
        {title}
      </h2>
      <span className="rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-500 dark:text-stone-400">
        {count}
      </span>
    </div>
  );
}

export function ParkingTodayView({ data, lockBoxCodes = {} }: { data: DashboardData; lockBoxCodes?: Record<number, string> }) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          label="Picking Up Today"
          value={data.pickups.length}
          icon={PlaneTakeoff}
          accent="bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
        />
        <KPICard
          label="Arriving Today"
          value={data.arrivals.length}
          icon={PlaneLanding}
          accent="bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
        />
        <KPICard
          label="Picking Up Tomorrow"
          value={data.tomorrowPickups.length}
          icon={PlaneTakeoff}
          accent="bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400"
        />
        <KPICard
          label="Currently Parked"
          value={data.currentlyParked.length}
          icon={Car}
        />
      </div>

      {/* Today's Pickups */}
      <div className="space-y-3">
        <SectionHeader title="Picking Up Today" count={data.pickups.length} />
        {data.pickups.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500">
            No pickups scheduled for today.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {data.pickups.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                lockBoxCodes={lockBoxCodes}
                variant={r.status === "checked_out" ? "checked-out" : "pickup"}
                showActions={<ParkingCardActions reservation={r} />}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tomorrow's Pickups */}
      <div className="space-y-3">
        <SectionHeader title="Picking Up Tomorrow" count={data.tomorrowPickups.length} />
        {data.tomorrowPickups.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500">
            No pickups scheduled for tomorrow.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {data.tomorrowPickups.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                lockBoxCodes={lockBoxCodes}
                variant={r.status === "checked_out" ? "checked-out" : "pickup-tomorrow"}
                showActions={<ParkingCardActions reservation={r} />}
              />
            ))}
          </div>
        )}
      </div>

      {/* Today's Arrivals */}
      <div className="space-y-3">
        <SectionHeader title="Arriving Today" count={data.arrivals.length} />
        {data.arrivals.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500">
            No arrivals scheduled for today.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {data.arrivals.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                lockBoxCodes={lockBoxCodes}
                variant="arrival"
                showActions={<ParkingCardActions reservation={r} />}
              />
            ))}
          </div>
        )}
      </div>

      {/* Currently Parked */}
      <div className="space-y-3">
        <SectionHeader
          title="Currently Parked"
          count={data.currentlyParked.length}
        />
        {data.currentlyParked.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500">
            No vehicles currently parked.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {data.currentlyParked.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                lockBoxCodes={lockBoxCodes}
                variant="parked"
                showActions={<ParkingCardActions reservation={r} />}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
