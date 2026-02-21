import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Car, Calendar, DollarSign, AlertTriangle, Plus, ArrowRight,
  Clock, UserX, TrendingUp, TrendingDown, ClipboardCheck, Receipt,
} from "lucide-react";
import { startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from "@/lib/constants";
import { formatVehicle, formatCurrency } from "@/lib/utils/format";
import { getInspectionCount, getStaleJobsCount } from "@/lib/actions/reports";
import type { JobStatus, PaymentStatus } from "@/types";

export const metadata = {
  title: "Dashboard | ShopPilot",
};

async function getDashboardStats() {
  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString().split("T")[0];
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString().split("T")[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const lastWeekDate = subWeeks(now, 1);
  const lastWeekStart = startOfWeek(lastWeekDate, { weekStartsOn: 1 }).toISOString().split("T")[0];
  const lastWeekEnd = endOfWeek(lastWeekDate, { weekStartsOn: 1 }).toISOString().split("T")[0];

  function sumRevenue(data: { job_line_items: unknown }[] | null) {
    return (
      data?.reduce((sum, job) => {
        const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
          (s, li) => s + (li.total || 0), 0
        );
        return sum + (jobTotal || 0);
      }, 0) || 0
    );
  }

  const [
    carsInShopResult,
    waitingForPartsResult,
    unassignedJobsResult,
    todayRevenueResult,
    weeklyRevenueResult,
    lastWeekRevenueResult,
    monthlyRevenueResult,
    unpaidJobsResult,
  ] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .in("status", ["not_started", "in_progress", "waiting_for_parts"]),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("status", "waiting_for_parts"),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("status", "not_started").is("assigned_tech", null),
    supabase.from("jobs").select("id, job_line_items(total)")
      .eq("status", "complete").eq("date_finished", today),
    supabase.from("jobs").select("id, job_line_items(total)")
      .eq("status", "complete").gte("date_finished", weekStart).lte("date_finished", weekEnd),
    supabase.from("jobs").select("id, job_line_items(total)")
      .eq("status", "complete").gte("date_finished", lastWeekStart).lte("date_finished", lastWeekEnd),
    supabase.from("jobs").select("id, job_line_items(total)")
      .eq("status", "complete").gte("date_finished", monthStart).lte("date_finished", monthEnd),
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("status", "complete").neq("payment_status", "paid").neq("payment_status", "waived"),
  ]);

  const weeklyRevenue = sumRevenue(weeklyRevenueResult.data);
  const weekJobCount = weeklyRevenueResult.data?.length || 0;

  return {
    carsInShop: carsInShopResult.count || 0,
    waitingForParts: waitingForPartsResult.count || 0,
    unassignedJobs: unassignedJobsResult.count || 0,
    todayRevenue: sumRevenue(todayRevenueResult.data),
    weeklyRevenue,
    lastWeekRevenue: sumRevenue(lastWeekRevenueResult.data),
    monthlyRevenue: sumRevenue(monthlyRevenueResult.data),
    avgTicketWeek: weekJobCount > 0 ? weeklyRevenue / weekJobCount : 0,
    unpaidJobs: unpaidJobsResult.count || 0,
  };
}

async function getTechActivity() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("jobs")
    .select("id, status, category, assigned_tech, users!jobs_assigned_tech_fkey(name)")
    .or(`date_received.eq.${today},date_finished.eq.${today}`);

  const techs: Record<string, { jobs: number; completed: number }> = {};
  data?.forEach((job) => {
    const user = job.users as { name: string } | null;
    const name = user?.name || "Unassigned";
    if (!techs[name]) techs[name] = { jobs: 0, completed: 0 };
    techs[name].jobs += 1;
    if (job.status === "complete") techs[name].completed += 1;
  });

  return Object.entries(techs)
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => b.jobs - a.jobs);
}

async function getRecentJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, status, category, date_received, payment_status, job_line_items(total), customers(first_name, last_name), vehicles(year, make, model)")
    .order("date_received", { ascending: false })
    .limit(8);
  return data || [];
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export default async function DashboardPage() {
  const [stats, techActivity, recentJobs, staleJobs, inspectionsToday] = await Promise.all([
    getDashboardStats(),
    getTechActivity(),
    getRecentJobs(),
    getStaleJobsCount(),
    getInspectionCount(
      new Date().toISOString().split("T")[0],
      new Date().toISOString().split("T")[0],
    ),
  ]);

  const weekChange = pctChange(stats.weeklyRevenue, stats.lastWeekRevenue);
  const alertCount = stats.unpaidJobs + stats.unassignedJobs + staleJobs;

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
          <Button variant="outline" className="w-full gap-2">
            <DollarSign className="h-4 w-4" />
            Quick Pay
          </Button>
        </Link>
      </div>

      {/* ═══════════════════════════════════════════
          Section 1: REVENUE
      ═══════════════════════════════════════════ */}
      <section className="rounded-xl border bg-muted/50 p-4 lg:p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Today</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight">{formatCurrency(stats.todayRevenue)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">This Week</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight">{formatCurrency(stats.weeklyRevenue)}</p>
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
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">This Month</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight">{formatCurrency(stats.monthlyRevenue)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avg Ticket (Week)</p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight">{formatCurrency(stats.avgTicketWeek)}</p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          Section 2: OPERATIONS
      ═══════════════════════════════════════════ */}
      <section className="rounded-xl border bg-muted/50 p-4 lg:p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Operations
        </h2>

        <div className="space-y-3">
          {/* Alerts */}
          {alertCount > 0 && (
            <div className="space-y-1.5">
              {stats.unpaidJobs > 0 && (
                <Link href="/jobs?paymentStatus=unpaid&status=complete" className="block">
                  <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 transition-colors hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/5 dark:hover:bg-red-500/10">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">
                      {stats.unpaidJobs} unpaid {stats.unpaidJobs === 1 ? "job" : "jobs"}
                    </span>
                    <span className="ml-auto hidden text-xs text-red-500 dark:text-red-400/70 sm:inline">Complete but not paid</span>
                  </div>
                </Link>
              )}
              {stats.unassignedJobs > 0 && (
                <Link href="/jobs?status=not_started" className="block">
                  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/5 dark:hover:bg-amber-500/10">
                    <UserX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {stats.unassignedJobs} unassigned {stats.unassignedJobs === 1 ? "job" : "jobs"}
                    </span>
                    <span className="ml-auto hidden text-xs text-amber-500 dark:text-amber-400/70 sm:inline">Not started, no tech</span>
                  </div>
                </Link>
              )}
              {staleJobs > 0 && (
                <Link href="/jobs" className="block">
                  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/5 dark:hover:bg-amber-500/10">
                    <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {staleJobs} {staleJobs === 1 ? "job needs" : "jobs need"} review
                    </span>
                    <span className="ml-auto hidden text-xs text-amber-500 dark:text-amber-400/70 sm:inline">Open &gt; 2 days</span>
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* Shop Floor + Tech Activity */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Shop Floor</p>
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
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tech Activity</p>
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
      <section className="rounded-xl border bg-muted/50 p-4 lg:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Jobs
          </h2>
          <Link
            href="/jobs"
            className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
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
                    <div className="flex items-center justify-between px-5 py-2.5 transition-colors hover:bg-accent/50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[job.category, vehicle ? formatVehicle(vehicle) : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 pl-4">
                        {jobTotal > 0 && (
                          <span className="hidden text-xs font-medium tabular-nums text-muted-foreground sm:inline">
                            {formatCurrency(jobTotal)}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusColors?.bg ?? ""} ${statusColors?.text ?? ""} ${statusColors?.border ?? ""}`}
                        >
                          {JOB_STATUS_LABELS[status] || status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${paymentColors?.bg ?? ""} ${paymentColors?.text ?? ""} ${paymentColors?.border ?? ""}`}
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
