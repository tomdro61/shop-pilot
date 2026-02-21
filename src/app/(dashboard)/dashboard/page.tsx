import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Wrench, Calendar, DollarSign } from "lucide-react";
import { startOfWeek, endOfWeek } from "date-fns";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/constants";
import { formatVehicle } from "@/lib/utils/format";
import type { JobStatus } from "@/types";

export const metadata = {
  title: "Dashboard | ShopPilot",
};

async function getDashboardStats() {
  const supabase = await createClient();
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString().split("T")[0];
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString().split("T")[0];

  const [customersResult, activeJobsResult, jobsThisWeekResult, revenueResult] =
    await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["not_started", "waiting_for_parts", "in_progress"]),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .gte("date_received", weekStart)
        .lte("date_received", weekEnd),
      supabase
        .from("jobs")
        .select("id, job_line_items(total)")
        .in("status", ["complete", "paid"])
        .gte("date_finished", weekStart)
        .lte("date_finished", weekEnd),
    ]);

  const weeklyRevenue =
    revenueResult.data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0;

  return {
    totalCustomers: customersResult.count || 0,
    activeJobs: activeJobsResult.count || 0,
    jobsThisWeek: jobsThisWeekResult.count || 0,
    weeklyRevenue,
  };
}

async function getRecentJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, status, category, date_received, customers(first_name, last_name), vehicles(year, make, model)")
    .order("date_received", { ascending: false })
    .limit(5);
  return data || [];
}

export default async function DashboardPage() {
  const [stats, recentJobs] = await Promise.all([
    getDashboardStats(),
    getRecentJobs(),
  ]);

  const cards = [
    {
      title: "Active Jobs",
      value: stats.activeJobs,
      icon: Wrench,
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers,
      icon: Users,
    },
    {
      title: "Jobs This Week",
      value: stats.jobsThisWeek,
      icon: Calendar,
    },
    {
      title: "Revenue This Week",
      value: `$${stats.weeklyRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Jobs */}
      <div className="mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Recent Jobs</CardTitle>
            <Link href="/jobs" className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                No jobs yet
              </p>
            ) : (
              <div className="space-y-1">
                {recentJobs.map((job) => {
                  const status = job.status as JobStatus;
                  const colors = JOB_STATUS_COLORS[status];
                  const customer = job.customers as { first_name: string; last_name: string } | null;
                  const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`}>
                      <div className="flex items-center justify-between rounded-md px-2 py-2.5 transition-colors hover:bg-accent">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
                            </span>
                            {job.category && (
                              <span className="text-xs text-muted-foreground">
                                {job.category}
                              </span>
                            )}
                          </div>
                          {vehicle && (
                            <p className="text-xs text-muted-foreground">
                              {formatVehicle(vehicle)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {new Date(job.date_received).toLocaleDateString()}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${colors.bg} ${colors.text} ${colors.border}`}
                          >
                            {JOB_STATUS_LABELS[status]}
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
    </div>
  );
}
