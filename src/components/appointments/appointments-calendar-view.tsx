"use client";

// Read-only month/week calendar of CONFIRMED appointments. Mirrors the structure
// of JobsCalendarView (date-fns grid, month/week toggle) but is its own component
// — JobsCalendarView is hard-typed to JobRow and hard-links to /jobs/[id], so per
// the plan ("reuse the pattern, no refactor") this is a parallel view.

import { useState } from "react";
import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  format,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatTimeEt } from "@/lib/utils";
import { serviceLabel, vehicleLabel } from "@/lib/appointments/display";

type AppointmentRow = {
  id: string;
  scheduled_at: string | null;
  snapshot_customer_name: string;
  service_category: string;
  snapshot_vehicle_year: number | null;
  snapshot_vehicle_make: string | null;
  snapshot_vehicle_model: string | null;
};

interface AppointmentsCalendarViewProps {
  appointments: AppointmentRow[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_MAX_VISIBLE = 2;

type CalendarMode = "month" | "week";

export function AppointmentsCalendarView({
  appointments,
}: AppointmentsCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [mode, setMode] = useState<CalendarMode>("month");

  let days: Date[];
  let headerLabel: string;

  if (mode === "week") {
    const weekStart = startOfWeek(currentDate);
    const weekEnd = endOfWeek(currentDate);
    days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const startMonth = format(weekStart, "MMM d");
    const endFormatted =
      weekStart.getMonth() === weekEnd.getMonth()
        ? format(weekEnd, "d, yyyy")
        : format(weekEnd, "MMM d, yyyy");
    headerLabel = `${startMonth} – ${endFormatted}`;
  } else {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    days = eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
    headerLabel = format(currentDate, "MMMM yyyy");
  }

  function navigateBack() {
    setCurrentDate((d) => (mode === "week" ? subWeeks(d, 1) : subMonths(d, 1)));
  }

  function navigateForward() {
    setCurrentDate((d) => (mode === "week" ? addWeeks(d, 1) : addMonths(d, 1)));
  }

  // Bucket by calendar day using the SAME representation the grid keys cells with
  // (date-fns `format(day)`, browser-local) so the two sides always match. The
  // shop and manager are in ET, so "local" is ET — the same browser-is-ET
  // assumption the jobs calendar makes. (A naive UTC `scheduled_at.split("T")[0]`
  // would mis-bucket an evening appointment whose UTC instant already rolled past
  // midnight; `new Date(...)` + `format` converts to local first, avoiding that.)
  const byDate = new Map<string, AppointmentRow[]>();
  for (const appt of appointments) {
    if (!appt.scheduled_at) continue;
    const key = format(new Date(appt.scheduled_at), "yyyy-MM-dd");
    const existing = byDate.get(key);
    if (existing) existing.push(appt);
    else byDate.set(key, [appt]);
  }

  return (
    <div>
      {/* Navigation header */}
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={navigateBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            {headerLabel}
          </h3>
          <div className="flex gap-1 rounded-md border border-stone-200 dark:border-stone-800 bg-card p-1 text-xs">
            <button
              aria-pressed={mode === "month"}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                mode === "month"
                  ? "bg-stone-100 text-stone-900 shadow-card dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
              onClick={() => setMode("month")}
            >
              Month
            </button>
            <button
              aria-pressed={mode === "week"}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                mode === "week"
                  ? "bg-stone-100 text-stone-900 shadow-card dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
              onClick={() => setMode("week")}
            >
              Week
            </button>
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={navigateForward}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="border-b border-r border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400"
          >
            {day}
          </div>
        ))}

        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayAppointments = byDate.get(dateKey) || [];
          const inMonth = mode === "week" || isSameMonth(day, currentDate);
          const today = isToday(day);
          const maxVisible =
            mode === "week" ? dayAppointments.length : MONTH_MAX_VISIBLE;
          const overflow = dayAppointments.length - maxVisible;

          return (
            <div
              key={dateKey}
              className={`border-b border-r border-stone-200 dark:border-stone-800 p-1 ${
                mode === "week" ? "min-h-[160px]" : "min-h-[80px] sm:min-h-[100px]"
              } ${
                !inMonth
                  ? "bg-stone-100/50 dark:bg-stone-950/50"
                  : "bg-white dark:bg-stone-950"
              }`}
            >
              <div className="mb-0.5 flex justify-end">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                    today
                      ? "bg-blue-600 text-white"
                      : !inMonth
                        ? "text-stone-300 dark:text-stone-700"
                        : "text-stone-600 dark:text-stone-400"
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>

              <div className="space-y-0.5">
                {dayAppointments.slice(0, maxVisible).map((appt) => (
                  <CalendarAppointmentEntry
                    key={appt.id}
                    appt={appt}
                    expanded={mode === "week"}
                  />
                ))}
                {overflow > 0 && (
                  <p className="text-[10px] font-medium text-stone-400 dark:text-stone-500 pl-1">
                    +{overflow} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarAppointmentEntry({
  appt,
  expanded,
}: {
  appt: AppointmentRow;
  expanded?: boolean;
}) {
  const time = appt.scheduled_at ? formatTimeEt(appt.scheduled_at) : null;
  const vehicle = vehicleLabel(
    appt.snapshot_vehicle_year,
    appt.snapshot_vehicle_make,
    appt.snapshot_vehicle_model
  );

  return (
    <Link
      href={`/appointments/${appt.id}`}
      className="group flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
    >
      {/* All entries here are confirmed, so the dot is a single accent color. */}
      <span className="h-1.5 w-1.5 shrink-0 rounded-md bg-blue-500" />
      {time && (
        <span className="shrink-0 font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-300">
          {time}
        </span>
      )}
      <span className="truncate font-medium text-stone-700 dark:text-stone-300">
        {appt.snapshot_customer_name}
      </span>
      {vehicle && (
        <span
          className={`truncate text-stone-400 dark:text-stone-500 ${expanded ? "inline" : "hidden sm:inline"}`}
        >
          {vehicle}
        </span>
      )}
      {expanded && (
        <span className="hidden truncate text-stone-400 dark:text-stone-500 sm:inline">
          · {serviceLabel(appt.service_category)}
        </span>
      )}
    </Link>
  );
}
