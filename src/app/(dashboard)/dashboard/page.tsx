import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Wallet,
  Calendar,
  TrendingUp,
  CalendarDays,
  AlertCircle,
  ClipboardCheck,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";
import { INSPECTION_RATE_STATE, INSPECTION_RATE_TNC, MANAGED_PARKING_LOTS } from "@/lib/constants";
import { formatCurrencyWhole } from "@/lib/utils/format";
import { todayET, daysBetween, nowET } from "@/lib/utils";
import { sumJobRevenue, sumManualIncome } from "@/lib/utils/revenue";
import { resolveDateRange } from "@/lib/utils/date-range";
import { hasPendingService } from "@/lib/utils/parking";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { KpiCompactCard } from "@/components/dashboard/kpi-compact-card";
import { ActionCenter } from "@/components/dashboard/action-center";
import { SectionHeader } from "@/components/dashboard/section-header";
import { ShopFloorColumn } from "@/components/dashboard/shop-floor-column";
import { buildOpenLoops, countOverdue } from "@/lib/dashboard/open-loops";
import { getOpenTasks } from "@/lib/actions/tasks";

export const metadata = {
  title: "Dashboard | ShopPilot",
};

const PARTS_AGED_THRESHOLD_DAYS = 3;

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
  const inspectionRangeStart = [lastWeekStart, lastMonthStart, monthStart].sort()[0];

  // Using date_received as a proxy for "time spent in waiting_for_parts"
  // until status_changed_at is tracked. T12:00:00 anchor avoids DST-edge drift.
  const partsAgedCutoff = new Date(today + "T12:00:00");
  partsAgedCutoff.setDate(partsAgedCutoff.getDate() - PARTS_AGED_THRESHOLD_DAYS);
  const partsAgedCutoffDate = partsAgedCutoff.toISOString().split("T")[0];

  const [
    activeJobsResult,
    monthCompletedResult,
    lastWeekCompletedResult,
    lastMonthCompletedResult,
    inspectionRangeResult,
    newQuoteRequestsResult,
    unpaidJobsResult,
    pendingEstimatesResult,
    readyDvisResult,
    parkingLeadsResult,
    parkingTodayResult,
    agedWaitingForPartsResult,
    manualIncomeRangeResult,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, ro_number, status, title, assigned_tech, date_received, users!jobs_assigned_tech_fkey(name), customers(id, first_name, last_name), vehicles(year, make, model), job_line_items(total)"
      )
      .in("status", ["not_started", "in_progress", "waiting_for_parts"]),
    supabase
      .from("jobs")
      .select("id, date_finished, payment_status, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", monthStart)
      .lte("date_finished", monthEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", lastWeekStart)
      .lte("date_finished", lastWeekEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", lastMonthStart)
      .lte("date_finished", lastMonthEnd),
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
      .from("dvi_inspections")
      .select(
        "id, completed_at, jobs(id, customers(id, first_name, last_name), vehicles(year, make, model))"
      )
      .eq("status", "completed")
      .order("completed_at", { ascending: true }),
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
      .from("jobs")
      .select(
        "id, title, date_received, customers(id, first_name, last_name), vehicles(year, make, model)"
      )
      .eq("status", "waiting_for_parts")
      .lte("date_received", partsAgedCutoffDate)
      .order("date_received", { ascending: true }),
    supabase
      .from("manual_income")
      .select("date, amount, shop_keep_pct")
      .gte("date", inspectionRangeStart)
      .lte("date", monthEnd),
  ]);

  if (activeJobsResult.error)
    throw new Error(`Failed to load active jobs: ${activeJobsResult.error.message}`);
  if (monthCompletedResult.error)
    throw new Error(`Failed to load this month's completed jobs: ${monthCompletedResult.error.message}`);
  if (lastWeekCompletedResult.error)
    throw new Error(`Failed to load last week's completed jobs: ${lastWeekCompletedResult.error.message}`);
  if (lastMonthCompletedResult.error)
    throw new Error(`Failed to load last month's completed jobs: ${lastMonthCompletedResult.error.message}`);
  if (inspectionRangeResult.error)
    throw new Error(`Failed to load inspection counts: ${inspectionRangeResult.error.message}`);
  if (newQuoteRequestsResult.error)
    throw new Error(`Failed to load quote requests: ${newQuoteRequestsResult.error.message}`);
  if (unpaidJobsResult.error)
    throw new Error(`Failed to load unpaid jobs: ${unpaidJobsResult.error.message}`);
  if (pendingEstimatesResult.error)
    throw new Error(`Failed to load pending estimates: ${pendingEstimatesResult.error.message}`);
  if (readyDvisResult.error)
    throw new Error(`Failed to load ready DVIs: ${readyDvisResult.error.message}`);
  if (parkingLeadsResult.error)
    throw new Error(`Failed to load parking leads: ${parkingLeadsResult.error.message}`);
  if (parkingTodayResult.error)
    throw new Error(`Failed to load parking activity: ${parkingTodayResult.error.message}`);
  if (agedWaitingForPartsResult.error)
    throw new Error(`Failed to load aged waiting-for-parts jobs: ${agedWaitingForPartsResult.error.message}`);
  if (manualIncomeRangeResult.error)
    throw new Error(`Failed to load manual income: ${manualIncomeRangeResult.error.message}`);

  const activeJobs = activeJobsResult.data || [];
  const monthCompleted = monthCompletedResult.data || [];

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

  const todayCompleted = monthCompleted.filter((j) => j.date_finished === today);
  const weekCompleted = monthCompleted.filter(
    (j) => j.date_finished !== null && j.date_finished >= weekStart && j.date_finished <= weekEnd
  );

  const unpaidJobs = (unpaidJobsResult.data || []).map((j) => ({
    ...j,
    total:
      (j.job_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0,
  }));
  const totalOutstanding = unpaidJobs.reduce((s, j) => s + j.total, 0);
  const oldestUnpaidDays = unpaidJobs[0]?.date_finished
    ? daysBetween(unpaidJobs[0].date_finished, today)
    : 0;

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

  const openLoops = buildOpenLoops({
    today,
    unpaidJobs,
    pendingEstimates,
    newQuoteRequests: newQuoteRequestsResult.data || [],
    readyDvis: readyDvisResult.data || [],
    parkingLeads: openParkingLeads,
    agedWaitingForParts: agedWaitingForPartsResult.data || [],
  });

  return {
    stats: {
      todayRevenue:
        sumJobRevenue(todayCompleted) + sumInspectionRev(inspToday) + sumManualIncome(manualIncomeToday),
      weeklyRevenue:
        sumJobRevenue(weekCompleted) + sumInspectionRev(inspWeek) + sumManualIncome(manualIncomeWeek),
      lastWeekRevenue:
        sumJobRevenue(lastWeekCompletedResult.data || []) +
        sumInspectionRev(inspLastWeek) +
        sumManualIncome(manualIncomeLastWeek),
      monthlyRevenue:
        sumJobRevenue(monthCompleted) + sumInspectionRev(inspMonth) + sumManualIncome(manualIncomeMonth),
      lastMonthRevenue:
        sumJobRevenue(lastMonthCompletedResult.data || []) +
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
    shopFloor: { notStarted, waitingForParts, inProgress },
    parking: { dropOffsToday, pickupsToday, pickupsPreparedToday },
    awaitingPayment: { count: unpaidJobs.length, total: totalOutstanding, oldestDays: oldestUnpaidDays },
    needsAttention: {
      unassignedJobs: unassignedJobsCount,
      quoteRequests: (newQuoteRequestsResult.data ?? []).length,
      pendingEstimates: (pendingEstimatesResult.data ?? []).length,
      readyDvis: (readyDvisResult.data ?? []).length,
      parkingLeads: openParkingLeads.length,
      agedParts: (agedWaitingForPartsResult.data ?? []).length,
    },
    openLoops,
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

  const { stats, ops, shopFloor, parking, awaitingPayment, needsAttention, openLoops } = data;
  const weekChange = pctChange(stats.weeklyRevenue, stats.lastWeekRevenue);
  const monthChange = pctChange(stats.monthlyRevenue, stats.lastMonthRevenue);

  const totalJobs = shopFloor.notStarted.length + shopFloor.waitingForParts.length + shopFloor.inProgress.length;
  const overdueLoops = countOverdue(openLoops);

  const statusLineParts: string[] = [];
  if (totalJobs > 0) statusLineParts.push(`${totalJobs} on the floor`);
  if (overdueLoops > 0) statusLineParts.push(`${overdueLoops} loop${overdueLoops === 1 ? "" : "s"} overdue`);

  return (
    <DashboardShell
      greeting={greeting}
      statusLine={statusLineParts.length > 0 ? <span>{statusLineParts.join(" · ")}</span> : null}
      actions={
        <>
          <Link href="/customers/new">
            <Button variant="ghost" size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Customer
            </Button>
          </Link>
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
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              title="Today's Revenue"
              value={formatCurrencyWhole(stats.todayRevenue)}
              icon={Calendar}
              tone="green"
              subtitle={ops.jobsClosedToday > 0 ? `${ops.jobsClosedToday} closed today` : "no jobs closed yet"}
            />
            <KpiCard
              title="This Week"
              value={formatCurrencyWhole(stats.weeklyRevenue)}
              icon={TrendingUp}
              tone="blue"
              changePercent={weekChange}
              changeLabel="vs last week"
            />
            <KpiCard
              title="This Month"
              value={formatCurrencyWhole(stats.monthlyRevenue)}
              icon={CalendarDays}
              tone="indigo"
              changePercent={monthChange}
              changeLabel="vs last month"
            />
            <KpiCard
              title="Outstanding A/R"
              value={formatCurrencyWhole(awaitingPayment.total)}
              icon={AlertCircle}
              tone={awaitingPayment.count > 0 ? "amber" : "stone"}
              subtitle={
                awaitingPayment.count > 0
                  ? `${awaitingPayment.count} unpaid · ${awaitingPayment.oldestDays}d oldest`
                  : "all caught up"
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <KpiCompactCard
              label="Jobs Closed"
              icon={CheckCircle2}
              tone="stone"
              today={ops.jobsClosedToday}
              week={ops.jobsClosedWeek}
              month={ops.jobsClosedMonth}
            />
          </div>
        </div>

        <div className="border-t border-stone-200 dark:border-stone-800 pt-7">
          <ActionCenter
            tasks={tasks}
            parking={parking}
            awaitingPayment={awaitingPayment}
            needsAttention={needsAttention}
          />
        </div>

        <section className="border-t border-stone-200 dark:border-stone-800 pt-7">
          <SectionHeader
            icon={LayoutGrid}
            iconTone="stone"
            title="Shop Floor"
            count={totalJobs}
            actionLabel="View all"
            actionHref="/jobs"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ShopFloorColumn status="not_started" jobs={shopFloor.notStarted} today={today} />
            <ShopFloorColumn status="waiting_for_parts" jobs={shopFloor.waitingForParts} today={today} />
            <ShopFloorColumn status="in_progress" jobs={shopFloor.inProgress} today={today} />
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
