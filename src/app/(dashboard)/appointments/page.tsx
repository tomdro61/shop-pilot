import Link from "next/link";
import { CalendarCheck, CalendarDays } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { getAppointmentInbox } from "@/lib/actions/appointments";
import { AppointmentCard } from "@/components/appointments/appointment-card";
import { todayET, tomorrowET, isScheduledOnEtDate } from "@/lib/utils";
import type { Database } from "@/types/supabase";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];

export const metadata = { title: "Appointments — ShopPilot" };

export default async function AppointmentsPage() {
  const { pending, confirmed, terminal } = await getAppointmentInbox();

  const today = todayET();
  const tomorrow = tomorrowET();
  const confToday = confirmed.filter((a) =>
    isScheduledOnEtDate(a.scheduled_at, today)
  );
  const confTomorrow = confirmed.filter((a) =>
    isScheduledOnEtDate(a.scheduled_at, tomorrow)
  );
  const confLater = confirmed.filter(
    (a) =>
      !isScheduledOnEtDate(a.scheduled_at, today) &&
      !isScheduledOnEtDate(a.scheduled_at, tomorrow)
  );

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <CalendarCheck className="h-4 w-4" />
          </span>
          <h1 className="text-base font-semibold tracking-tight lg:text-lg">
            Appointments
          </h1>
        </div>
        <Link
          href="/appointments/calendar"
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/50 dark:hover:text-stone-100"
        >
          <CalendarDays className="h-4 w-4" />
          Calendar
        </Link>
      </div>

      <Section title="Pending" count={pending.length}>
        {pending.length === 0 ? (
          <EmptyState message="No pending requests. New online bookings land here." />
        ) : (
          <div className="space-y-3">
            {pending.map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Confirmed" count={confirmed.length}>
        {confirmed.length === 0 ? (
          <EmptyState message="Nothing confirmed yet." />
        ) : (
          <div className="space-y-4">
            <TimeGroup label="Today" items={confToday} />
            <TimeGroup label="Tomorrow" items={confTomorrow} />
            <TimeGroup label="Later" items={confLater} />
          </div>
        )}
      </Section>

      {terminal.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-stone-600 dark:text-stone-400">
            <span>Past 14 days</span>
            <span className="rounded-full bg-stone-200 px-1.5 text-[10px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              {terminal.length}
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            {terminal.map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </div>
        </details>
      )}
    </PageShell>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
          {title}
        </h2>
        <span className="rounded-full bg-stone-200 px-1.5 text-[10px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function TimeGroup({ label, items }: { label: string; items: Appointment[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </p>
      {items.map((a) => (
        <AppointmentCard key={a.id} appointment={a} />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-card p-8 text-center shadow-card dark:border-stone-800">
      <p className="text-sm text-stone-500 dark:text-stone-400">{message}</p>
    </div>
  );
}
