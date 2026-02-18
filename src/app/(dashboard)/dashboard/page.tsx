import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wrench, Calendar, DollarSign } from "lucide-react";
import { startOfWeek, endOfWeek } from "date-fns";

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

export default async function DashboardPage() {
  const stats = await getDashboardStats();

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
    <div className="p-4 lg:p-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
