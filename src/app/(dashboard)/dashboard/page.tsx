import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Wallet,
  ClipboardCheck,
  LayoutGrid,
} from "lucide-react";
import { INSPECTION_RATE_STATE, INSPECTION_RATE_TNC, MANAGED_PARKING_LOTS } from "@/lib/constants";
import { formatCurrencyWhole } from "@/lib/utils/format";
import { todayET, nowET, isScheduledOnEtDate } from "@/lib/utils";
import { sumJobRevenue, sumManualIncome } from "@/lib/utils/revenue";
import { resolveDateRange } from "@/lib/utils/date-range";
import { hasPendingService } from "@/lib/utils/parking";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { KpiCompactCard } from "@/components/dashboard/kpi-compact-card";
import { ActionCenter } from "@/components/dashboard/action-center";
import { ParkingTodayCard } from "@/components/dashboard/parking-today-card";
import { ScheduledTodayCard } from "@/components/dashboard/scheduled-today-card";
import { AppointmentsTodayCard } from "@/components/dashboard/appointments-today-card";
import { ShopFloorColumn } from "@/components/dashboard/shop-floor-column";
import { getOpenTasks } from "@/lib/actions/tasks";

export const metadata = {
  title: "Dashboard | ShopPilot",
};

async function getDashboardData() {
  const supabase = await createClient();
  const today = todayET();

  const week = resolveDateRange("this_week");
  const month = resolveDateRange("this_month");
  const weekStart = week.from;
  const weekEnd = week.to;
  const lastWeekStart = week.priorFrom!;
  const lastWeekEnd = week.priorTo!;
  const monthStart = month.from;
  const monthEnd = month.to;
  const lastMonthStart = month.priorFrom!;
  const lastMonthEnd = month.priorTo!;
  const yearStart = `${nowET().getFullYear()}-01-01`;
  const inspectionRangeStart = [yearStart, lastWeekStart, lastMonthStart, monthStart].sort()[0];

  const [
    activeJobsResult,
    inspectionRangeResult,
    newQuoteRequestsResult,
    unpaidJobsResult,
    pendingEstimatesResult,
    parkingLeadsResult,
    parkingTodayResult,
    parkingSpecialsResult,
    manualIncomeRangeResult,
    completedJobsRangeResult,
    completedTodayResult,
    pendingAppointmentsResult,
    confirmedAppointmentsResult,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, ro_number, status, title, assigned_tech, date_received, scheduled_at, users!jobs_assigned_tech_fkey(name), customers(id, first_name, last_name), vehicles(year, make, model), job_line_items(total)"
      )
      .in("status", ["not_started", "in_progress", "waiting_for_parts"]),
    supabase
      .from("daily_inspection_counts")
      .select("date, state_count, tnc_count")
      .gte("date", inspectionRangeStart)
      .lte("date", monthEnd),
    supabase
      .from("quote_requests")
      .select(
        "id, first_name, last_name, vehicle_year, vehicle_make, vehicle_model, services, created_at"
      )
      .eq("status", "new")
      .order("created_at", { ascending: true }),
    supabase
      .from("jobs")
      .select(
        "id, title, date_finished, customers(id, first_name, last_name), vehicles(year, make, model), job_line_items(total)"
      )
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived")
      .order("date_finished", { ascending: true, nullsFirst: false }),
    supabase
      .from("estimates")
      .select(
        "id, sent_at, jobs(id, title, customers(id, first_name, last_name), vehicles(year, make, model)), estimate_line_items(total)"
      )
      .eq("status", "sent")
      .order("sent_at", { ascending: true }),
    supabase
      .from("parking_reservations")
      .select(
        "id, first_name, last_name, customer_id, make, model, services_interested, services_completed, drop_off_date"
      )
      .not("services_interested", "eq", "{}")
      .in("status", ["reserved", "checked_in"]),
    supabase
      .from("parking_reservations")
      .select("id, status, drop_off_date, pick_up_date, lock_box_number")
      .or(`drop_off_date.eq.${today},pick_up_date.eq.${today}`)
      .in("lot", MANAGED_PARKING_LOTS),
    supabase
      .from("parking_reservations")
      .select("id")
      .eq("status", "checked_in")
      .eq("lot", "Broadway Motors")
      .is("specials_sent_at", null),
    supabase
      .from("manual_income")
      .select("date, amount, shop_keep_pct")
      .gte("date", inspectionRangeStart)
      .lte("date", monthEnd),
    supabase
      .from("jobs")
      .select("id, date_finished, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", inspectionRangeStart)
      .lte("date_finished", monthEnd),
    supabase
      .from("jobs")
      .select(
        "id, ro_number, status, title, assigned_tech, date_received, scheduled_at, users!jobs_assigned_tech_fkey(name), customers(id, first_name, last_name), vehicles(year, make, model), job_line_items(total)"
      )
      .eq("status", "complete")
      .eq("date_finished", today)
      .order("ro_number", { ascending: false }),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("appointments")
      .select(
        "id, scheduled_at, snapshot_customer_name, service_category, snapshot_vehicle_year, snapshot_vehicle_make, snapshot_vehicle_model"
      )
      .eq("status", "confirmed")
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: true }),
  ]);

  if (activeJobsResult.error)
    throw new Error(`Failed to load active jobs: ${activeJobsResult.error.message}`);
  if (inspectionRangeResult.error)
    throw new Error(`Failed to load inspection counts: ${inspectionRangeResult.error.message}`);
  if (newQuoteRequestsResult.error)
    throw new Error(`Failed to load quote requests: ${newQuoteRequestsResult.error.message}`);
  if (unpaidJobsResult.error)
    throw new Error(`Failed to load unpaid jobs: ${unpaidJobsResult.error.message}`);
  if (pendingEstimatesResult.error)
    throw new Error(`Failed to load pending estimates: ${pendingEstimatesResult.error.message}`);
  if (parkingLeadsResult.error)
    throw new Error(`Failed to load parking leads: ${parkingLeadsResult.error.message}`);
  if (parkingTodayResult.error)
    throw new Error(`Failed to load parking activity: ${parkingTodayResult.error.message}`);
  if (parkingSpecialsResult.error)
    throw new Error(`Failed to load parking specials: ${parkingSpecialsResult.error.message}`);
  if (manualIncomeRangeResult.error)
    throw new Error(`Failed to load manual income: ${manualIncomeRangeResult.error.message}`);
  if (completedJobsRangeResult.error)
    throw new Error(`Failed to load completed jobs: ${completedJobsRangeResult.error.message}`);
  if (completedTodayResult.error)
    throw new Error(`Failed to load completed-today jobs: ${completedTodayResult.error.message}`);
  if (pendingAppointmentsResult.error)
    throw new Error(`Failed to load pending appointments: ${pendingAppointmentsResult.error.message}`);
  if (confirmedAppointmentsResult.error)
    throw new Error(`Failed to load confirmed appointments: ${confirmedAppointmentsResult.error.message}`);

  const activeJobs = activeJobsResult.data || [];
  const completedJobs = completedJobsRangeResult.data || [];
  const monthCompleted = completedJobs.filter(
    (j) => j.date_finished !== null && j.date_finished >= monthStart && j.date_finished <= monthEnd
  );
  const lastMonthCompleted = completedJobs.filter(
    (j) => j.date_finished !== null && j.date_finished >= lastMonthStart && j.date_finished <= lastMonthEnd
  );
  const lastWeekCompleted = completedJobs.filter(
    (j) => j.date_finished !== null && j.date_finished >= lastWeekStart && j.date_finished <= lastWeekEnd
  );

  const activeJobsWithTotals = activeJobs.map((j) => ({
    ...j,
    total:
      (j.job_line_items as { total: number }[] | null)?.reduce(
        (s, li) => s + (li.total || 0),
        0
      ) ?? 0,
  }));
  const inProgress = activeJobsWithTotals.filter((j) => j.status === "in_progress");
  const waitingForParts = activeJobsWithTotals.filter((j) => j.status === "waiting_for_parts");
  const notStarted = activeJobsWithTotals.filter((j) => j.status === "not_started");
  const unassignedJobsCount = activeJobsWithTotals.filter((j) => !j.assigned_tech).length;

  const completedTodayWithTotals = (completedTodayResult.data ?? []).map((j) => ({
    ...j,
    total:
      (j.job_line_items as { total: number }[] | null)?.reduce(
        (s, li) => s + (li.total || 0),
        0
      ) ?? 0,
  }));

  const inspectionRows = inspectionRangeResult.data || [];
  function sumInspectionRev(rows: typeof inspectionRows) {
    return rows.reduce(
      (sum, r) =>
        sum +
        (r.state_count || 0) * INSPECTION_RATE_STATE +
        (r.tnc_count || 0) * INSPECTION_RATE_TNC,
      0
    );
  }
  const sumStateCounts = (rows: typeof inspectionRows) =>
    rows.reduce((s, r) => s + (r.state_count || 0), 0);
  const sumTncCounts = (rows: typeof inspectionRows) =>
    rows.reduce((s, r) => s + (r.tnc_count || 0), 0);

  const inspToday = inspectionRows.filter((r) => r.date === today);
  const inspWeek = inspectionRows.filter((r) => r.date >= weekStart && r.date <= weekEnd);
  const inspMonth = inspectionRows.filter((r) => r.date >= monthStart && r.date <= monthEnd);
  const inspLastWeek = inspectionRows.filter((r) => r.date >= lastWeekStart && r.date <= lastWeekEnd);
  const inspLastMonth = inspectionRows.filter((r) => r.date >= lastMonthStart && r.date <= lastMonthEnd);

  const manualIncomeRows = manualIncomeRangeResult.data || [];
  const manualIncomeToday = manualIncomeRows.filter((e) => e.date === today);
  const manualIncomeWeek = manualIncomeRows.filter((e) => e.date >= weekStart && e.date <= weekEnd);
  const manualIncomeMonth = manualIncomeRows.filter((e) => e.date >= monthStart && e.date <= monthEnd);
  const manualIncomeLastWeek = manualIncomeRows.filter(
    (e) => e.date >= lastWeekStart && e.date <= lastWeekEnd
  );
  const manualIncomeLastMonth = manualIncomeRows.filter(
    (e) => e.date >= lastMonthStart && e.date <= lastMonthEnd
  );

  const todayCompleted = completedJobs.filter((j) => j.date_finished === today);
  const weekCompleted = completedJobs.filter(
    (j) => j.date_finished !== null && j.date_finished >= weekStart && j.date_finished <= weekEnd
  );

  const unpaidJobs = (unpaidJobsResult.data || []).map((j) => ({
    ...j,
    total:
      (j.job_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0,
  }));
  const pendingEstimates = (pendingEstimatesResult.data || []).map((e) => ({
    ...e,
    total:
      (e.estimate_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) ||
      0,
  }));

  const parkingToday = parkingTodayResult.data || [];
  const dropOffsToday = parkingToday.filter(
    (r) => r.drop_off_date === today && r.status === "reserved"
  ).length;
  // Pickups today = anyone whose pickup date is today and who has at least
  // dropped off. Prepared = either already picked up (checked_out) or key
  // is in a lockbox awaiting self-checkout.
  const pickupsTodayList = parkingToday.filter(
    (r) =>
      r.pick_up_date === today &&
      (r.status === "checked_in" || r.status === "checked_out")
  );
  const pickupsToday = pickupsTodayList.length;
  const pickupsPreparedToday = pickupsTodayList.filter(
    (r) => r.status === "checked_out" || r.lock_box_number != null
  ).length;

  const openParkingLeads = (parkingLeadsResult.data ?? []).filter(hasPendingService);

  // Confirmed online bookings scheduled for today (ET) — shown in Today's View.
  // Filtered in JS like scheduledToday since scheduled_at is a UTC instant.
  const appointmentsToday = (confirmedAppointmentsResult.data ?? []).filter((a) =>
    isScheduledOnEtDate(a.scheduled_at, today)
  );

  return {
    appointmentsToday,
    stats: {
      todayRevenue:
        sumJobRevenue(todayCompleted) + sumInspectionRev(inspToday) + sumManualIncome(manualIncomeToday),
      weeklyRevenue:
        sumJobRevenue(weekCompleted) + sumInspectionRev(inspWeek) + sumManualIncome(manualIncomeWeek),
      lastWeekRevenue:
        sumJobRevenue(lastWeekCompleted) +
        sumInspectionRev(inspLastWeek) +
        sumManualIncome(manualIncomeLastWeek),
      monthlyRevenue:
        sumJobRevenue(monthCompleted) + sumInspectionRev(inspMonth) + sumManualIncome(manualIncomeMonth),
      lastMonthRevenue:
        sumJobRevenue(lastMonthCompleted) +
        sumInspectionRev(inspLastMonth) +
        sumManualIncome(manualIncomeLastMonth),
      unpaidJobCount: unpaidJobs.length,
    },
    ops: {
      stateToday: sumStateCounts(inspToday),
      stateWeek: sumStateCounts(inspWeek),
      stateMonth: sumStateCounts(inspMonth),
      tncToday: sumTncCounts(inspToday),
      tncWeek: sumTncCounts(inspWeek),
      tncMonth: sumTncCounts(inspMonth),
      jobsClosedToday: todayCompleted.length,
      jobsClosedWeek: weekCompleted.length,
      jobsClosedMonth: monthCompleted.length,
    },
    shopFloor: { notStarted, waitingForParts, inProgress, completedToday: completedTodayWithTotals },
    parking: { dropOffsToday, pickupsToday, pickupsPreparedToday },
    needsAttention: {
      unassignedJobs: unassignedJobsCount,
      quoteRequests: (newQuoteRequestsResult.data ?? []).length,
      pendingAppointments: pendingAppointmentsResult.count ?? 0,
      pendingEstimates: (pendingEstimatesResult.data ?? []).length,
      parkingLeads: openParkingLeads.length,
      awaitingPayments: unpaidJobs.length,
      parkingSpecials: (parkingSpecialsResult.data ?? []).length,
    },
  };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function getGreeting(): string {
  const hour = nowET().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const [user, data, tasks] = await Promise.all([
    getCurrentUser(),
    getDashboardData(),
    getOpenTasks(),
  ]);
  const today = todayET();

  const firstName = user?.name?.split(" ")[0] ?? null;
  const greeting = firstName ? `${getGreeting()}, ${firstName}` : getGreeting();

  const { stats, ops, shopFloor, parking, needsAttention, appointmentsToday } = data;
  // Derive Scheduled Today from the already-fetched active jobs to avoid a
  // second Supabase round-trip. The ET-date comparison lives in
  // isScheduledOnEtDate so the timezone handling is testable in isolation.
  const scheduledToday = [
    ...shopFloor.notStarted,
    ...shopFloor.waitingForParts,
    ...shopFloor.inProgress,
  ]
    .filter((j) => isScheduledOnEtDate(j.scheduled_at, today))
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1));
  const weekChange = pctChange(stats.weeklyRevenue, stats.lastWeekRevenue);
  const monthChange = pctChange(stats.monthlyRevenue, stats.lastMonthRevenue);

  const todayLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <DashboardShell
      greeting={greeting}
      statusLine={<span>{todayLabel}</span>}
      actions={
        <>
          <Link href="/jobs/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Job
            </Button>
          </Link>
          <Link href="/quick-pay">
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              <Wallet className="mr-1.5 h-3.5 w-3.5" />
              Quick Pay
            </Button>
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-6 min-w-0">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <KpiCard
                title="Today's Revenue"
                value={formatCurrencyWhole(stats.todayRevenue)}
                subtitle={ops.jobsClosedToday > 0 ? `${ops.jobsClosedToday} closed today` : "no jobs closed yet"}
              />
              <KpiCard
                title="This Week"
                value={formatCurrencyWhole(stats.weeklyRevenue)}
                changePercent={weekChange}
                changeLabel="vs last week"
              />
              <KpiCard
                title="This Month"
                value={formatCurrencyWhole(stats.monthlyRevenue)}
                changePercent={monthChange}
                changeLabel="vs last month"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <KpiCompactCard
                label="State Inspections"
                icon={ClipboardCheck}
                tone="stone"
                today={ops.stateToday}
                todaySub={formatCurrencyWhole(ops.stateToday * INSPECTION_RATE_STATE)}
                week={ops.stateWeek}
                weekSub={formatCurrencyWhole(ops.stateWeek * INSPECTION_RATE_STATE)}
                month={ops.stateMonth}
                monthSub={formatCurrencyWhole(ops.stateMonth * INSPECTION_RATE_STATE)}
              />
              <KpiCompactCard
                label="TNC Inspections"
                icon={ClipboardCheck}
                tone="stone"
                today={ops.tncToday}
                todaySub={formatCurrencyWhole(ops.tncToday * INSPECTION_RATE_TNC)}
                week={ops.tncWeek}
                weekSub={formatCurrencyWhole(ops.tncWeek * INSPECTION_RATE_TNC)}
                month={ops.tncMonth}
                monthSub={formatCurrencyWhole(ops.tncMonth * INSPECTION_RATE_TNC)}
              />
            </div>
          </div>

          <ActionCenter
            tasks={tasks}
            needsAttention={needsAttention}
          />
        </div>

        <aside className="space-y-3 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-md grid place-items-center border bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800 flex-none">
              <LayoutGrid className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Today&apos;s View
            </h2>
          </div>

          <ParkingTodayCard today={today} parking={parking} />

          <ScheduledTodayCard jobs={scheduledToday} />

          <AppointmentsTodayCard appointments={appointmentsToday} />

          <div className="space-y-2">
            <ShopFloorColumn status="not_started" jobs={shopFloor.notStarted} today={today} />
            <ShopFloorColumn status="waiting_for_parts" jobs={shopFloor.waitingForParts} today={today} />
            <ShopFloorColumn status="in_progress" jobs={shopFloor.inProgress} today={today} />
            <ShopFloorColumn status="complete" jobs={shopFloor.completedToday} today={today} />
          </div>
        </aside>
      </div>
    </DashboardShell>
  );
}
