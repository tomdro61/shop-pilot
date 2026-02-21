import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, Calendar, DollarSign, AlertTriangle, Plus, ArrowRight, Clock, UserX, TrendingUp, TrendingDown } from "lucide-react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from "@/lib/constants";
import { formatVehicle, formatCurrency } from "@/lib/utils/format";
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
  const monthStart = startOfMonth(now).toISOString().split("T")[0];
  const monthEnd = endOfMonth(now).toISOString().split("T")[0];

  const lastWeekDate = subWeeks(now, 1);
  const lastWeekStart = startOfWeek(lastWeekDate, { weekStartsOn: 1 }).toISOString().split("T")[0];
  const lastWeekEnd = endOfWeek(lastWeekDate, { weekStartsOn: 1 }).toISOString().split("T")[0];

  const lastMonthDate = subMonths(now, 1);
  const lastMonthStart = startOfMonth(lastMonthDate).toISOString().split("T")[0];
  const lastMonthEnd = endOfMonth(lastMonthDate).toISOString().split("T")[0];

  const [
    carsInShopResult,
    waitingForPartsResult,
    unassignedJobsResult,
    weeklyRevenueResult,
    lastWeekRevenueResult,
    monthlyRevenueResult,
    lastMonthRevenueResult,
    unpaidJobsResult,
    fleetARResult,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["not_started", "in_progress", "waiting_for_parts"]),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_for_parts"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "not_started")
      .is("assigned_tech", null),
    supabase
      .from("jobs")
      .select("id, job_line_items(total)")
      .eq("status", "complete")
      .gte("date_finished", weekStart)
      .lte("date_finished", weekEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total)")
      .eq("status", "complete")
      .gte("date_finished", lastWeekStart)
      .lte("date_finished", lastWeekEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total)")
      .eq("status", "complete")
      .gte("date_finished", monthStart)
      .lte("date_finished", monthEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total)")
      .eq("status", "complete")
      .gte("date_finished", lastMonthStart)
      .lte("date_finished", lastMonthEnd),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived"),
    supabase
      .from("jobs")
      .select("id, job_line_items(total), customers!inner(customer_type)")
      .eq("customers.customer_type", "fleet")
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived"),
  ]);

  const weeklyRevenue =
    weeklyRevenueResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  const lastWeekRevenue =
    lastWeekRevenueResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  const monthlyRevenue =
    monthlyRevenueResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  const lastMonthRevenue =
    lastMonthRevenueResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  const outstandingAR =
    fleetARResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  return {
    carsInShop: carsInShopResult.count || 0,
    waitingForParts: waitingForPartsResult.count || 0,
    unassignedJobs: unassignedJobsResult.count || 0,
    weeklyRevenue,
    lastWeekRevenue,
    monthlyRevenue,
    lastMonthRevenue,
    unpaidJobs: unpaidJobsResult.count || 0,
    outstandingAR,
  };
}

async function getTodaysSchedule() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("jobs")
    .select("id, status, category, date_received, customers(first_name, last_name), vehicles(year, make, model), users(id, name)")
    .eq("date_received", today)
    .neq("status", "complete")
    .order("created_at");

  return data || [];
}

async function getRecentJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, status, category, date_received, payment_status, customers(first_name, last_name), vehicles(year, make, model)")
    .order("date_received", { ascending: false })
    .limit(5);
  return data || [];
}

const colorMap = {
  blue: { border: "border-t-blue-500", bg: "bg-blue-500/10 dark:bg-blue-400/10", text: "text-blue-600 dark:text-blue-400" },
  emerald: { border: "border-t-emerald-500", bg: "bg-emerald-500/10 dark:bg-emerald-400/10", text: "text-emerald-600 dark:text-emerald-400" },
  amber: { border: "border-t-amber-500", bg: "bg-amber-500/10 dark:bg-amber-400/10", text: "text-amber-600 dark:text-amber-400" },
  violet: { border: "border-t-violet-500", bg: "bg-violet-500/10 dark:bg-violet-400/10", text: "text-violet-600 dark:text-violet-400" },
  red: { border: "border-t-red-500", bg: "bg-red-500/10 dark:bg-red-400/10", text: "text-red-600 dark:text-red-400" },
} as const;

function RevenueCard({
  label,
  value,
  previous,
  previousLabel,
}: {
  label: string;
  value: number;
  previous: number;
  previousLabel: string;
}) {
  const colors = colorMap.emerald;
  const diff = previous > 0 ? ((value - previous) / previous) * 100 : value > 0 ? 100 : 0;
  const isUp = diff >= 0;

  return (
    <Card className={`${colors.border} border-t-2 gap-0 py-0`}>
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${colors.bg}`}>
            <DollarSign className={`h-3.5 w-3.5 ${colors.text}`} />
          </div>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{formatCurrency(value)}</p>
        <div className="mt-1 flex items-center gap-1">
          {isUp ? (
            <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
          )}
          <span className={`text-xs font-medium tabular-nums ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {isUp ? "+" : ""}{diff.toFixed(0)}%
          </span>
          <span className="text-xs text-muted-foreground">{previousLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </h2>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  color: keyof typeof colorMap;
  icon: typeof Car;
}) {
  const colors = colorMap[color];
  return (
    <Card className={`${colors.border} border-t-2 gap-0 py-0`}>
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${colors.bg}`}>
            <Icon className={`h-3.5 w-3.5 ${colors.text}`} />
          </div>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [stats, todaysSchedule, recentJobs] = await Promise.all([
    getDashboardStats(),
    getTodaysSchedule(),
    getRecentJobs(),
  ]);

  const hasAlerts = stats.unpaidJobs > 0 || stats.outstandingAR > 0;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6 space-y-6">

      {/* ── Quick Actions ── */}
      <div className="animate-in-up stagger-1">
        <Link href="/jobs/new">
          <Button className="w-full gap-2">
            <Plus className="h-4 w-4" />
            New Job
          </Button>
        </Link>
      </div>

      {/* ── Revenue ── */}
      <section className="animate-in-up stagger-2">
        <SectionHeader label="Revenue" />
        <div className="grid grid-cols-2 gap-3">
          <RevenueCard label="This Week" value={stats.weeklyRevenue} previous={stats.lastWeekRevenue} previousLabel="vs last week" />
          <RevenueCard label="This Month" value={stats.monthlyRevenue} previous={stats.lastMonthRevenue} previousLabel="vs last month" />
        </div>
      </section>

      {/* ── Needs Attention ── */}
      {hasAlerts && (
        <section className="animate-in-up stagger-3">
          <SectionHeader label="Needs Attention" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {stats.unpaidJobs > 0 && (
              <StatCard label="Unpaid Jobs" value={stats.unpaidJobs} color="red" icon={AlertTriangle} />
            )}
            {stats.outstandingAR > 0 && (
              <StatCard label="Outstanding A/R" value={formatCurrency(stats.outstandingAR)} color="red" icon={AlertTriangle} />
            )}
          </div>
        </section>
      )}

      {/* ── Shop Floor ── */}
      <section className="animate-in-up stagger-4">
        <SectionHeader label="Shop Floor" />
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Cars In Shop" value={stats.carsInShop} color="blue" icon={Car} />
          <StatCard label="Waiting for Parts" value={stats.waitingForParts} color="amber" icon={Clock} />
          <StatCard label="Unassigned" value={stats.unassignedJobs} color="red" icon={UserX} />
        </div>
      </section>

      {/* ── Today's Schedule ── */}
      <section className="animate-in-up stagger-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-5 py-3">
            <CardTitle className="text-sm font-semibold">Today&apos;s Schedule</CardTitle>
            <Link
              href="/jobs"
              className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {todaysSchedule.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium text-muted-foreground">No jobs scheduled today</p>
              </div>
            ) : (
              <div className="divide-y">
                {todaysSchedule.map((job) => {
                  const status = job.status as JobStatus;
                  const statusColors = JOB_STATUS_COLORS[status];
                  const customer = job.customers as { first_name: string; last_name: string } | null;
                  const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                  const tech = job.users as { id: string; name: string } | null;
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                      <div className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[job.category, vehicle ? formatVehicle(vehicle) : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 pl-4">
                          <span className={`text-[11px] ${tech ? "text-muted-foreground" : "text-red-500 dark:text-red-400 font-medium"}`}>
                            {tech ? tech.name : "Unassigned"}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${statusColors?.bg ?? ""} ${statusColors?.text ?? ""} ${statusColors?.border ?? ""}`}
                          >
                            {JOB_STATUS_LABELS[status] || status}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Recent Jobs ── */}
      <section className="animate-in-up stagger-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-5 py-3">
            <CardTitle className="text-sm font-semibold">Recent Jobs</CardTitle>
            <Link
              href="/jobs"
              className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Car className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium text-muted-foreground">No jobs yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Create your first job to get started</p>
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
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                      <div className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[job.category, vehicle ? formatVehicle(vehicle) : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 pl-4">
                          <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
                            {new Date(job.date_received).toLocaleDateString()}
                          </span>
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
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
