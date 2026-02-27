"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ParkingReservationCardCompact,
} from "@/components/parking/parking-reservation-card";
import { CheckInButton, CheckOutButton } from "@/components/parking/parking-actions";
import { PlaneLanding, PlaneTakeoff, Car, Wrench } from "lucide-react";
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
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent || "bg-stone-100 dark:bg-stone-800"}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-stone-900 dark:text-stone-50">
            {value}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">{label}</p>
        </div>
      </CardContent>
    </Card>
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
      <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
        {title}
      </h2>
      <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-500 dark:text-stone-400">
        {count}
      </span>
    </div>
  );
}

export function ParkingTodayView({ data }: { data: DashboardData }) {
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
          label="Currently Parked"
          value={data.currentlyParked.length}
          icon={Car}
          accent="bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400"
        />
        <KPICard
          label="Service Leads"
          value={data.serviceLeads.length}
          icon={Wrench}
          accent="bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400"
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
          <div className="space-y-2">
            {data.pickups.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                variant="pickup"
                showActions={<CheckOutButton id={r.id} size="sm" />}
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
          <div className="space-y-2">
            {data.tomorrowPickups.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                variant="pickup"
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
          <div className="space-y-2">
            {data.arrivals.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                variant="arrival"
                showActions={
                  r.status === "reserved" ? (
                    <CheckInButton id={r.id} size="sm" />
                  ) : undefined
                }
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
          <div className="space-y-2">
            {data.currentlyParked.map((r) => (
              <ParkingReservationCardCompact
                key={r.id}
                reservation={r}
                variant="parked"
                showActions={<CheckOutButton id={r.id} size="sm" />}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
