"use server";

import { createClient } from "@/lib/supabase/server";
import { subDays, differenceInDays, parseISO } from "date-fns";
import { todayET } from "@/lib/utils";
import { getInspectionCountsRange } from "@/lib/actions/inspections";
import { INSPECTION_CATEGORY, calcInspectionRevenue } from "@/lib/utils/revenue";
import { MA_SALES_TAX_RATE } from "@/lib/constants";

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

  // ONE query for current period — includes tech and line item data for all aggregations
  const currentPromise = supabase
    .from("jobs")
    .select("id, assigned_tech, users!jobs_assigned_tech_fkey(name), job_line_items(type, total, quantity, unit_cost, cost, category)")
    .eq("status", "complete")
    .gte("date_finished", start)
    .lte("date_finished", end);

  // ONE query for prior period (count + revenue + gross profit)
  const priorPromise = priorStart && priorEnd
    ? supabase
        .from("jobs")
        .select("id, job_line_items(type, total, cost, quantity, category)")
        .eq("status", "complete")
        .gte("date_finished", priorStart)
        .lte("date_finished", priorEnd)
    : Promise.resolve({ data: null });

  // Estimate close rate: estimates sent within this period
  const estimatesPromise = supabase
    .from("estimates")
    .select("id, status, sent_at")
    .in("status", ["sent", "approved"])
    .gte("sent_at", start)
    .lte("sent_at", end);

  // Prior period estimates
  const priorEstimatesPromise = priorStart && priorEnd
    ? supabase
        .from("estimates")
        .select("id, status, sent_at")
        .in("status", ["sent", "approved"])
        .gte("sent_at", priorStart)
        .lte("sent_at", priorEnd)
    : Promise.resolve({ data: null });

  const [currentResult, priorResult, estimatesResult, priorEstimatesResult] = await Promise.all([
    currentPromise, priorPromise, estimatesPromise, priorEstimatesPromise,
  ]);

  const currentJobs = currentResult.data || [];
  const priorJobs = priorResult.data || [];
  const estimates = estimatesResult.data || [];
  const priorEstimates = priorEstimatesResult.data || [];

  // --- Aggregate everything from the single current-period result ---

  type LineItem = { type: string; total: number; quantity: number; unit_cost: number; cost: number | null; category: string | null };

  function getLineItems(job: { job_line_items: unknown }): LineItem[] {
    return (job.job_line_items as LineItem[]) || [];
  }

  function sumLineItemTotals(job: { job_line_items: unknown }): number {
    return getLineItems(job)
      .filter((li) => li.category !== INSPECTION_CATEGORY)
      .reduce((s, li) => s + (li.total || 0), 0);
  }

  // Job count + revenue
  const jobsCurrent = currentJobs.length;
  const revenueCurrent = currentJobs.reduce((sum, job) => sum + sumLineItemTotals(job), 0);

  // Prior period
  const jobsPrior = priorJobs.length > 0 ? priorJobs.length : null;
  let revenuePrior: number | null = null;
  let grossProfitPrior: number | null = null;
  if (priorJobs.length > 0) {
    let priorRev = 0;
    let priorPartsCost = 0;
    priorJobs.forEach((job) => {
      const items = (job.job_line_items as { type: string; total: number; cost: number | null; quantity: number; category: string | null }[]) || [];
      items.filter((li) => li.category !== INSPECTION_CATEGORY).forEach((li) => {
        priorRev += li.total || 0;
        if (li.type === "part") {
          priorPartsCost += li.cost != null ? li.cost * li.quantity : (li.total || 0) * 0.6;
        }
      });
    });
    revenuePrior = priorRev;
    grossProfitPrior = priorRev - priorPartsCost;
  }

  // Jobs by category
  const catCounts: Record<string, number> = {};
  const catRevenue: Record<string, number> = {};
  // Profitability by category (revenue + actual/estimated parts cost breakdown)
  const catProfitability: Record<string, { revenue: number; actualPartsCost: number; estimatedPartsCost: number; partsRevenue: number; laborRevenue: number }> = {};
  // Revenue breakdown (labor vs parts)
  let laborRevenue = 0;
  let partsRevenue = 0;
  // Parts cost tracking (actual vs estimated)
  let totalActualPartsCost = 0;
  let totalEstimatedPartsCost = 0;
  let partsWithCostCount = 0;
  let totalPartsCount = 0;
  // Inspection count — fetched from daily_inspection_counts table below

  // Jobs by tech
  const techCounts: Record<string, number> = {};
  const techRevenue: Record<string, number> = {};
  const techPartsCost: Record<string, number> = {};

  currentJobs.forEach((job) => {
    const user = job.users as { name: string } | null;
    const techName = user?.name || "Unassigned";
    const lineItems = getLineItems(job).filter((li) => li.category !== INSPECTION_CATEGORY);
    const jobTotal = lineItems.reduce((s, li) => s + (li.total || 0), 0);

    // Derive job category from highest-revenue line-item category
    const liCatRevenue: Record<string, number> = {};
    lineItems.forEach((li) => {
      const cat = li.category || "Uncategorized";
      liCatRevenue[cat] = (liCatRevenue[cat] || 0) + (li.total || 0);
    });
    const jobCat = Object.entries(liCatRevenue).sort((a, b) => b[1] - a[1])[0]?.[0] || "Uncategorized";

    // Job counts use derived category (one job = one count)
    catCounts[jobCat] = (catCounts[jobCat] || 0) + 1;

    // Tech counts + revenue
    techCounts[techName] = (techCounts[techName] || 0) + 1;
    techRevenue[techName] = (techRevenue[techName] || 0) + jobTotal;
    if (!techPartsCost[techName]) techPartsCost[techName] = 0;

    // Revenue + profitability use line-item-level category for accurate multi-service splits
    lineItems.forEach((li) => {
      const liCat = li.category || "Uncategorized";

      catRevenue[liCat] = (catRevenue[liCat] || 0) + (li.total || 0);

      if (!catProfitability[liCat]) {
        catProfitability[liCat] = { revenue: 0, actualPartsCost: 0, estimatedPartsCost: 0, partsRevenue: 0, laborRevenue: 0 };
      }
      catProfitability[liCat].revenue += li.total || 0;
      if (li.type === "part") {
        catProfitability[liCat].partsRevenue += li.total || 0;
        partsRevenue += li.total || 0;
        totalPartsCount++;
        if (li.cost != null) {
          // Actual cost known
          const actualCost = li.cost * li.quantity;
          catProfitability[liCat].actualPartsCost += actualCost;
          totalActualPartsCost += actualCost;
          techPartsCost[techName] += actualCost;
          partsWithCostCount++;
        } else {
          // Estimate: assume 60% of retail price is cost (40% margin)
          const estimatedCost = (li.total || 0) * 0.6;
          catProfitability[liCat].estimatedPartsCost += estimatedCost;
          totalEstimatedPartsCost += estimatedCost;
          techPartsCost[techName] += estimatedCost;
        }
      } else if (li.type === "labor") {
        laborRevenue += li.total || 0;
        catProfitability[liCat].laborRevenue += li.total || 0;
      }
    });

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
    .map(([category, { revenue, actualPartsCost, estimatedPartsCost, partsRevenue: catPartsRev, laborRevenue: catLaborRev }]) => {
      const totalPartsCost = actualPartsCost + estimatedPartsCost;
      const grossProfit = revenue - totalPartsCost;
      const hasEstimatedCosts = estimatedPartsCost > 0;
      return {
        category,
        revenue,
        partsCost: totalPartsCost,
        partsRevenue: catPartsRev,
        laborRevenue: catLaborRev,
        grossProfit,
        margin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        hasEstimatedCosts,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = laborRevenue + partsRevenue;
  const totalPartsCost = totalActualPartsCost + totalEstimatedPartsCost;
  const grossProfit = totalRevenue - totalPartsCost;
  const costDataCoverage = totalPartsCount > 0
    ? Math.round((partsWithCostCount / totalPartsCount) * 100)
    : 100;

  const avgTicket = jobsCurrent > 0 ? revenueCurrent / jobsCurrent : 0;

  // Merged category breakdown (revenue + job count in one array)
  const categoryBreakdown = Object.entries(catRevenue)
    .map(([category, revenue]) => ({
      category,
      revenue,
      jobCount: catCounts[category] || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Merged tech breakdown (revenue + job count in one array)
  const techBreakdown = Object.entries(techRevenue)
    .map(([name, revenue]) => ({
      name,
      revenue,
      jobCount: techCounts[name] || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Tech profit breakdown (revenue - parts cost)
  const techProfitBreakdown = Object.entries(techRevenue)
    .map(([name, revenue]) => ({
      name,
      revenue,
      grossProfit: revenue - (techPartsCost[name] || 0),
      jobCount: techCounts[name] || 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);

  // Inspections from dedicated table
  const inspectionTotals = await getInspectionCountsRange(start, end);
  const inspCalc = calcInspectionRevenue(inspectionTotals);
  const inspectionCount = inspCalc.totalCount;
  const inspectionRevenue = inspCalc.totalRevenue;
  const inspectionCost = inspCalc.totalCost;
  const inspectionProfit = inspCalc.totalProfit;

  // Inject inspection types into category breakdown and profitability
  if (inspCalc.stateCount > 0) {
    categoryBreakdown.push({
      category: "State Inspection",
      revenue: inspCalc.stateRevenue,
      jobCount: inspCalc.stateCount,
    });
    profitability.push({
      category: "State Inspection",
      revenue: inspCalc.stateRevenue,
      partsCost: inspCalc.totalCost,
      partsRevenue: 0,
      laborRevenue: inspCalc.stateRevenue,
      grossProfit: inspCalc.stateRevenue - inspCalc.totalCost,
      margin: inspCalc.stateRevenue > 0
        ? ((inspCalc.stateRevenue - inspCalc.totalCost) / inspCalc.stateRevenue) * 100
        : 0,
      hasEstimatedCosts: false,
    });
  }
  if (inspCalc.tncCount > 0) {
    categoryBreakdown.push({
      category: "TNC Inspection",
      revenue: inspCalc.tncRevenue,
      jobCount: inspCalc.tncCount,
    });
    profitability.push({
      category: "TNC Inspection",
      revenue: inspCalc.tncRevenue,
      partsCost: 0,
      partsRevenue: 0,
      laborRevenue: inspCalc.tncRevenue,
      grossProfit: inspCalc.tncRevenue,
      margin: 100,
      hasEstimatedCosts: false,
    });
  }
  categoryBreakdown.sort((a, b) => b.revenue - a.revenue);
  profitability.sort((a, b) => b.revenue - a.revenue);

  // Prior period inspections
  let inspectionCountPrior: number | null = null;
  let inspectionProfitPrior: number | null = null;
  if (priorStart && priorEnd) {
    const priorInspTotals = await getInspectionCountsRange(priorStart, priorEnd);
    const priorInspCalc = calcInspectionRevenue(priorInspTotals);
    inspectionCountPrior = priorInspCalc.totalCount;
    inspectionProfitPrior = priorInspCalc.totalProfit;
    // Add prior inspection profit to gross profit prior
    if (grossProfitPrior !== null) {
      grossProfitPrior += priorInspCalc.totalProfit;
    }
    // Add prior inspection revenue to revenue prior
    if (revenuePrior !== null) {
      revenuePrior += priorInspCalc.totalRevenue;
    }
  }

  // Estimate close rate
  const estimatesSent = estimates.length;
  const estimatesApproved = estimates.filter((e) => e.status === "approved").length;
  const estimateCloseRate = estimatesSent > 0 ? (estimatesApproved / estimatesSent) * 100 : 0;

  // Prior estimate close rate
  const priorEstimatesSent = priorEstimates.length;
  const priorEstimatesApproved = priorEstimates.filter((e) => e.status === "approved").length;
  const priorEstimateCloseRate = priorEstimatesSent > 0 ? (priorEstimatesApproved / priorEstimatesSent) * 100 : 0;

  // Computed comparison values
  const totalGrossProfit = grossProfit + inspectionProfit;
  const avgTicketPrior = jobsPrior && revenuePrior !== null ? revenuePrior / jobsPrior : null;

  return {
    jobsCurrent,
    revenueCurrent,
    jobsPrior,
    revenuePrior,
    jobsByCategory,
    revenueByCategory,
    jobsByTech,
    revenueByTech,
    categoryBreakdown,
    techBreakdown,
    techProfitBreakdown,
    estimateCloseRate: { rate: estimateCloseRate, approved: estimatesApproved, sent: estimatesSent },
    priorEstimateCloseRate: priorEstimatesSent > 0 ? { rate: priorEstimateCloseRate } : null,
    avgTicket,
    avgTicketPrior,
    isAllTime,
    // Folded-in data (previously separate queries)
    profitability,
    breakdown: { laborRevenue, partsRevenue, totalRevenue, grossProfit, costDataCoverage },
    totalGrossProfit,
    grossProfitPrior,
    inspectionCount,
    inspectionCountPrior,
    inspectionRevenue,
    inspectionCost,
    inspectionProfit,
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
  const today = todayET();

  // Jobs received or worked on today
  const { data: todayJobs } = await supabase
    .from("jobs")
    .select("id, status, payment_status, payment_method, assigned_tech, users!jobs_assigned_tech_fkey(name), customers(first_name, last_name), job_line_items(total, category)")
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
    jobs: jobs.map((j) => {
      // Derive category from highest-revenue line item category
      const liItems = (j.job_line_items as { total: number; category: string | null }[]) || [];
      const catTotals: Record<string, number> = {};
      liItems.forEach((li) => {
        const cat = li.category || "Uncategorized";
        catTotals[cat] = (catTotals[cat] || 0) + (li.total || 0);
      });
      const category = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "Uncategorized";
      return {
        id: j.id,
        status: j.status,
        category,
        payment_status: j.payment_status,
        customer: j.customers as { first_name: string; last_name: string } | null,
      };
    }),
  };
}

// ── Tax Summary Report ──────────────────────────────────────────────

export interface TaxMonthRow {
  month: string; // "January", "February", etc.
  monthNum: number; // 1-12
  totalRevenue: number;
  taxableAmount: number; // parts totals
  taxCollected: number; // taxableAmount * tax rate
  nonTaxableAmount: number; // labor + other non-taxed items
}

export interface TaxReportData {
  year: number;
  taxRate: number;
  months: TaxMonthRow[];
  ytd: Omit<TaxMonthRow, "month" | "monthNum">;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function getTaxReportData(year: number): Promise<TaxReportData> {
  const supabase = await createClient();
  const taxRate = MA_SALES_TAX_RATE;

  // Query all paid jobs with line items. We filter by year in JS because
  // the date logic (paid_at with date_finished fallback) is simpler client-side.
  // For a single shop this is a few hundred jobs per year at most.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, paid_at, date_finished, job_line_items(type, total, category)")
    .eq("payment_status", "paid");

  // Aggregate by month
  const monthBuckets: Record<number, { totalRevenue: number; partsTotal: number }> = {};
  for (let m = 1; m <= 12; m++) {
    monthBuckets[m] = { totalRevenue: 0, partsTotal: 0 };
  }

  (jobs || []).forEach((job) => {
    // Use paid_at when available, fall back to date_finished (backfilled data)
    const dateStr = job.paid_at || job.date_finished;
    if (!dateStr) return;

    // Convert to ET date string (YYYY-MM-DD) to get correct month.
    // paid_at is a UTC timestamptz; date_finished is a date string.
    const utcDate = new Date(dateStr.includes("T") ? dateStr : dateStr + "T12:00:00Z");
    const etDateStr = utcDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const [etYear, etMonth] = etDateStr.split("-").map(Number);
    if (etYear !== year) return;

    const month = etMonth; // 1-12

    const lineItems = (job.job_line_items as { type: string; total: number; category: string | null }[]) || [];

    lineItems
      .filter((li) => li.category !== INSPECTION_CATEGORY)
      .forEach((li) => {
        const total = li.total || 0;
        monthBuckets[month].totalRevenue += total;
        if (li.type === "part") {
          monthBuckets[month].partsTotal += total;
        }
      });
  });

  // Build month rows
  const months: TaxMonthRow[] = [];
  let ytdRevenue = 0;
  let ytdTaxable = 0;
  let ytdTax = 0;
  let ytdNonTaxable = 0;

  for (let m = 1; m <= 12; m++) {
    const { totalRevenue, partsTotal } = monthBuckets[m];
    const taxCollected = Math.round(partsTotal * taxRate * 100) / 100;
    const nonTaxableAmount = totalRevenue - partsTotal;

    months.push({
      month: MONTH_NAMES[m - 1],
      monthNum: m,
      totalRevenue,
      taxableAmount: partsTotal,
      taxCollected,
      nonTaxableAmount,
    });

    ytdRevenue += totalRevenue;
    ytdTaxable += partsTotal;
    ytdTax += taxCollected;
    ytdNonTaxable += nonTaxableAmount;
  }

  return {
    year,
    taxRate,
    months,
    ytd: {
      totalRevenue: ytdRevenue,
      taxableAmount: ytdTaxable,
      taxCollected: Math.round(ytdTax * 100) / 100,
      nonTaxableAmount: ytdNonTaxable,
    },
  };
}
