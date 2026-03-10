import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Car, Calendar, DollarSign, AlertTriangle, Plus, ArrowRight,
  Clock, UserX, TrendingUp, TrendingDown, ClipboardCheck, Receipt, FileQuestion,
} from "lucide-react";
import { startOfWeek, endOfWeek, subWeeks, subDays } from "date-fns";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, INSPECTION_RATE_STATE, INSPECTION_RATE_TNC } from "@/lib/constants";
import { formatVehicle, formatCurrency, formatCurrencyWhole } from "@/lib/utils/format";
import { todayET } from "@/lib/utils";
import { sumJobRevenue } from "@/lib/utils/revenue";
import type { JobStatus, PaymentStatus } from "@/types";

export const metadata = {
  title: "Dashboard | ShopPilot",
};

const getDashboardData = unstable_cache(async () => {
  const supabase = createAdminClient();

  // All dates derived from todayET() string to avoid double timezone conversion.
  // nowET() + formatDateET() applies ET conversion twice, shifting dates near midnight.
  const today = todayET();
  const todayDate = new Date(today + "T12:00:00"); // noon avoids DST edge cases

  function toDateStr(d: Date): string {
    return d.toISOString().split("T")[0];
  }

  const weekStart = toDateStr(startOfWeek(todayDate, { weekStartsOn: 1 }));
  const weekEnd = toDateStr(endOfWeek(todayDate, { weekStartsOn: 1 }));
  const monthStart = today.slice(0, 8) + "01"; // YYYY-MM-01
  const monthEnd = toDateStr(new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0));

  const lastWeekDate = subWeeks(todayDate, 1);
  const lastWeekStart = toDateStr(startOfWeek(lastWeekDate, { weekStartsOn: 1 }));
  const lastWeekEnd = toDateStr(endOfWeek(lastWeekDate, { weekStartsOn: 1 }));

  const twoDaysAgo = toDateStr(subDays(todayDate, 2));

  // Inspection data range — covers both current month and last week
  const inspectionRangeStart = lastWeekStart < monthStart ? lastWeekStart : monthStart;

  // 5 queries:
  // 1. Active jobs (shop floor counts + stale jobs + tech activity today)
  // 2. Completed jobs this month (covers today/week/month revenue + unpaid)
  // 3. Completed jobs last week (week-over-week comparison)
  // 4. Recent jobs (for the list)
  const [activeJobsResult, monthCompletedResult, lastWeekCompletedResult, recentJobsResult, inspectionRangeResult, newQuoteCountResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, status, assigned_tech, date_received, date_finished, users!jobs_assigned_tech_fkey(name)")
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
      .select("id, status, title, date_received, payment_status, job_line_items(total), customers(first_name, last_name), vehicles(year, make, model)")
      .order("date_received", { ascending: false })
      .limit(8),
    supabase
      .from("daily_inspection_counts")
      .select("date, state_count, tnc_count")
      .gte("date", inspectionRangeStart)
      .lte("date", monthEnd),
    supabase
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);

  const activeJobs = activeJobsResult.data || [];
  const monthCompleted = monthCompletedResult.data || [];

  // Derive shop floor stats from active jobs
  const carsInShop = activeJobs.length;
  const waitingForParts = activeJobs.filter(j => j.status === "waiting_for_parts").length;
  const unassignedJobs = activeJobs.filter(j => j.status === "not_started" && !j.assigned_tech).length;
  const staleJobs = activeJobs.filter(j => j.date_received && j.date_received < twoDaysAgo).length;

  // Derive tech activity from active jobs touched today
  const todayJobs = activeJobs.filter(j =>
    j.date_received === today || j.date_finished === today
  );
  const techs: Record<string, { jobs: number; completed: number }> = {};
  todayJobs.forEach((job) => {
    const user = job.users as { name: string } | null;
    const name = user?.name || "Unassigned";
    if (!techs[name]) techs[name] = { jobs: 0, completed: 0 };
    techs[name].jobs += 1;
    if (job.status === "complete") techs[name].completed += 1;
  });
  const techActivity = Object.entries(techs)
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => b.jobs - a.jobs);

  // Derive revenue from monthly completed jobs
  const todayCompleted = monthCompleted.filter(j => j.date_finished === today);
  const weekCompleted = monthCompleted.filter(j =>
    j.date_finished !== null && j.date_finished >= weekStart && j.date_finished <= weekEnd
  );
  const unpaidJobs = monthCompleted.filter(j =>
    j.payment_status !== "paid" && j.payment_status !== "waived"
  );

  // Also count unpaid jobs outside this month range (completed before this month)
  // For accuracy, query unpaid count separately only if needed — but for now,
  // the dashboard alert is about complete+unpaid which is mostly this month's jobs
  const { count: totalUnpaidCount } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "complete")
    .neq("payment_status", "paid")
    .neq("payment_status", "waived");

  const weekJobCount = weekCompleted.length;

  // Inspection revenue — from daily_inspection_counts, filtered by date range
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

  const weekJobRevenue = sumJobRevenue(weekCompleted);
  const todayRevenue = sumJobRevenue(todayCompleted) + sumInspectionRev(inspToday);
  const weeklyRevenue = weekJobRevenue + sumInspectionRev(inspWeek);
  const monthlyRevenue = sumJobRevenue(monthCompleted) + sumInspectionRev(inspMonth);
  const lastWeekRevenue = sumJobRevenue(lastWeekCompletedResult.data) + sumInspectionRev(inspLastWeek);

  const inspectionsToday = inspToday.reduce((sum, r) => sum + (r.state_count || 0) + (r.tnc_count || 0), 0);

  const newQuoteRequests = newQuoteCountResult.count || 0;

  return {
    stats: {
      carsInShop,
      waitingForParts,
      unassignedJobs,
      todayRevenue,
      weeklyRevenue,
      lastWeekRevenue,
      monthlyRevenue,
      avgTicketWeek: weekJobCount > 0 ? weekJobRevenue / weekJobCount : 0,
      unpaidJobs: totalUnpaidCount || 0,
    },
    techActivity,
    recentJobs: recentJobsResult.data || [],
    staleJobs,
    inspectionsToday,
    newQuoteRequests,
  };
}, ["dashboard-stats"], { revalidate: 30 });

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export default async function DashboardPage() {
  const { stats, techActivity, recentJobs, staleJobs, inspectionsToday, newQuoteRequests } = await getDashboardData();

  const weekChange = pctChange(stats.weeklyRevenue, stats.lastWeekRevenue);
  const alertCount = stats.unpaidJobs + stats.unassignedJobs + staleJobs + newQuoteRequests;

  return (
    <div className="p-4 lg:p-6 space-y-7">

      {/* ── Action Bar (page-level, no container) ── */}
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

      {/* ═══════════════════════════════════════════
          Section 1: REVENUE
      ═══════════════════════════════════════════ */}
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
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Avg Ticket (Week)</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{formatCurrencyWhole(stats.avgTicketWeek)}</p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          Section 2: OPERATIONS
      ═══════════════════════════════════════════ */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          Operations
        </h2>

        <div className="space-y-3">
          {/* Alerts */}
          {alertCount > 0 && (
            <div className="space-y-1.5">
              {stats.unpaidJobs > 0 && (
                <Link href="/jobs?payment_status=unpaid&status=complete" className="block">
                  <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 transition-colors hover:bg-red-100 dark:hover:bg-red-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium text-red-800 dark:text-red-300">
                      {stats.unpaidJobs} unpaid {stats.unpaidJobs === 1 ? "job" : "jobs"}
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
              {staleJobs > 0 && (
                <Link href="/jobs" className="block">
                  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900">
                    <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {staleJobs} {staleJobs === 1 ? "job needs" : "jobs need"} review
                    </span>
                    <span className="ml-auto hidden text-xs text-amber-600 dark:text-amber-400 sm:inline">Open &gt; 2 days</span>
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

          {/* Shop Floor + Tech Activity */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Shop Floor</p>
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2.5">
                  <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-2xl font-bold tabular-nums leading-none">{stats.carsInShop}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">In Shop</p>
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-2xl font-bold tabular-nums leading-none">{stats.waitingForParts}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Waiting Parts</p>
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="flex items-center gap-2.5">
                  <ClipboardCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <div>
                    <p className="text-2xl font-bold tabular-nums leading-none">{inspectionsToday}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Inspections</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">Tech Activity</p>
              </div>
              {techActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">No activity today</p>
                </div>
              ) : (
                <div className="divide-y">
                  {techActivity.map((tech) => (
                    <div key={tech.name} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm font-medium">{tech.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {tech.completed}/{tech.jobs} done
                        </span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${tech.jobs > 0 ? (tech.completed / tech.jobs) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          Section 3: RECENT JOBS
      ═══════════════════════════════════════════ */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Recent Jobs
          </h2>
          <Link
            href="/jobs"
            className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:text-blue-700 dark:hover:text-blue-300"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="rounded-lg border bg-card">
          {recentJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Car className="h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No jobs yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {recentJobs.map((job) => {
                const status = job.status as JobStatus;
                const statusColors = JOB_STATUS_COLORS[status];
                const paymentStatus = (job.payment_status || "unpaid") as PaymentStatus;
                const paymentColors = PAYMENT_STATUS_COLORS[paymentStatus];
                const customer = job.customers as { first_name: string; last_name: string } | null;
                const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
                  (s, li) => s + (li.total || 0), 0
                ) || 0;
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                    <div className="flex items-center justify-between px-5 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[job.title, vehicle ? formatVehicle(vehicle) : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 pl-4">
                        {jobTotal > 0 && (
                          <span className="hidden text-xs font-medium tabular-nums text-muted-foreground sm:inline">
                            {formatCurrency(jobTotal)}
                          </span>
                        )}
                        <Badge
                          className={`text-[10px] border-transparent ${statusColors?.bg ?? ""} ${statusColors?.text ?? ""}`}
                        >
                          {JOB_STATUS_LABELS[status] || status}
                        </Badge>
                        <Badge
                          className={`text-[10px] border-transparent ${paymentColors?.bg ?? ""} ${paymentColors?.text ?? ""}`}
                        >
                          {PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
