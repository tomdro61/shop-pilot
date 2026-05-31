import Link from "next/link";
import { Clock } from "lucide-react";
import { formatTimeEt } from "@/lib/utils";
import { serviceLabel, vehicleLabel } from "@/lib/appointments/display";

// Confirmed online bookings scheduled for today (pre-conversion — once the car
// arrives and the manager converts it, it leaves this list and shows as a job).
type TodayAppointment = {
  id: string;
  scheduled_at: string | null;
  snapshot_customer_name: string;
  service_category: string;
  snapshot_vehicle_year: number | null;
  snapshot_vehicle_make: string | null;
  snapshot_vehicle_model: string | null;
};

export function AppointmentsTodayCard({
  appointments,
}: {
  appointments: TodayAppointment[];
}) {
  if (appointments.length === 0) return null;

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Booked · Today
        </span>
        <span className="font-mono tabular-nums text-[11px] font-semibold text-stone-500 dark:text-stone-400">
          {appointments.length}
        </span>
      </div>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {appointments.map((a) => {
          const time = a.scheduled_at ? formatTimeEt(a.scheduled_at) : "";
          const v = vehicleLabel(
            a.snapshot_vehicle_year,
            a.snapshot_vehicle_make,
            a.snapshot_vehicle_model
          );
          return (
            <li key={a.id}>
              <Link
                href={`/appointments/${a.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50 min-w-[5.5rem]">
                  <Clock className="h-3.5 w-3.5 text-stone-400" aria-hidden />
                  {time}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                    {a.snapshot_customer_name}
                    {v ? (
                      <span className="text-stone-500 dark:text-stone-400 font-normal">
                        {" · "}
                        {v}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-stone-500 dark:text-stone-400 truncate">
                    {serviceLabel(a.service_category)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
