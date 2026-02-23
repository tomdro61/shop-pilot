"use server";

import { createClient } from "@/lib/supabase/server";
import { subDays, differenceInDays, parseISO } from "date-fns";

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function getReportData(params: {
  from: string;
  to: string;
  isAllTime: boolean;
}) {
  const { from: start, to: end, isAllTime } = params;
  const supabase = await createClient();

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

  // ONE query for current period — includes category, tech, and line item type for all aggregations
  const currentPromise = supabase
    .from("jobs")
    .select("id, category, assigned_tech, users!jobs_assigned_tech_fkey(name), job_line_items(type, total, quantity)")
    .eq("status", "complete")
    .gte("date_finished", start)
    .lte("date_finished", end);

  // ONE query for prior period (just count + revenue)
  const priorPromise = priorStart && priorEnd
    ? supabase
        .from("jobs")
        .select("id, job_line_items(total)")
        .eq("status", "complete")
        .gte("date_finished", priorStart)
        .lte("date_finished", priorEnd)
    : Promise.resolve({ data: null });

  const [currentResult, priorResult] = await Promise.all([currentPromise, priorPromise]);

  const currentJobs = currentResult.data || [];
  const priorJobs = priorResult.data || [];

  // --- Aggregate everything from the single current-period result ---

  type LineItem = { type: string; total: number; quantity: number };

  function getLineItems(job: { job_line_items: unknown }): LineItem[] {
    return (job.job_line_items as LineItem[]) || [];
  }

  function sumLineItemTotals(job: { job_line_items: unknown }): number {
    return getLineItems(job).reduce((s, li) => s + (li.total || 0), 0);
  }

  // Job count + revenue
  const jobsCurrent = currentJobs.length;
  const revenueCurrent = currentJobs.reduce((sum, job) => sum + sumLineItemTotals(job), 0);

  // Prior period
  const jobsPrior = priorJobs.length > 0 ? priorJobs.length : null;
  const revenuePrior = priorJobs.length > 0
    ? priorJobs.reduce((sum, job) => {
        const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
          (s, li) => s + (li.total || 0), 0
        );
        return sum + (jobTotal || 0);
      }, 0)
    : null;

  // Jobs by category
  const catCounts: Record<string, number> = {};
  const catRevenue: Record<string, number> = {};
  // Profitability by category (revenue + parts cost breakdown)
  const catProfitability: Record<string, { revenue: number; partsCost: number }> = {};
  // Revenue breakdown (labor vs parts)
  let laborRevenue = 0;
  let partsRevenue = 0;
  // Inspection count
  let inspectionCount = 0;

  // Jobs by tech
  const techCounts: Record<string, number> = {};
  const techRevenue: Record<string, number> = {};

  currentJobs.forEach((job) => {
    const cat = job.category || "Uncategorized";
    const user = job.users as { name: string } | null;
    const techName = user?.name || "Unassigned";
    const lineItems = getLineItems(job);
    const jobTotal = lineItems.reduce((s, li) => s + (li.total || 0), 0);

    // Category counts + revenue
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    catRevenue[cat] = (catRevenue[cat] || 0) + jobTotal;

    // Tech counts + revenue
    techCounts[techName] = (techCounts[techName] || 0) + 1;
    techRevenue[techName] = (techRevenue[techName] || 0) + jobTotal;

    // Profitability
    if (!catProfitability[cat]) {
      catProfitability[cat] = { revenue: 0, partsCost: 0 };
    }
    lineItems.forEach((li) => {
      catProfitability[cat].revenue += li.total || 0;
      if (li.type === "part") {
        catProfitability[cat].partsCost += li.total || 0;
        partsRevenue += li.total || 0;
      } else if (li.type === "labor") {
        laborRevenue += li.total || 0;
      }
    });

    // Inspection count
    if (cat === "Inspection") {
      inspectionCount += lineItems.reduce((s, li) => s + (li.quantity || 0), 0);
    }
  });

  const jobsByCategory = Object.entries(catCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const revenueByCategory = Object.entries(catRevenue)
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const jobsByTech = Object.entries(techCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const revenueByTech = Object.entries(techRevenue)
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const profitability = Object.entries(catProfitability)
    .map(([category, { revenue, partsCost }]) => ({
      category,
      revenue,
      partsCost,
      laborRevenue: revenue - partsCost,
      margin: revenue > 0 ? ((revenue - partsCost) / revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = laborRevenue + partsRevenue;
  const estimatedGrossProfit = laborRevenue + partsRevenue * 0.4;

  const avgTicket = jobsCurrent > 0 ? revenueCurrent / jobsCurrent : 0;

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
    // Folded-in data (previously separate queries)
    profitability,
    breakdown: { laborRevenue, partsRevenue, totalRevenue, estimatedGrossProfit },
    inspectionCount,
  };
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

export async function getInspectionCount(start: string, end: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, job_line_items(quantity)")
    .eq("status", "complete")
    .eq("category", "Inspection")
    .gte("date_finished", start)
    .lte("date_finished", end);

  return (
    data?.reduce((sum, job) => {
      const jobCount = (job.job_line_items as { quantity: number }[])?.reduce(
        (s, li) => s + (li.quantity || 0),
        0
      );
      return sum + (jobCount || 0);
    }, 0) || 0
  );
}

export async function getDailyRevenueSparkline(days: number) {
  const supabase = await createClient();
  const start = toDateStr(subDays(new Date(), days - 1));
  const end = toDateStr(new Date());

  const { data } = await supabase
    .from("jobs")
    .select("date_finished, updated_at, job_line_items(total)")
    .eq("status", "complete")
    .gte("date_finished", start)
    .lte("date_finished", end);

  // Build a map of date -> revenue
  const revenueByDate: Record<string, number> = {};

  // Initialize all dates to 0
  for (let i = 0; i < days; i++) {
    const d = toDateStr(subDays(new Date(), days - 1 - i));
    revenueByDate[d] = 0;
  }

  data?.forEach((job) => {
    const dateStr = (job.date_finished || job.updated_at || "").split("T")[0];
    if (dateStr && revenueByDate[dateStr] !== undefined) {
      const jobTotal = (job.job_line_items as { total: number }[])?.reduce(
        (s, li) => s + (li.total || 0),
        0
      ) || 0;
      revenueByDate[dateStr] += jobTotal;
    }
  });

  return Object.entries(revenueByDate)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getStaleJobsCount() {
  const supabase = await createClient();
  const twoDaysAgo = toDateStr(subDays(new Date(), 2));

  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["not_started", "in_progress", "waiting_for_parts"])
    .lt("date_received", twoDaysAgo);

  return count || 0;
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
