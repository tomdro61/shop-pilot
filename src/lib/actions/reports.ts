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
    .eq("status", "complete")
    .gte("date_finished", start)
    .lte("date_finished", end);
  return count || 0;
}

async function getRevenue(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, job_line_items(total)")
    .eq("status", "complete")
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
    .eq("status", "complete")
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
    .eq("status", "complete")
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
    .eq("status", "complete")
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
    .eq("status", "complete")
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

export async function getServiceProfitability(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("category, job_line_items(type, total)")
    .eq("status", "complete")
    .gte("date_finished", start)
    .lte("date_finished", end);

  const categories: Record<string, { revenue: number; partsCost: number }> = {};

  data?.forEach((job) => {
    const cat = job.category || "Uncategorized";
    if (!categories[cat]) {
      categories[cat] = { revenue: 0, partsCost: 0 };
    }
    (job.job_line_items as { type: string; total: number }[])?.forEach((li) => {
      categories[cat].revenue += li.total || 0;
      if (li.type === "part") {
        categories[cat].partsCost += li.total || 0;
      }
    });
  });

  return Object.entries(categories)
    .map(([category, { revenue, partsCost }]) => ({
      category,
      revenue,
      partsCost,
      laborRevenue: revenue - partsCost,
      margin: revenue > 0 ? ((revenue - partsCost) / revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getFleetARSummary() {
  const supabase = await createClient();

  // Get all fleet customer jobs that aren't fully paid
  const { data } = await supabase
    .from("jobs")
    .select("id, date_finished, payment_status, customers!inner(id, first_name, last_name, customer_type, fleet_account), job_line_items(total)")
    .eq("customers.customer_type", "fleet")
    .eq("status", "complete")
    .neq("payment_status", "paid")
    .neq("payment_status", "waived");

  const now = new Date();
  const accounts: Record<string, { current: number; days31to60: number; days60plus: number; total: number }> = {};

  data?.forEach((job) => {
    const customer = job.customers as { fleet_account: string | null; first_name: string; last_name: string } | null;
    const accountName = customer?.fleet_account || `${customer?.first_name} ${customer?.last_name}`;
    const jobTotal = (job.job_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0;

    if (!accounts[accountName]) {
      accounts[accountName] = { current: 0, days31to60: 0, days60plus: 0, total: 0 };
    }

    const daysOld = job.date_finished
      ? differenceInDays(now, parseISO(job.date_finished))
      : 0;

    if (daysOld <= 30) {
      accounts[accountName].current += jobTotal;
    } else if (daysOld <= 60) {
      accounts[accountName].days31to60 += jobTotal;
    } else {
      accounts[accountName].days60plus += jobTotal;
    }
    accounts[accountName].total += jobTotal;
  });

  return Object.entries(accounts)
    .map(([account, buckets]) => ({ account, ...buckets }))
    .sort((a, b) => b.total - a.total);
}

export async function getDailySummary() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Jobs received or worked on today
  const { data: todayJobs } = await supabase
    .from("jobs")
    .select("id, status, category, payment_status, payment_method, assigned_tech, users!jobs_assigned_tech_fkey(name), customers(first_name, last_name), job_line_items(total)")
    .or(`date_received.eq.${today},date_finished.eq.${today}`);

  const jobs = todayJobs || [];

  // Revenue by payment method
  const revenueByMethod: Record<string, number> = {};
  let totalRevenue = 0;

  jobs.forEach((job) => {
    if (job.payment_status === "paid" || job.status === "complete") {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0;
      const method = (job.payment_method as string) || "unrecorded";
      revenueByMethod[method] = (revenueByMethod[method] || 0) + jobTotal;
      totalRevenue += jobTotal;
    }
  });

  // Tech activity
  const techActivity: Record<string, number> = {};
  jobs.forEach((job) => {
    const user = job.users as { name: string } | null;
    const name = user?.name || "Unassigned";
    techActivity[name] = (techActivity[name] || 0) + 1;
  });

  return {
    date: today,
    totalJobs: jobs.length,
    totalRevenue,
    revenueByMethod,
    techActivity,
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      category: j.category,
      payment_status: j.payment_status,
      customer: j.customers as { first_name: string; last_name: string } | null,
    })),
  };
}
