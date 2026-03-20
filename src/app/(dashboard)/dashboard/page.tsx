import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import {
  Car, DollarSign, Plus, AlertTriangle,
  Clock, UserX, TrendingUp, TrendingDown, FileQuestion,
  Wrench, User, FileText, Calendar, CheckCircle2, Package,
} from "lucide-react";
import { INSPECTION_RATE_STATE, INSPECTION_RATE_TNC } from "@/lib/constants";
import { formatVehicle, formatCurrency, formatCurrencyWhole } from "@/lib/utils/format";
import { todayET } from "@/lib/utils";
import { sumJobRevenue } from "@/lib/utils/revenue";
import { resolveDateRange } from "@/lib/utils/date-range";

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
    newQuoteRequests: newQuoteCountResult.count || 0,
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
    pendingEstimates, todayScheduled, newQuoteRequests, today,
  } = await getDashboardData();

  const weekChange = pctChange(stats.weeklyRevenue, stats.lastWeekRevenue);
  const monthChange = pctChange(stats.monthlyRevenue, stats.lastMonthRevenue);
  const alertCount = stats.unpaidJobCount + stats.unassignedJobs + newQuoteRequests;

  return (
    <div className="p-4 lg:p-6 space-y-7">

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

      {/* ── Revenue ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          Revenue
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Today</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{formatCurrencyWhole(stats.todayRevenue)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">This Week</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{formatCurrencyWhole(stats.weeklyRevenue)}</p>
            <div className="mt-1 flex items-center gap-1">
              {weekChange >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
              )}
              <span className={`text-xs font-medium tabular-nums ${weekChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {weekChange >= 0 ? "+" : ""}{weekChange.toFixed(0)}%
              </span>
              <span className="text-xs text-muted-foreground">vs last week</span>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">This Month</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{formatCurrencyWhole(stats.monthlyRevenue)}</p>
            <div className="mt-1 flex items-center gap-1">
              {monthChange >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
              )}
              <span className={`text-xs font-medium tabular-nums ${monthChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {monthChange >= 0 ? "+" : ""}{monthChange.toFixed(0)}%
              </span>
              <span className="text-xs text-muted-foreground">vs last month</span>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Avg Ticket (Week)</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{formatCurrencyWhole(stats.avgTicketWeek)}</p>
          </div>
        </div>
      </section>

      {/* ── Alerts ── */}
      {alertCount > 0 && (
        <div className="space-y-1.5">
          {stats.unpaidJobCount > 0 && (
            <Link href="/jobs?payment_status=unpaid&status=complete" className="block">
              <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 transition-colors hover:bg-red-100 dark:hover:bg-red-900">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-800 dark:text-red-300">
                  {stats.unpaidJobCount} unpaid {stats.unpaidJobCount === 1 ? "job" : "jobs"}
                </span>
                <span className="ml-auto hidden text-xs text-red-600 dark:text-red-400 sm:inline">Complete but not paid</span>
              </div>
            </Link>
          )}
          {stats.unassignedJobs > 0 && (
            <Link href="/jobs?status=not_started" className="block">
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900">
                <UserX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {stats.unassignedJobs} unassigned {stats.unassignedJobs === 1 ? "job" : "jobs"}
                </span>
                <span className="ml-auto hidden text-xs text-amber-600 dark:text-amber-400 sm:inline">Not started, no tech</span>
              </div>
            </Link>
          )}
          {newQuoteRequests > 0 && (
            <Link href="/quote-requests?status=new" className="block">
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-4 py-2 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900">
                <FileQuestion className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  {newQuoteRequests} new quote {newQuoteRequests === 1 ? "request" : "requests"}
                </span>
                <span className="ml-auto hidden text-xs text-blue-600 dark:text-blue-400 sm:inline">From website form</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ── Shop Floor ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          Shop Floor
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ShopFloorGroup
            label="In Progress"
            icon={<Wrench className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
            jobs={shopFloor.inProgress}
            today={today}
            accentColor="blue"
          />
          <ShopFloorGroup
            label="Waiting for Parts"
            icon={<Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
            jobs={shopFloor.waitingForParts}
            today={today}
            accentColor="amber"
          />
          <ShopFloorGroup
            label="Not Started"
            icon={<Clock className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />}
            jobs={shopFloor.notStarted}
            today={today}
            accentColor="stone"
          />
        </div>
      </section>

      {/* ── Tech Workload + Unpaid/Outstanding ── */}
      <div className="grid grid-cols-1 gap-7 lg:gap-3 lg:grid-cols-2">

        {/* Tech Workload */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Tech Workload
          </h2>
          <div className="rounded-lg border bg-card">
            {techWorkload.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No active jobs assigned</p>
              </div>
            ) : (
              <div className="divide-y">
                {techWorkload.map(tech => (
                  <div key={tech.name} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">{tech.name}</span>
                      <span className="text-xs text-muted-foreground">({tech.jobs.length} {tech.jobs.length === 1 ? "job" : "jobs"})</span>
                    </div>
                    <div className="space-y-1 pl-5.5">
                      {tech.jobs.map(job => {
                        const customer = job.customers as { first_name: string; last_name: string } | null;
                        const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                        return (
                          <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                            <div className="flex items-center justify-between py-0.5 text-xs hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                              <span className="text-muted-foreground">
                                {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                                {vehicle ? ` \u00b7 ${formatVehicle(vehicle)}` : ""}
                              </span>
                              <StatusDot status={job.status} />
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
        </section>

        {/* Unpaid / Outstanding */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Unpaid / Outstanding
          </h2>
          <div className="rounded-lg border bg-card">
            {unpaidJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <p className="mt-2 text-sm text-muted-foreground">All caught up</p>
              </div>
            ) : (
              <>
                <div className="border-b px-4 py-3">
                  <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                    {formatCurrency(totalOutstanding)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    across {unpaidJobs.length} {unpaidJobs.length === 1 ? "job" : "jobs"}
                  </p>
                </div>
                <div className="divide-y">
                  {unpaidJobs.map(job => {
                    const customer = job.customers as { first_name: string; last_name: string } | null;
                    const days = daysBetween(job.date_finished, today);
                    const aging = days >= 3;
                    return (
                      <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                        <div className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">{job.title || "Job"}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 pl-3">
                            <span className="text-sm font-medium tabular-nums">{formatCurrency(job.total)}</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              aging
                                ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400"
                                : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
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
        </section>
      </div>

      {/* ── Pending Estimates + Today's Scheduled ── */}
      <div className="grid grid-cols-1 gap-7 lg:gap-3 lg:grid-cols-2">

        {/* Pending Estimates */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Pending Estimates
          </h2>
          <div className="rounded-lg border bg-card">
            {pendingEstimates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No pending estimates</p>
              </div>
            ) : (
              <div className="divide-y">
                {pendingEstimates.map(est => {
                  const job = est.jobs as { id: string; title: string | null; customers: { first_name: string; last_name: string } | null; vehicles: { year: number | null; make: string | null; model: string | null } | null } | null;
                  const customer = job?.customers;
                  const vehicle = job?.vehicles;
                  const sentDate = est.sent_at ? est.sent_at.split("T")[0] : null;
                  const days = daysBetween(sentDate, today);
                  return (
                    <Link key={est.id} href={job ? `/jobs/${job.id}` : "#"} className="block">
                      <div className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {vehicle ? formatVehicle(vehicle) : job?.title || "Estimate"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 pl-3">
                          <span className="text-sm font-medium tabular-nums">{formatCurrency(est.total)}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            days >= 3
                              ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                              : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
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
        </section>

        {/* Today's Scheduled Work */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Today&apos;s Schedule
          </h2>
          <div className="rounded-lg border bg-card">
            {todayScheduled.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled today</p>
              </div>
            ) : (
              <div className="divide-y">
                {todayScheduled.map(job => {
                  const customer = job.customers as { first_name: string; last_name: string } | null;
                  const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                      <div className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {vehicle ? formatVehicle(vehicle) : ""}{job.title ? ` \u00b7 ${job.title}` : ""}
                          </p>
                        </div>
                        <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── Shop Floor Group Card ── */
function ShopFloorGroup({
  label,
  icon,
  jobs,
  today,
  accentColor,
}: {
  label: string;
  icon: React.ReactNode;
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
  accentColor: "blue" | "amber" | "stone";
}) {
  const borderColors = {
    blue: "border-l-blue-500 dark:border-l-blue-400",
    amber: "border-l-amber-500 dark:border-l-amber-400",
    stone: "border-l-stone-400 dark:border-l-stone-500",
  };

  return (
    <div className={`rounded-lg border border-l-[3px] ${borderColors[accentColor]} bg-card p-4`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-auto text-lg font-bold tabular-nums text-stone-900 dark:text-stone-50">{jobs.length}</span>
      </div>
      {jobs.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => {
            const customer = job.customers as { first_name: string; last_name: string } | null;
            const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
            const days = daysBetween(job.date_received, today);
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                <div className="flex items-center justify-between py-0.5 transition-colors hover:text-blue-600 dark:hover:text-blue-400">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {vehicle ? formatVehicle(vehicle) : "No vehicle"}
                    </p>
                  </div>
                  <span className={`shrink-0 ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    days >= 5
                      ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400"
                      : days >= 2
                        ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                        : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                  }`}>
                    {days}d
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Status dot for tech workload ── */
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    in_progress: "bg-blue-500",
    waiting_for_parts: "bg-amber-500",
    not_started: "bg-stone-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] || "bg-stone-400"}`} />;
}
