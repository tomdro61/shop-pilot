"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PARKING_SERVICE_LABELS, PARKING_STATUS_LABELS, PARKING_STATUS_COLORS } from "@/lib/constants";
import { Phone, Mail, Car, Calendar } from "lucide-react";
import type { ParkingReservation } from "@/types";

const SERVICE_COLORS: Record<string, { bg: string; text: string }> = {
  oil_change: { bg: "bg-amber-100 dark:bg-amber-900", text: "text-amber-700 dark:text-amber-300" },
  detailing: { bg: "bg-violet-100 dark:bg-violet-900", text: "text-violet-700 dark:text-violet-300" },
  brakes: { bg: "bg-red-100 dark:bg-red-900", text: "text-red-700 dark:text-red-300" },
  tire_replacement: { bg: "bg-stone-200 dark:bg-stone-700", text: "text-stone-700 dark:text-stone-300" },
  wipers: { bg: "bg-blue-100 dark:bg-blue-900", text: "text-blue-700 dark:text-blue-300" },
};

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ParkingServiceLeads({
  reservations,
}: {
  reservations: ParkingReservation[];
}) {
  if (reservations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          No active reservations with service requests.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {reservations.length} customer{reservations.length !== 1 ? "s" : ""} interested in services — these are potential repair customers with cars already on-site.
      </p>

      <div className="space-y-3">
        {reservations.map((r) => {
          const statusColors = PARKING_STATUS_COLORS[r.status];

          return (
            <Link key={r.id} href={`/parking/${r.id}`}>
              <Card className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Name + Status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                          {r.first_name} {r.last_name}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`${statusColors.bg} ${statusColors.text} border-0 text-[11px]`}
                        >
                          {PARKING_STATUS_LABELS[r.status]}
                        </Badge>
                      </div>

                      {/* Services — prominent */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.services_interested.map((service) => {
                          const colors = SERVICE_COLORS[service] || SERVICE_COLORS.wipers;
                          return (
                            <Badge
                              key={service}
                              variant="secondary"
                              className={`${colors.bg} ${colors.text} border-0 text-xs font-medium`}
                            >
                              {PARKING_SERVICE_LABELS[service] || service}
                            </Badge>
                          );
                        })}
                      </div>

                      {/* Contact */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {r.phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {r.email}
                        </span>
                      </div>

                      {/* Vehicle + dates */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                        <span className="flex items-center gap-1">
                          <Car className="h-3 w-3" />
                          {r.make} {r.model} · {r.license_plate}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(r.drop_off_date)} → {formatDate(r.pick_up_date)}
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                        {r.lot}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
