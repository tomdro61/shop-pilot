import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import {
  Car, DollarSign, Plus,
  UserX, TrendingUp, TrendingDown,
  FileText, Calendar, CheckCircle2,
} from "lucide-react";
import { INSPECTION_RATE_STATE, INSPECTION_RATE_TNC } from "@/lib/constants";
import { formatVehicle, formatCurrency, formatCurrencyWhole } from "@/lib/utils/format";
import { todayET } from "@/lib/utils";
import { sumJobRevenue } from "@/lib/utils/revenue";
import { resolveDateRange } from "@/lib/utils/date-range";
import { ActionCenterCard } from "@/components/dashboard/action-center-card";

export const metadata = {
  title: "Dashboard | ShopPilot",
};

function daysBetween(from: string | null, today: string): number {
  if (!from) return 0;
  const f = new Date(from + "T12:00:00");
  const t = new Date(today + "T12:00:00");
  return Math.max(0, Math.floor((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)));
}

const getDashboardData = unstable_cache(async () => {
  const supabase = createAdminClient();

  const today = todayET();

  // Use the shared date-range utility — same logic as the Reports page
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

  const [
    activeJobsResult,
    monthCompletedResult,
    lastWeekCompletedResult,
    lastMonthCompletedResult,
    inspectionRangeResult,
    newQuoteCountResult,
    unpaidJobsResult,
    pendingEstimatesResult,
    dviReadyResult,
    parkingLeadCountResult,
  ] = await Promise.all([
    // Active jobs — Shop Floor, Tech Workload, Today's Schedule
    supabase
      .from("jobs")
      .select("id, status, title, assigned_tech, date_received, users!jobs_assigned_tech_fkey(name), customers(first_name, last_name), vehicles(year, make, model)")
      .in("status", ["not_started", "in_progress", "waiting_for_parts"]),
    // Month completed — revenue
    supabase
      .from("jobs")
      .select("id, date_finished, payment_status, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", monthStart)
      .lte("date_finished", monthEnd),
    // Last week completed — week-over-week
    supabase
      .from("jobs")
      .select("id, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", lastWeekStart)
      .lte("date_finished", lastWeekEnd),
    // Last month completed — month-over-month
    supabase
      .from("jobs")
      .select("id, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", lastMonthStart)
      .lte("date_finished", lastMonthEnd),
    // Inspection counts
    supabase
      .from("daily_inspection_counts")
      .select("date, state_count, tnc_count")
      .gte("date", inspectionRangeStart)
      .lte("date", monthEnd),
    // New quote requests
    supabase
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    // Unpaid completed jobs
    supabase
      .from("jobs")
      .select("id, title, date_finished, customers(first_name, last_name), vehicles(year, make, model), job_line_items(total)")
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived")
      .order("date_finished", { ascending: true }),
    // Pending estimates (sent, not approved)
    supabase
      .from("estimates")
      .select("id, sent_at, jobs(id, title, customers(first_name, last_name), vehicles(year, make, model)), estimate_line_items(total)")
      .eq("status", "sent")
      .order("sent_at", { ascending: true }),
    // DVIs completed but not yet sent to customer
    supabase
      .from("dvi_inspections")
      .select("id, completed_at, job_id, jobs(id, title, ro_number, customers(first_name, last_name), vehicles(year, make, model)), dvi_results(condition)")
      .eq("status", "completed")
      .order("completed_at", { ascending: true }),
    // Parking service lead count
    supabase
      .from("parking_reservations")
      .select("id", { count: "exact", head: true })
      .not("services_interested", "eq", "{}")
      .in("status", ["reserved", "checked_in"]),
  ]);

  const activeJobs = activeJobsResult.data || [];
  const monthCompleted = monthCompletedResult.data || [];

  // Shop Floor groupings
  const inProgress = activeJobs.filter(j => j.status === "in_progress");
  const waitingForParts = activeJobs.filter(j => j.status === "waiting_for_parts");
  const notStarted = activeJobs.filter(j => j.status === "not_started");

  // Alert stats
  const unassignedJobs = notStarted.filter(j => !j.assigned_tech).length;

  // Tech Workload — group incomplete jobs by assigned tech
  const techMap: Record<string, typeof activeJobs> = {};
  activeJobs.forEach(job => {
    const techName = (job.users as { name: string } | null)?.name || "Unassigned";
    if (!techMap[techName]) techMap[techName] = [];
    techMap[techName].push(job);
  });
  const techWorkload = Object.entries(techMap)
    .map(([name, jobs]) => ({ name, jobs }))
    .sort((a, b) => b.jobs.length - a.jobs.length);

  // Today's scheduled — not_started jobs received today
  const todayScheduled = notStarted.filter(j => j.date_received === today);

  // Revenue calculations
  const inspectionRows = inspectionRangeResult.data || [];
  function sumInspectionRev(rows: typeof inspectionRows) {
    return rows.reduce(
      (sum, r) => sum + (r.state_count || 0) * INSPECTION_RATE_STATE + (r.tnc_count || 0) * INSPECTION_RATE_TNC, 0
    );
  }
  const inspToday = inspectionRows.filter(r => r.date === today);
  const inspWeek = inspectionRows.filter(r => r.date >= weekStart && r.date <= weekEnd);
  const inspMonth = inspectionRows.filter(r => r.date >= monthStart && r.date <= monthEnd);
  const inspLastWeek = inspectionRows.filter(r => r.date >= lastWeekStart && r.date <= lastWeekEnd);
  const inspLastMonth = inspectionRows.filter(r => r.date >= lastMonthStart && r.date <= lastMonthEnd);

  const todayCompleted = monthCompleted.filter(j => j.date_finished === today);
  const weekCompleted = monthCompleted.filter(j =>
    j.date_finished !== null && j.date_finished >= weekStart && j.date_finished <= weekEnd
  );
  const weekJobRevenue = sumJobRevenue(weekCompleted);
  const weekJobCount = weekCompleted.length;

  // Unpaid jobs
  const unpaidJobs = (unpaidJobsResult.data || []).map(j => ({
    ...j,
    total: (j.job_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0,
  }));
  const totalOutstanding = unpaidJobs.reduce((s, j) => s + j.total, 0);

  // Pending estimates
  const pendingEstimates = (pendingEstimatesResult.data || []).map(e => ({
    ...e,
    total: (e.estimate_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0,
  }));

  // DVIs ready to send — count conditions, drop raw results from cache payload
  const dvisReady = (dviReadyResult.data || []).map(dvi => {
    const results = (dvi.dvi_results ?? []) as { condition: string | null }[];
    const counts = { monitor: 0, attention: 0 };
    for (const r of results) {
      if (r.condition === "monitor") counts.monitor++;
      else if (r.condition === "attention") counts.attention++;
    }
    const { dvi_results: _, ...rest } = dvi;
    return { ...rest, ...counts };
  });

  return {
    stats: {
      todayRevenue: sumJobRevenue(todayCompleted) + sumInspectionRev(inspToday),
      weeklyRevenue: weekJobRevenue + sumInspectionRev(inspWeek),
      lastWeekRevenue: sumJobRevenue(lastWeekCompletedResult.data) + sumInspectionRev(inspLastWeek),
      monthlyRevenue: sumJobRevenue(monthCompleted) + sumInspectionRev(inspMonth),
      lastMonthRevenue: sumJobRevenue(lastMonthCompletedResult.data) + sumInspectionRev(inspLastMonth),
      avgTicketWeek: weekJobCount > 0 ? weekJobRevenue / weekJobCount : 0,
      unassignedJobs,
      unpaidJobCount: unpaidJobs.length,
    },
    shopFloor: { inProgress, waitingForParts, notStarted },
    techWorkload,
    unpaidJobs,
    totalOutstanding,
    pendingEstimates,
    todayScheduled,
    dvisReady,
    estimateTotal: pendingEstimates.reduce((s, e) => s + e.total, 0),
    newQuoteRequests: newQuoteCountResult.count || 0,
    parkingServiceLeadCount: parkingLeadCountResult.count || 0,
    today,
  };
}, ["dashboard-stats"], { revalidate: 30 });

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export default async function DashboardPage() {
  const {
    stats, shopFloor, techWorkload, unpaidJobs, totalOutstanding,
    pendingEstimates, dvisReady, estimateTotal, todayScheduled,
    newQuoteRequests, parkingServiceLeadCount, today,
  } = await getDashboardData();

  const weekChange = pctChange(stats.weeklyRevenue, stats.lastWeekRevenue);
  const monthChange = pctChange(stats.monthlyRevenue, stats.lastMonthRevenue);

  return (
    <div className="p-4 lg:p-10 space-y-8 lg:space-y-10">

      {/* ── Action Bar ── */}
      <div className="flex gap-3">
        <Link href="/jobs/new" className="flex-1">
          <Button className="w-full gap-2">
            <Plus className="h-4 w-4" />
            New Job
          </Button>
        </Link>
        <Link href="/quick-pay" className="flex-1">
          <Button className="w-full gap-2 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-semibold">
            <DollarSign className="h-4 w-4" />
            Quick Pay
          </Button>
        </Link>
      </div>

      {/* ── Revenue Metrics ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <div className="bg-card p-5 lg:p-6 rounded-xl shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-2">Today&apos;s Revenue</p>
          <h3 className="text-3xl lg:text-4xl font-extrabold tabular-nums tracking-tighter text-stone-900 dark:text-stone-50">
            {formatCurrencyWhole(stats.todayRevenue)}
          </h3>
        </div>

        <div className="bg-card p-5 lg:p-6 rounded-xl shadow-card overflow-hidden">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-2">This Week</p>
          <h3 className="text-3xl lg:text-4xl font-extrabold tabular-nums tracking-tighter text-stone-900 dark:text-stone-50">
            {formatCurrencyWhole(stats.weeklyRevenue)}
          </h3>
          <span className={`mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
            weekChange >= 0
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
          }`}>
            {weekChange >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {weekChange >= 0 ? "+" : ""}{weekChange.toFixed(0)}%
          </span>
        </div>

        <div className="bg-card p-5 lg:p-6 rounded-xl shadow-card overflow-hidden">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-2">This Month</p>
          <h3 className="text-3xl lg:text-4xl font-extrabold tabular-nums tracking-tighter text-stone-900 dark:text-stone-50">
            {formatCurrencyWhole(stats.monthlyRevenue)}
          </h3>
          <span className={`mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
            monthChange >= 0
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
          }`}>
            {monthChange >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {monthChange >= 0 ? "+" : ""}{monthChange.toFixed(0)}%
          </span>
        </div>

        <div className="bg-card p-5 lg:p-6 rounded-xl shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-2">Avg Ticket</p>
          <h3 className="text-3xl lg:text-4xl font-extrabold tabular-nums tracking-tighter text-stone-900 dark:text-stone-50">
            {formatCurrencyWhole(stats.avgTicketWeek)}
          </h3>
        </div>
      </section>

      {/* ── Action Center ── */}
      <ActionCenterCard
        unpaidCount={stats.unpaidJobCount}
        unpaidTotal={totalOutstanding}
        dviCount={dvisReady.length}
        estimateCount={pendingEstimates.length}
        estimateTotal={estimateTotal}
        quoteCount={newQuoteRequests}
        parkingLeadCount={parkingServiceLeadCount}
      />

      {/* ── Unassigned Jobs Alert ── */}
      {stats.unassignedJobs > 0 && (
        <Link href="/jobs?status=not_started" className="block">
          <div className="flex items-center gap-3 rounded-xl bg-amber-100 dark:bg-amber-950 shadow-card border-l-4 border-l-amber-500 px-5 py-3.5 transition-colors hover:bg-amber-200 dark:hover:bg-amber-900">
            <UserX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-bold text-stone-900 dark:text-stone-50">
              {stats.unassignedJobs} unassigned {stats.unassignedJobs === 1 ? "job" : "jobs"}
            </span>
            <span className="ml-auto hidden text-xs text-stone-500 dark:text-stone-400 sm:inline">Not started, no tech</span>
          </div>
        </Link>
      )}

      {/* ── Shop Floor Status ── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg lg:text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Shop Floor Status
          </h3>
          <Link href="/jobs" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">
            Manage Workflow &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <ShopFloorColumn status="in_progress" label="In Progress" jobs={shopFloor.inProgress} today={today} />
          <ShopFloorColumn status="waiting_for_parts" label="Waiting for Parts" jobs={shopFloor.waitingForParts} today={today} />
          <ShopFloorColumn status="not_started" label="Not Started" jobs={shopFloor.notStarted} today={today} />
        </div>
      </section>

      {/* ── Tech Workload + Unpaid/Outstanding ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">

        {/* Tech Workload */}
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
          <div className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Tech Workload</h3>
          </div>
          {techWorkload.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No active jobs assigned</p>
            </div>
          ) : (
            <div className="space-y-5 p-5 lg:p-6">
              {techWorkload.map(tech => (
                <div key={tech.name}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-400">
                      {tech.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-50">{tech.name}</p>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 shrink-0">
                      {tech.jobs.length} {tech.jobs.length === 1 ? "job" : "jobs"}
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-11">
                    {tech.jobs.map(job => {
                      const customer = job.customers as { first_name: string; last_name: string } | null;
                      const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                      return (
                        <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                          <div className="flex items-center justify-between py-1 text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <span className="text-stone-500 dark:text-stone-400 truncate">
                              {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                              {vehicle ? ` \u00b7 ${formatVehicle(vehicle)}` : ""}
                            </span>
                            <StatusBadge status={job.status} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unpaid / Outstanding */}
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
          <div className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Unpaid / Outstanding</h3>
          </div>
          {unpaidJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-2 text-sm text-muted-foreground">All caught up</p>
            </div>
          ) : (
            <>
              <div className="mb-5 px-5 lg:px-6 pt-5">
                <p className="text-3xl font-extrabold tabular-nums tracking-tighter text-stone-900 dark:text-stone-50">
                  {formatCurrency(totalOutstanding)}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  across {unpaidJobs.length} {unpaidJobs.length === 1 ? "job" : "jobs"}
                </p>
              </div>
              <div className="divide-y divide-stone-200 dark:divide-stone-800">
                {unpaidJobs.map(job => {
                  const customer = job.customers as { first_name: string; last_name: string } | null;
                  const days = daysBetween(job.date_finished, today);
                  const aging = days >= 3;
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                      <div className="flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
                            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                          </p>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{job.title || "Job"}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5 pl-3">
                          <span className="text-sm font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatCurrency(job.total)}</span>
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase whitespace-nowrap ${
                            aging
                              ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400"
                              : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                          }`}>
                            {days}d
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Pending Estimates + Today's Schedule ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">

        {/* Pending Estimates */}
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
          <div className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Pending Estimates</h3>
          </div>
          {pendingEstimates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No pending estimates</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-200 dark:divide-stone-800">
              {pendingEstimates.map(est => {
                const job = est.jobs as { id: string; title: string | null; customers: { first_name: string; last_name: string } | null; vehicles: { year: number | null; make: string | null; model: string | null } | null } | null;
                const customer = job?.customers;
                const vehicle = job?.vehicles;
                const sentDate = est.sent_at ? est.sent_at.split("T")[0] : null;
                const days = daysBetween(sentDate, today);
                return (
                  <Link key={est.id} href={job ? `/jobs/${job.id}` : "#"} className="block">
                    <div className="flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
                          {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                          {vehicle ? formatVehicle(vehicle) : job?.title || "Estimate"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5 pl-3">
                        <span className="text-sm font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatCurrency(est.total)}</span>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase whitespace-nowrap ${
                          days >= 3
                            ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                            : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                        }`}>
                          {days}d
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Today's Schedule */}
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
          <div className="flex items-center justify-between bg-stone-800 dark:bg-stone-900 px-5 py-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Today&apos;s Schedule</h3>
            <Link href="/jobs/new" className="w-7 h-7 flex items-center justify-center bg-stone-600 text-white rounded-full hover:bg-stone-500 transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          {todayScheduled.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled today</p>
            </div>
          ) : (
            <div className="space-y-3 p-5 lg:p-6">
              {todayScheduled.map(job => {
                const customer = job.customers as { first_name: string; last_name: string } | null;
                const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                    <div className="flex items-center gap-4 p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                      <Car className="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900 dark:text-stone-50 truncate leading-tight">
                          {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                          {vehicle ? formatVehicle(vehicle) : ""}{job.title ? ` \u00b7 ${job.title}` : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shop Floor Column — one card per job ── */
function ShopFloorColumn({
  label,
  jobs,
  today,
  status,
}: {
  label: string;
  jobs: Array<{
    id: string;
    status: string;
    title: string | null;
    date_received: string | null;
    customers: unknown;
    vehicles: unknown;
    users: unknown;
  }>;
  today: string;
  status: "in_progress" | "waiting_for_parts" | "not_started";
}) {
  const config = {
    in_progress: {
      dot: "bg-blue-600 dark:bg-blue-500",
      border: "border-blue-600 dark:border-blue-500",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    },
    waiting_for_parts: {
      dot: "bg-amber-500",
      border: "border-amber-500",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    },
    not_started: {
      dot: "bg-stone-400 dark:bg-stone-500",
      border: "border-stone-300 dark:border-stone-600",
      badge: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
    },
  }[status];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
          {label} ({jobs.length})
        </span>
      </div>
      {jobs.length === 0 ? (
        <div className="border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl py-8 flex items-center justify-center">
          <p className="text-xs text-stone-400 dark:text-stone-500">None</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const customer = job.customers as { first_name: string; last_name: string } | null;
            const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
            const days = daysBetween(job.date_received, today);
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                <div className={`bg-card p-5 rounded-xl border-l-4 ${config.border} shadow-card hover:shadow-md transition-shadow`}>
                  <div className="flex justify-between items-start mb-1.5">
                    <h4 className="font-bold text-stone-900 dark:text-stone-50">
                      {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                    </h4>
                    <span className={`shrink-0 ml-2 text-[10px] font-black ${config.badge} px-2 py-1 rounded-full uppercase whitespace-nowrap`}>
                      {status === "not_started" ? "queue" : `${days} ${days === 1 ? "day" : "days"}`}
                    </span>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-stone-400 font-medium">
                    {vehicle ? formatVehicle(vehicle) : "No vehicle"}
                    {job.title ? ` \u00b7 ${job.title}` : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Status badge for tech workload ── */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    in_progress: { label: "In Progress", classes: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
    waiting_for_parts: { label: "Waiting", classes: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
    not_started: { label: "Queue", classes: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400" },
  };
  const { label, classes } = config[status] || { label: status, classes: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400" };
  return <span className={`shrink-0 ml-2 text-[10px] font-black px-2 py-1 rounded-full uppercase whitespace-nowrap ${classes}`}>{label}</span>;
}
