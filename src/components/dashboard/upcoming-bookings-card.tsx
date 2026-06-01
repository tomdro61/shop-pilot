import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { formatTimeEt } from "@/lib/utils";
import {
  formatEtDate,
  serviceLabel,
  vehicleLabel,
} from "@/lib/appointments/display";

// Confirmed bookings from today forward — so what's on the books stays visible
// at a glance (the "Booked · Today" card is today-only; this is the runway). The
// full schedule lives on the calendar.
type UpcomingBooking = {
  id: string;
  scheduled_at: string | null;
  snapshot_customer_name: string;
  service_category: string;
  snapshot_vehicle_year: number | null;
  snapshot_vehicle_make: string | null;
  snapshot_vehicle_model: string | null;
};

const VISIBLE = 6;

export function UpcomingBookingsCard({
  bookings,
}: {
  bookings: UpcomingBooking[];
}) {
  const visible = bookings.slice(0, VISIBLE);
  const overflow = bookings.length - visible.length;

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <header className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-md grid place-items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
            <CalendarDays className="h-4 w-4" />
          </span>
          <h3 className="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Upcoming Bookings
          </h3>
          {bookings.length > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
              {bookings.length}
            </span>
          )}
        </div>
        <Link
          href="/appointments/calendar"
          className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 flex-none"
        >
          Full calendar →
        </Link>
      </header>

      {bookings.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
          No upcoming bookings. Confirmed appointments show here.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {visible.map((b) => {
            const date = b.scheduled_at ? formatEtDate(b.scheduled_at) : "";
            const time = b.scheduled_at ? formatTimeEt(b.scheduled_at) : "";
            const v = vehicleLabel(
              b.snapshot_vehicle_year,
              b.snapshot_vehicle_make,
              b.snapshot_vehicle_model
            );
            return (
              <li key={b.id}>
                <Link
                  href={`/appointments/${b.id}`}
                  className="group flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <span className="flex flex-col font-mono tabular-nums min-w-[6.5rem] flex-none">
                    <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                      {date}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      {time}
                    </span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                      {b.snapshot_customer_name}
                      {v ? (
                        <span className="text-stone-500 dark:text-stone-400 font-normal">
                          {" · "}
                          {v}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-stone-500 dark:text-stone-400 truncate">
                      {serviceLabel(b.service_category)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-stone-400 dark:text-stone-500 group-hover:text-stone-700 dark:group-hover:text-stone-300 transition-colors flex-none" />
                </Link>
              </li>
            );
          })}
          {overflow > 0 && (
            <li>
              <Link
                href="/appointments/calendar"
                className="block px-4 py-2 text-center text-xs font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
              >
                +{overflow} more on the calendar
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
