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
  isSameDay,
  isToday,
  addMonths,
  subMonths,
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
const MAX_VISIBLE = 2;

export function JobsCalendarView({ jobs }: JobsCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

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
      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
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
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const overflow = dayJobs.length - MAX_VISIBLE;

          return (
            <div
              key={dateKey}
              className={`border-b border-r border-stone-200 dark:border-stone-800 min-h-[80px] sm:min-h-[100px] p-1 ${
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
                {dayJobs.slice(0, MAX_VISIBLE).map((job) => (
                  <CalendarJobEntry key={job.id} job={job} />
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

function CalendarJobEntry({ job }: { job: JobRow }) {
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
        <span className="hidden truncate text-stone-400 dark:text-stone-500 sm:inline">
          {vehicle}
        </span>
      )}
    </Link>
  );
}
