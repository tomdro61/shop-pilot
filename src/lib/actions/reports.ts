"use server";

import { createClient } from "@/lib/supabase/server";
import { subDays, differenceInDays, parseISO } from "date-fns";

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

async function getJobsByTech(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("assigned_tech, users!jobs_assigned_tech_fkey(name)")
    .in("status", ["complete", "paid"])
    .gte("date_finished", start)
    .lte("date_finished", end);

  const counts: Record<string, number> = {};
  data?.forEach((job) => {
    const user = job.users as { name: string } | null;
    const name = user?.name || "Unassigned";
    counts[name] = (counts[name] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

async function getRevenueByTech(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select(
      "assigned_tech, users!jobs_assigned_tech_fkey(name), job_line_items(total)"
    )
    .in("status", ["complete", "paid"])
    .gte("date_finished", start)
    .lte("date_finished", end);

  const totals: Record<string, number> = {};
  data?.forEach((job) => {
    const user = job.users as { name: string } | null;
    const name = user?.name || "Unassigned";
    const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
      (s, li) => s + (li.total || 0),
      0
    );
    totals[name] = (totals[name] || 0) + (jobTotal || 0);
  });

  return Object.entries(totals)
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getReportData(params: {
  from: string;
  to: string;
  isAllTime: boolean;
}) {
  const { from: start, to: end, isAllTime } = params;

  // Compute prior period of equal length for comparison
  let priorStart: string | null = null;
  let priorEnd: string | null = null;
  if (!isAllTime) {
    const days = differenceInDays(parseISO(end), parseISO(start));
    const priorEndDate = subDays(parseISO(start), 1);
    const priorStartDate = subDays(priorEndDate, days);
    priorStart = toDateStr(priorStartDate);
    priorEnd = toDateStr(priorEndDate);
  }

  const [
    jobsCurrent,
    revenueCurrent,
    jobsPrior,
    revenuePrior,
    jobsByCategory,
    revenueByCategory,
    jobsByTech,
    revenueByTech,
  ] = await Promise.all([
    getJobCount(start, end),
    getRevenue(start, end),
    priorStart && priorEnd ? getJobCount(priorStart, priorEnd) : Promise.resolve(null),
    priorStart && priorEnd ? getRevenue(priorStart, priorEnd) : Promise.resolve(null),
    getJobsByCategory(start, end),
    getRevenueByCategory(start, end),
    getJobsByTech(start, end),
    getRevenueByTech(start, end),
  ]);

  const avgTicket =
    jobsCurrent > 0 ? revenueCurrent / jobsCurrent : 0;

  return {
    jobsCurrent,
    revenueCurrent,
    jobsPrior,
    revenuePrior,
    jobsByCategory,
    revenueByCategory,
    jobsByTech,
    revenueByTech,
    avgTicket,
    isAllTime,
  };
}
