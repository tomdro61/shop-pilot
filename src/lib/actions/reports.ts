"use server";

import { createClient } from "@/lib/supabase/server";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
} from "date-fns";

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

async function getJobCount(start: string, end: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["complete", "paid"])
    .gte("date_finished", start)
    .lte("date_finished", end);
  return count || 0;
}

async function getRevenue(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, job_line_items(total)")
    .in("status", ["complete", "paid"])
    .gte("date_finished", start)
    .lte("date_finished", end);

  return (
    data?.reduce((sum, job) => {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      );
      return sum + (jobTotal || 0);
    }, 0) || 0
  );
}

async function getJobsByCategory(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("category, id")
    .in("status", ["complete", "paid"])
    .gte("date_finished", start)
    .lte("date_finished", end);

  const counts: Record<string, number> = {};
  data?.forEach((job) => {
    const cat = job.category || "Uncategorized";
    counts[cat] = (counts[cat] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

async function getRevenueByCategory(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("category, job_line_items(total)")
    .in("status", ["complete", "paid"])
    .gte("date_finished", start)
    .lte("date_finished", end);

  const totals: Record<string, number> = {};
  data?.forEach((job) => {
    const cat = job.category || "Uncategorized";
    const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
      (s, li) => s + (li.total || 0),
      0
    );
    totals[cat] = (totals[cat] || 0) + (jobTotal || 0);
  });

  return Object.entries(totals)
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getReportData() {
  const now = new Date();
  const weekOpts = { weekStartsOn: 1 as const };

  // Current periods
  const thisWeekStart = toDateStr(startOfWeek(now, weekOpts));
  const thisWeekEnd = toDateStr(endOfWeek(now, weekOpts));
  const thisMonthStart = toDateStr(startOfMonth(now));
  const thisMonthEnd = toDateStr(endOfMonth(now));

  // Previous periods
  const lastWeekDate = subWeeks(now, 1);
  const lastWeekStart = toDateStr(startOfWeek(lastWeekDate, weekOpts));
  const lastWeekEnd = toDateStr(endOfWeek(lastWeekDate, weekOpts));
  const lastMonthDate = subMonths(now, 1);
  const lastMonthStart = toDateStr(startOfMonth(lastMonthDate));
  const lastMonthEnd = toDateStr(endOfMonth(lastMonthDate));

  // Use a broader range for category breakdowns (current month)
  const [
    jobsThisWeek,
    jobsLastWeek,
    jobsThisMonth,
    jobsLastMonth,
    revenueThisWeek,
    revenueLastWeek,
    revenueThisMonth,
    revenueLastMonth,
    jobsByCategory,
    revenueByCategory,
  ] = await Promise.all([
    getJobCount(thisWeekStart, thisWeekEnd),
    getJobCount(lastWeekStart, lastWeekEnd),
    getJobCount(thisMonthStart, thisMonthEnd),
    getJobCount(lastMonthStart, lastMonthEnd),
    getRevenue(thisWeekStart, thisWeekEnd),
    getRevenue(lastWeekStart, lastWeekEnd),
    getRevenue(thisMonthStart, thisMonthEnd),
    getRevenue(lastMonthStart, lastMonthEnd),
    getJobsByCategory(thisMonthStart, thisMonthEnd),
    getRevenueByCategory(thisMonthStart, thisMonthEnd),
  ]);

  const totalJobsThisMonth = jobsThisMonth || 1; // avoid division by zero
  const avgTicket =
    revenueThisMonth > 0 ? revenueThisMonth / totalJobsThisMonth : 0;

  return {
    jobsThisWeek,
    jobsLastWeek,
    jobsThisMonth,
    jobsLastMonth,
    revenueThisWeek,
    revenueLastWeek,
    revenueThisMonth,
    revenueLastMonth,
    jobsByCategory,
    revenueByCategory,
    avgTicket,
  };
}
