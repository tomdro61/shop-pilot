import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ParkingDayCounts } from "@/lib/actions/parking";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtMonthTitle(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

interface ParkingCalendarViewProps {
  monthStart: Date;
  todayKey: string;
  counts: Record<string, ParkingDayCounts>;
  lot: string;
}

export function ParkingCalendarView({
  monthStart,
  todayKey,
  counts,
  lot,
}: ParkingCalendarViewProps) {
  // Build grid: pad to start on Sunday, fill at least 6 weeks worth so the grid stays consistent
  const firstDow = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstDow);

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const prevMonth = new Date(monthStart);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const baseQuery = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (lot) params.set("lot", lot);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
    }
    return `/parking?${params.toString()}`;
  };

  const monthHref = (d: Date) =>
    baseQuery({ tab: "calendar", month: fmtMonthKey(d) });

  const dayHref = (dateKey: string) =>
    baseQuery({ tab: "all", date: dateKey });

  const monthIdx = monthStart.getMonth();

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
          {fmtMonthTitle(monthStart)}
        </h2>
        <div className="flex items-center gap-1">
          <Link href={monthHref(prevMonth)}>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link href={baseQuery({ tab: "calendar" })}>
            <Button variant="outline" size="sm" className="text-xs">
              Today
            </Button>
          </Link>
          <Link href={monthHref(nextMonth)}>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dateKey = fmtDateKey(d);
          const day = counts[dateKey];
          const drops = day?.dropOffs ?? 0;
          const picks = day?.pickUps ?? 0;
          const total = drops + picks;
          const inMonth = d.getMonth() === monthIdx;
          const isToday = dateKey === todayKey;

          // Heat tint
          let heat = "";
          if (inMonth) {
            if (total >= 10) heat = "bg-red-50 dark:bg-red-950/30";
            else if (total >= 5) heat = "bg-amber-50 dark:bg-amber-950/30";
          }

          const baseCell =
            "relative min-h-[70px] sm:min-h-[88px] border-b border-r border-stone-100 dark:border-stone-800/60 px-1.5 py-1.5 sm:px-2 sm:py-2 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40";

          const cellClass = `${baseCell} ${heat} ${
            inMonth
              ? "text-stone-900 dark:text-stone-50"
              : "bg-stone-50/40 dark:bg-stone-900/20 text-stone-400 dark:text-stone-600"
          }`;

          const content = (
            <>
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-mono tabular-nums ${
                    isToday
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white font-semibold"
                      : inMonth
                        ? "text-stone-700 dark:text-stone-300"
                        : "text-stone-400 dark:text-stone-600"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              {inMonth && total > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {drops > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5">
                      ↓ <span className="font-mono tabular-nums">{drops}</span>
                    </span>
                  )}
                  {picks > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5">
                      ↑ <span className="font-mono tabular-nums">{picks}</span>
                    </span>
                  )}
                </div>
              )}
            </>
          );

          return inMonth && total > 0 ? (
            <Link key={dateKey} href={dayHref(dateKey)} className={`${cellClass} block`}>
              {content}
            </Link>
          ) : (
            <div key={dateKey} className={cellClass}>
              {content}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 border-t border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5">↓</span>
          Drop-offs
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5">↑</span>
          Pick-ups
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900" />
          5+ activity
          <span className="inline-block h-2.5 w-2.5 rounded bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900 ml-2" />
          10+ activity
        </span>
      </div>
    </div>
  );
}
