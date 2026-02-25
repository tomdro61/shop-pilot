"use client";

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
import { formatVehicle } from "@/lib/utils/format";

type JobRow = {
  id: string;
  status: string;
  title?: string | null;
  category: string | null;
  ro_number?: number | null;
  date_received: string;
  notes: string | null;
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  vehicles: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;
  users?: { id: string; name: string } | null;
};

interface JobsCalendarViewProps {
  jobs: JobRow[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_MAX_VISIBLE = 2;

type CalendarMode = "month" | "week";

export function JobsCalendarView({ jobs }: JobsCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [mode, setMode] = useState<CalendarMode>("month");

  // Compute days based on mode
  let days: Date[];
  let headerLabel: string;

  if (mode === "week") {
    const weekStart = startOfWeek(currentDate);
    const weekEnd = endOfWeek(currentDate);
    days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    // Show range like "Feb 23 – Mar 1, 2026"
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

  // Group jobs by date string (YYYY-MM-DD)
  const jobsByDate = new Map<string, JobRow[]>();
  for (const job of jobs) {
    const dateKey = job.date_received.split("T")[0];
    const existing = jobsByDate.get(dateKey);
    if (existing) {
      existing.push(job);
    } else {
      jobsByDate.set(dateKey, [job]);
    }
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
          <div className="flex rounded-md border border-stone-200 dark:border-stone-700 overflow-hidden text-xs">
            <button
              className={`px-2.5 py-1 transition-colors ${
                mode === "month"
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-white text-stone-600 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
              onClick={() => setMode("month")}
            >
              Month
            </button>
            <button
              className={`px-2.5 py-1 transition-colors ${
                mode === "week"
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-white text-stone-600 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"
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
        {/* Weekday headers */}
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400"
          >
            {day}
          </div>
        ))}

        {/* Day cells */}
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayJobs = jobsByDate.get(dateKey) || [];
          const inMonth = mode === "week" || isSameMonth(day, currentDate);
          const today = isToday(day);
          const maxVisible = mode === "week" ? Infinity : MONTH_MAX_VISIBLE;
          const overflow = dayJobs.length - maxVisible;

          return (
            <div
              key={dateKey}
              className={`border-b border-r border-stone-200 dark:border-stone-800 p-1 ${
                mode === "week" ? "min-h-[160px]" : "min-h-[80px] sm:min-h-[100px]"
              } ${
                !inMonth
                  ? "bg-stone-50/50 dark:bg-stone-950/50"
                  : "bg-white dark:bg-stone-950"
              }`}
            >
              {/* Date number */}
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

              {/* Job entries */}
              <div className="space-y-0.5">
                {dayJobs.slice(0, maxVisible).map((job) => (
                  <CalendarJobEntry key={job.id} job={job} expanded={mode === "week"} />
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

const STATUS_DOT_COLORS: Record<string, string> = {
  not_started: "bg-red-500",
  waiting_for_parts: "bg-amber-500",
  in_progress: "bg-blue-500",
  complete: "bg-green-500",
};

function CalendarJobEntry({ job, expanded }: { job: JobRow; expanded?: boolean }) {
  const customerName = job.customers
    ? job.customers.last_name
    : "Unknown";
  const vehicle = job.vehicles ? formatVehicle(job.vehicles) : null;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_COLORS[job.status] ?? "bg-stone-400"}`}
      />
      <span className="truncate font-medium text-stone-700 dark:text-stone-300">
        {customerName}
      </span>
      {vehicle && (
        <span className={`truncate text-stone-400 dark:text-stone-500 ${expanded ? "inline" : "hidden sm:inline"}`}>
          {vehicle}
        </span>
      )}
      {expanded && job.title && (
        <span className="hidden truncate text-stone-400 dark:text-stone-500 sm:inline">
          · {job.title}
        </span>
      )}
    </Link>
  );
}
