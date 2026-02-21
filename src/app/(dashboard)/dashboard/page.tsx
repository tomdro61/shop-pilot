import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, Calendar, DollarSign, AlertTriangle, ClipboardCheck, Plus, ReceiptText } from "lucide-react";
import { startOfWeek, endOfWeek } from "date-fns";
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

  const [
    carsInShopResult,
    jobsThisWeekResult,
    revenueResult,
    fleetARResult,
    inspectionResult,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["not_started", "in_progress", "waiting_for_parts"]),
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
      .gte("date_finished", weekStart)
      .lte("date_finished", weekEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total), customers!inner(customer_type)")
      .eq("customers.customer_type", "fleet")
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived"),
    supabase
      .from("jobs")
      .select("id, job_line_items(quantity, total)")
      .eq("category", "Inspection")
      .eq("date_received", today),
  ]);

  const weeklyRevenue =
    revenueResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  const completedJobsThisWeek = jobsThisWeekResult.data?.length || 0;
  const avgTicketThisWeek = completedJobsThisWeek > 0 ? weeklyRevenue / completedJobsThisWeek : 0;

  const outstandingAR =
    fleetARResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  // Inspections today
  let inspectionsCount = 0;
  let inspectionsAmount = 0;
  inspectionResult.data?.forEach((job) => {
    const items = job.job_line_items as { quantity: number; total: number }[];
    items?.forEach((li) => {
      inspectionsCount += li.quantity || 0;
      inspectionsAmount += li.total || 0;
    });
  });

  return {
    carsInShop: carsInShopResult.count || 0,
    completedJobsThisWeek,
    weeklyRevenue,
    avgTicketThisWeek,
    outstandingAR,
    inspectionsCount,
    inspectionsAmount,
  };
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

export default async function DashboardPage() {
  const [stats, recentJobs] = await Promise.all([
    getDashboardStats(),
    getRecentJobs(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="border-t-2 border-t-blue-500 shadow-[var(--glow-md)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cars In Shop</CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
              <Car className="h-3.5 w-3.5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats.carsInShop}</div>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-amber-500 shadow-[var(--glow-md)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Revenue This Week</CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
              <DollarSign className="h-3.5 w-3.5 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{formatCurrency(stats.weeklyRevenue)}</div>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-emerald-500 shadow-[var(--glow-md)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avg Ticket This Week</CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
              <ReceiptText className="h-3.5 w-3.5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{formatCurrency(stats.avgTicketThisWeek)}</div>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-violet-500 shadow-[var(--glow-md)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inspections Today</CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
              <ClipboardCheck className="h-3.5 w-3.5 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats.inspectionsCount}</div>
            {stats.inspectionsAmount > 0 && (
              <p className="text-xs text-muted-foreground">{formatCurrency(stats.inspectionsAmount)}</p>
            )}
          </CardContent>
        </Card>
        {stats.outstandingAR > 0 && (
          <Card className="border-t-2 border-t-red-500 shadow-[var(--glow-md)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding A/R</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{formatCurrency(stats.outstandingAR)}</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link href="/jobs/new" className="flex-1">
          <Button className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            New Job
          </Button>
        </Link>
        <Link href="/inspections" className="flex-1">
          <Button variant="outline" className="w-full">
            <ClipboardCheck className="mr-2 h-4 w-4" />
            New Inspection Day
          </Button>
        </Link>
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="text-base font-semibold">Recent Jobs</CardTitle>
          <Link href="/jobs" className="text-sm font-medium text-primary hover:text-primary/80">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No jobs yet
            </p>
          ) : (
            <div className="-mx-5 divide-y">
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
                        <p className="text-sm font-semibold">
                          {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[job.category, vehicle ? formatVehicle(vehicle) : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
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
    </div>
  );
}
