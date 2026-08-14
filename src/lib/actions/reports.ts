"use server";

import { createClient } from "@/lib/supabase/server";
import { subDays, differenceInDays, parseISO } from "date-fns";
import { todayET } from "@/lib/utils";
import { getInspectionCountsRange } from "@/lib/actions/inspections";
import { isInspectionCategory, calcInspectionRevenue, sumManualIncome, sumManualIncomeProfit } from "@/lib/utils/revenue";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
import { getShopSettings } from "@/lib/actions/settings";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { assertComplete, assertCount } from "@/lib/supabase/assert-complete";

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Shapes of the dynamically-built selects in getReportData. Declared because a
// select string chosen at runtime defeats Supabase's literal-type inference.
// One type per select — deliberately NOT shared. `priorSelect` omits
// `unit_cost`, so a shared type would declare a field the query never fetches:
// `undefined` at runtime with no type error, which is the exact trap this file
// was just fixed to close.
type CurrentJobLineItem = {
  type: string;
  total: number;
  quantity: number;
  unit_cost: number;
  cost: number | null;
  category: string | null;
};
type PriorJobLineItem = Omit<CurrentJobLineItem, "unit_cost">;

type ReportCurrentJobRow = {
  id: string;
  assigned_tech: string | null;
  users: { name: string } | null;
  customers: { customer_type: string } | null;
  job_line_items: CurrentJobLineItem[] | null;
};
type ReportPriorJobRow = {
  id: string;
  job_line_items: PriorJobLineItem[] | null;
};
type FleetARJobRow = {
  id: string;
  date_finished: string | null;
  payment_status: string;
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    customer_type: string;
    fleet_account: string | null;
  } | null;
  job_line_items: { total: number | null }[] | null;
};
type DailySummaryJobRow = {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  assigned_tech: string | null;
  users: { name: string } | null;
  customers: { first_name: string; last_name: string } | null;
  job_line_items: { total: number | null; category: string | null }[] | null;
};

export async function getReportData(params: {
  from: string;
  to: string;
  priorFrom: string | null;
  priorTo: string | null;
  isAllTime: boolean;
  customerType?: string;
}) {
  const { from: start, to: end, priorFrom: priorStart, priorTo: priorEnd, isAllTime, customerType } = params;
  const supabase = await createClient();
  const isFiltered = !!(customerType && customerType !== "all");

  // ONE query for current period — includes tech and line item data for all aggregations
  const currentSelect: string = isFiltered
    ? "id, assigned_tech, users!jobs_assigned_tech_fkey(name), customers!inner(customer_type), job_line_items(type, total, quantity, unit_cost, cost, category)"
    : "id, assigned_tech, users!jobs_assigned_tech_fkey(name), customers(customer_type), job_line_items(type, total, quantity, unit_cost, cost, category)";
  // Paged, not a single read. The "All Time" preset resolves to 2000-01-01
  // (date-range.ts) and "This Year" covers essentially every job in the
  // database, so this query was already returning the first 1000 of 1,002
  // completed jobs and understating revenue, gross profit, the tech
  // leaderboard and category profitability with no error anywhere.
  const currentJobsPromise = fetchAllRows<ReportCurrentJobRow>((from, to) => {
    let q = supabase
      .from("jobs")
      .select(currentSelect, { count: "exact" })
      .eq("status", "complete")
      .gte("date_finished", start)
      .lte("date_finished", end)
      .order("id", { ascending: true })
      .range(from, to);
    if (isFiltered) q = q.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
    return q.returns<ReportCurrentJobRow[]>();
  }, "jobs for revenue report");

  // ONE query for prior period (count + revenue + gross profit)
  const priorSelect: string = isFiltered
    ? "id, customers!inner(customer_type), job_line_items(type, total, cost, quantity, category)"
    : "id, job_line_items(type, total, cost, quantity, category)";
  const priorJobsPromise: Promise<ReportPriorJobRow[]> =
    priorStart && priorEnd
      ? fetchAllRows<ReportPriorJobRow>((from, to) => {
          let q = supabase
            .from("jobs")
            .select(priorSelect, { count: "exact" })
            .eq("status", "complete")
            .gte("date_finished", priorStart)
            .lte("date_finished", priorEnd)
            .order("id", { ascending: true })
            .range(from, to);
          if (isFiltered) q = q.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
          return q.returns<ReportPriorJobRow[]>();
        }, "prior-period jobs for revenue report")
      : Promise.resolve([]);

  // Estimate close rate needs two numbers, not two row sets. Counting with
  // `head: true` is immune to the row cap by construction — fetching the rows
  // and guarding them would make the whole report un-openable once the shop
  // passes 1000 sent estimates, on the same unbounded range ("All Time",
  // "This Year") that forced the jobs reads above to page.
  const countEstimates = (from: string, to: string, approvedOnly: boolean) => {
    const q = supabase
      .from("estimates")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", from)
      .lte("sent_at", to);
    return approvedOnly ? q.eq("status", "approved") : q.in("status", ["sent", "approved"]);
  };

  const [
    currentJobs, priorJobs,
    estimatesSent, estimatesApproved, priorEstimatesSent, priorEstimatesApproved,
    inspectionTotals, manualEntries,
    priorInspectionTotals, priorManualEntries,
  ] = await Promise.all([
    currentJobsPromise, priorJobsPromise,
    assertCount(countEstimates(start, end, false), "estimates sent"),
    assertCount(countEstimates(start, end, true), "estimates approved"),
    priorStart && priorEnd ? assertCount(countEstimates(priorStart, priorEnd, false), "prior estimates sent") : Promise.resolve(0),
    priorStart && priorEnd ? assertCount(countEstimates(priorStart, priorEnd, true), "prior estimates approved") : Promise.resolve(0),
    // Only fetched when they'll actually be used — the customer-type filter
    // discards both below, and a failed read shouldn't take down a report that
    // was never going to show the value.
    isFiltered ? Promise.resolve({ state_count: 0, tnc_count: 0 }) : getInspectionCountsRange(start, end),
    isFiltered ? Promise.resolve([]) : getManualIncomeForRange(start, end),
    priorStart && priorEnd && !isFiltered ? getInspectionCountsRange(priorStart, priorEnd) : Promise.resolve({ state_count: 0, tnc_count: 0 }),
    priorStart && priorEnd && !isFiltered ? getManualIncomeForRange(priorStart, priorEnd) : Promise.resolve([]),
  ]);

  // --- Aggregate everything from the single current-period result ---

  type LineItem = { type: string; total: number; quantity: number; unit_cost: number; cost: number | null; category: string | null };

  function getLineItems(job: { job_line_items: unknown }): LineItem[] {
    return (job.job_line_items as LineItem[]) || [];
  }

  function sumLineItemTotals(job: { job_line_items: unknown }): number {
    return getLineItems(job)
      .filter((li) => !isInspectionCategory(li.category))
      .reduce((s, li) => s + (li.total || 0), 0);
  }

  // Job count + revenue
  const jobsCurrent = currentJobs.length;
  let revenueCurrent = currentJobs.reduce((sum, job) => sum + sumLineItemTotals(job), 0);

  // Prior period — always initialize to 0 when a prior period exists so trends show.
  // null means "no comparison available" (all-time mode only).
  const hasPrior = priorStart !== null;
  const jobsPrior = hasPrior ? priorJobs.length : null;
  let revenuePrior: number | null = hasPrior ? 0 : null;
  let grossProfitPrior: number | null = hasPrior ? 0 : null;
  if (priorJobs.length > 0) {
    let priorRev = 0;
    let priorPartsCost = 0;
    priorJobs.forEach((job) => {
      const items = (job.job_line_items as { type: string; total: number; cost: number | null; quantity: number; category: string | null }[]) || [];
      items.filter((li) => !isInspectionCategory(li.category)).forEach((li) => {
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
  // Jobs by customer type
  const custTypeCounts: Record<string, number> = {};
  const custTypeRevenue: Record<string, number> = {};

  currentJobs.forEach((job) => {
    const user = job.users as { name: string } | null;
    const techName = user?.name || "Unassigned";
    const custType = (job.customers as { customer_type: string } | null)?.customer_type || "retail";
    const lineItems = getLineItems(job).filter((li) => !isInspectionCategory(li.category));
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

    // Customer type counts + revenue
    custTypeCounts[custType] = (custTypeCounts[custType] || 0) + 1;
    custTypeRevenue[custType] = (custTypeRevenue[custType] || 0) + jobTotal;

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

  let totalRevenue = laborRevenue + partsRevenue;
  const totalPartsCost = totalActualPartsCost + totalEstimatedPartsCost;
  let grossProfit = totalRevenue - totalPartsCost;
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

  // Customer type breakdown
  const customerTypeBreakdown = Object.entries(custTypeRevenue)
    .map(([label, revenue]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      revenue,
      jobCount: custTypeCounts[label] || 0,
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

  const inspCalc = isFiltered ? null : calcInspectionRevenue(inspectionTotals);
  const inspectionCount = inspCalc?.totalCount ?? 0;
  const inspectionRevenue = inspCalc?.totalRevenue ?? 0;
  const inspectionCost = inspCalc?.totalCost ?? 0;
  const inspectionProfit = inspCalc?.totalProfit ?? 0;

  // Inject inspection types into category breakdown and profitability (skip when filtering by customer type)
  if (inspCalc && inspCalc.stateCount > 0) {
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
  if (inspCalc && inspCalc.tncCount > 0) {
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
  const manualEntriesForTotal = isFiltered ? [] : manualEntries;
  let manualIncomeTotal = 0;
  let manualProfitTotal = 0;
  const manualByCategory: Record<string, { revenue: number; cost: number }> = {};

  for (const entry of manualEntriesForTotal) {
    const profit = entry.amount * (entry.shop_keep_pct / 100);
    const cost = entry.amount - profit;
    manualIncomeTotal += entry.amount;
    manualProfitTotal += profit;
    if (!manualByCategory[entry.category]) {
      manualByCategory[entry.category] = { revenue: 0, cost: 0 };
    }
    manualByCategory[entry.category].revenue += entry.amount;
    manualByCategory[entry.category].cost += cost;
  }

  revenueCurrent += manualIncomeTotal;
  totalRevenue += manualIncomeTotal;
  grossProfit += manualProfitTotal;

  // Inject manual income categories into breakdown and profitability
  for (const [cat, data] of Object.entries(manualByCategory)) {
    const catProfit = data.revenue - data.cost;
    const margin = data.revenue > 0 ? (catProfit / data.revenue) * 100 : 0;
    categoryBreakdown.push({ category: cat, revenue: data.revenue, jobCount: 0 });
    profitability.push({
      category: cat,
      revenue: data.revenue,
      partsCost: data.cost,
      partsRevenue: 0,
      laborRevenue: data.revenue,
      grossProfit: catProfit,
      margin,
      hasEstimatedCosts: false,
    });
  }

  categoryBreakdown.sort((a, b) => b.revenue - a.revenue);
  profitability.sort((a, b) => b.revenue - a.revenue);

  // Prior period comparisons (data already fetched in parallel above)
  let inspectionCountPrior: number | null = null;
  let inspectionProfitPrior: number | null = null;
  if (priorStart && priorEnd && !isFiltered) {
    const priorInspCalc = calcInspectionRevenue(priorInspectionTotals);
    inspectionCountPrior = priorInspCalc.totalCount;
    inspectionProfitPrior = priorInspCalc.totalProfit;
    if (grossProfitPrior !== null) grossProfitPrior += priorInspCalc.totalProfit;
    if (revenuePrior !== null) revenuePrior += priorInspCalc.totalRevenue;

    if (revenuePrior !== null) revenuePrior += sumManualIncome(priorManualEntries);
    if (grossProfitPrior !== null) grossProfitPrior += sumManualIncomeProfit(priorManualEntries);
  }

  // Estimate close rate (counts come from head queries above)
  const estimateCloseRate = estimatesSent > 0 ? (estimatesApproved / estimatesSent) * 100 : 0;
  const priorEstimateCloseRate = priorEstimatesSent > 0 ? (priorEstimatesApproved / priorEstimatesSent) * 100 : 0;

  // Computed comparison values
  const totalGrossProfit = grossProfit + inspectionProfit;
  const avgTicketPrior = jobsPrior && jobsPrior > 0 && revenuePrior !== null ? revenuePrior / jobsPrior : hasPrior ? 0 : null;

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
    customerTypeBreakdown,
    techProfitBreakdown,
    estimateCloseRate: { rate: estimateCloseRate, approved: estimatesApproved, sent: estimatesSent },
    priorEstimateCloseRate: hasPrior ? { rate: priorEstimateCloseRate } : null,
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
  const query = supabase
    .from("jobs")
    .select("id, date_finished, payment_status, customers!inner(id, first_name, last_name, customer_type, fleet_account), job_line_items(total)", { count: "exact" })
    .eq("customers.customer_type", "fleet")
    .eq("status", "complete")
    .neq("payment_status", "paid")
    .neq("payment_status", "waived")
    .order("id", { ascending: true })
    .returns<FleetARJobRow[]>();

  // `error` used to be discarded and the result read as `data?.forEach`, so a
  // failed query returned [] — and this is exposed to the AI as `get_ar_summary`,
  // which would then tell the owner "no outstanding fleet receivables, all
  // accounts are current". Unpaid fleet jobs also accumulate, so the read needs
  // the truncation guard as well as the error check.
  const data = assertComplete(await query, "fleet A/R jobs");

  const now = new Date();
  const accounts: Record<string, { current: number; days31to60: number; days60plus: number; total: number }> = {};

  data.forEach((job) => {
    const customer = job.customers;
    const accountName = customer?.fleet_account || `${customer?.first_name} ${customer?.last_name}`;
    const jobTotal = (job.job_line_items ?? []).reduce((s, li) => s + (li.total || 0), 0);

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
  const today = todayET();

  // Jobs received or worked on today. `error` used to be discarded and the
  // result collapsed with `|| []`, so a failed read reported 0 jobs, $0 revenue
  // and no tech activity — indistinguishable from a closed day, on the read the
  // AI answers "how did we do today?" with, and the one most likely to be used
  // against the cash drawer.
  const jobs = assertComplete(
    await supabase
      .from("jobs")
      .select(
        "id, status, payment_status, payment_method, assigned_tech, users!jobs_assigned_tech_fkey(name), customers(first_name, last_name), job_line_items(total, category)",
        { count: "exact" }
      )
      .or(`date_received.eq.${today},date_finished.eq.${today}`)
      .order("id", { ascending: true })
      .returns<DailySummaryJobRow[]>(),
    "today's jobs"
  );

  // Revenue by payment method
  const revenueByMethod: Record<string, number> = {};
  let totalRevenue = 0;

  jobs.forEach((job) => {
    if (job.payment_status === "paid" || job.status === "complete") {
      const jobTotal = (job.job_line_items ?? [])
        .filter((li) => !isInspectionCategory(li.category))
        .reduce((s, li) => s + (li.total || 0), 0);
      const method = job.payment_method || "unrecorded";
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

type TaxReportJobRow = {
  paid_at: string | null;
  date_finished: string | null;
  charge_sales_tax: boolean | null;
  job_line_items: { type: string; total: number | null; category: string | null }[] | null;
};

export async function getTaxReportData(year: number, customerType?: string): Promise<TaxReportData> {
  const supabase = await createClient();
  const isFiltered = !!(customerType && customerType !== "all");

  const jobSelect: string = isFiltered
    ? "id, paid_at, date_finished, charge_sales_tax, customers!inner(customer_type), job_line_items(type, total, category)"
    : "id, paid_at, date_finished, charge_sales_tax, job_line_items(type, total, category)";
  // Bound the read to the requested year. Without it this asks for every paid
  // job in the shop's history and narrows to `year` in JS below, which had it
  // 17 rows from the 1000-row cap in Aug 2026 — on the surface used for DOR
  // filings, where a truncated read understates a filed return.
  //
  // Deliberately one day wider on each side than the JS filter: rows are
  // bucketed by ET and `paid_at` is a UTC instant, so a job paid 8pm Dec 31 ET
  // carries a Jan 1 UTC timestamp. This must never exclude a row the JS filter
  // would keep.
  //
  // The filter alone is NOT sufficient: as of 2026 every paid job in the
  // database falls in the current filing year, so narrowing by year narrows
  // nothing. Hence the paging below — a year of jobs will exceed one response
  // within days, and this report must stay correct through it.
  const paidFrom = `${year - 1}-12-31T00:00:00Z`;
  const paidTo = `${year + 1}-01-02T00:00:00Z`;
  const finishedFrom = `${year - 1}-12-31`;
  const finishedTo = `${year + 1}-01-01`;

  const jobsPromise = fetchAllRows<TaxReportJobRow>((from, to) => {
    let q = supabase
      .from("jobs")
      .select(jobSelect, { count: "exact" })
      .eq("payment_status", "paid")
      // `paid_at` when set, else `date_finished` — mirroring the fallback at
      // the bucketing step, so neither shape is dropped.
      .or(
        `and(paid_at.gte.${paidFrom},paid_at.lte.${paidTo}),` +
          `and(paid_at.is.null,date_finished.gte.${finishedFrom},date_finished.lte.${finishedTo})`
      )
      // Stable sort is required for correct paging.
      .order("id", { ascending: true })
      .range(from, to);
    if (isFiltered) q = q.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
    // `.returns<T>()` is postgrest-js's sanctioned override for a dynamically
    // built select string, which defeats its literal-type inference. Preferred
    // over a cast through `unknown` — the builder still type-checks the shape.
    return q.returns<TaxReportJobRow[]>();
  }, "jobs for tax report");

  const [jobs, taxManualEntries, settings] = await Promise.all([
    jobsPromise,
    isFiltered ? Promise.resolve([]) : getManualIncomeForRange(`${year}-01-01`, `${year}-12-31`),
    getShopSettings(),
  ]);
  // Read the live rate from settings (don't hard-code) so the report matches the
  // rate actually charged on invoices.
  //
  // Do NOT fall back to the statutory rate here. `shop_settings.tax_rate` is NOT
  // NULL, so `settings` is only null when getShopSettings' read FAILED (or no
  // row exists) — meaning a fallback isn't a default, it's a guess printed on a
  // DOR filing surface, and getShopSettings is React-cached so one blip applies
  // it to the whole render. If the shop charges anything other than the
  // statutory rate, every month and the YTD row would be wrong and captioned
  // as intentional.
  if (!settings) {
    throw new Error(
      "Failed to load shop settings — refusing to render a tax report with a guessed rate."
    );
  }
  const taxRate = settings.tax_rate;

  // Aggregate by month
  const monthBuckets: Record<number, { totalRevenue: number; partsTotal: number }> = {};
  for (let m = 1; m <= 12; m++) {
    monthBuckets[m] = { totalRevenue: 0, partsTotal: 0 };
  }

  jobs.forEach((job) => {
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

    const lineItems = job.job_line_items ?? [];
    // A job with sales tax turned off bills its parts, but they are NOT taxable
    // (e.g. outsourced parts the shop didn't buy) — count them as revenue but
    // exclude from the taxable base so the MA DOR filing isn't overstated.
    const chargeTax = job.charge_sales_tax !== false;

    lineItems
      .filter((li) => !isInspectionCategory(li.category))
      .forEach((li) => {
        const total = li.total || 0;
        monthBuckets[month].totalRevenue += total;
        if (li.type === "part" && chargeTax) {
          monthBuckets[month].partsTotal += total;
        }
      });
  });

  for (const entry of taxManualEntries) {
    if (!entry.date) continue;
    const month = parseInt(entry.date.substring(5, 7), 10);
    if (month >= 1 && month <= 12) {
      monthBuckets[month].totalRevenue += entry.amount;
    }
  }

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
