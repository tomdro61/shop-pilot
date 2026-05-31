import Link from "next/link";
import { ChevronLeft, CalendarDays } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { getConfirmedAppointments } from "@/lib/actions/appointments";
import { AppointmentsCalendarView } from "@/components/appointments/appointments-calendar-view";

export const metadata = { title: "Appointments Calendar — ShopPilot" };

export default async function AppointmentsCalendarPage() {
  const appointments = await getConfirmedAppointments();

  return (
    <PageShell width="wide">
      <Link
        href="/appointments"
        className="inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        <ChevronLeft className="h-4 w-4" />
        Appointments
      </Link>

      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <CalendarDays className="h-4 w-4" />
        </span>
        <h1 className="text-base font-semibold tracking-tight lg:text-lg">
          Confirmed calendar
        </h1>
      </div>

      <div className="rounded-md border border-stone-200 bg-card p-4 shadow-card dark:border-stone-800">
        {appointments.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500 dark:text-stone-400">
            No confirmed appointments yet. Confirm a booking from the inbox and
            it&apos;ll show up here.
          </p>
        ) : (
          <AppointmentsCalendarView appointments={appointments} />
        )}
      </div>
    </PageShell>
  );
}
