"use server";

import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/utils";
import { INSPECTION_CATEGORIES } from "@/lib/utils/revenue";
import {
  INSPECTION_RATE_STATE,
  INSPECTION_RATE_TNC,
  INSPECTION_COST_STATE,
} from "@/lib/constants";
import {
  type Granularity,
  buildBucketKeys,
  getBucketKey,
  timestampToDateET,
  getDateRange,
} from "@/lib/utils/trend-buckets";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";

// ── Types ────────────────────────────────────────────────────

export type MetricKey =
  | "revenue"
  | "grossProfit"
  | "partsRevenue"
  | "laborRevenue"
  | "partsCost"
  | "grossMarginPct"
  | "jobCount"
  | "aro"
  | "estimateCloseRate"
  | "inspectionCount"
  | "inspectionRevenue";

export interface TrendBucket {
  key: string;
  label: string;
  revenue: number;
  grossProfit: number;
  partsRevenue: number;
  laborRevenue: number;
  partsCost: number;
  grossMarginPct: number;
  jobCount: number;
  aro: number;
  estimateCloseRate: number;
  inspectionCount: number;
  inspectionRevenue: number;
}

export interface TrendData {
  granularity: Granularity;
  year?: number;
  buckets: TrendBucket[];
}

// ── Trend-specific bucket ────────────────────────────────────

interface RawBucket {
  key: string;
  label: string;
  revenue: number;
  partsRevenue: number;
  laborRevenue: number;
  partsCost: number;
  jobCount: number;
  estimatesSent: number;
  estimatesApproved: number;
  inspectionStateCount: number;
  inspectionTncCount: number;
  manualIncome: number;
  manualProfit: number;
}

function buildTrendBuckets(granularity: Granularity, startDate: string, endDate: string, year?: number): Map<string, RawBucket> {
  const map = new Map<string, RawBucket>();
  for (const { key, label } of buildBucketKeys(granularity, startDate, endDate, year)) {
    map.set(key, {
      key, label,
      revenue: 0, partsRevenue: 0, laborRevenue: 0, partsCost: 0, jobCount: 0,
      estimatesSent: 0, estimatesApproved: 0,
      inspectionStateCount: 0, inspectionTncCount: 0,
      manualIncome: 0, manualProfit: 0,
    });
  }
  return map;
}

function finalize(raw: RawBucket): TrendBucket {
  const inspectionCount = raw.inspectionStateCount + raw.inspectionTncCount;
  const inspectionRevenue =
    raw.inspectionStateCount * INSPECTION_RATE_STATE +
    raw.inspectionTncCount * INSPECTION_RATE_TNC;
  const inspectionCost = raw.inspectionStateCount * INSPECTION_COST_STATE;
  const inspectionProfit = inspectionRevenue - inspectionCost;

  const revenue = raw.revenue + inspectionRevenue + raw.manualIncome;
  const grossProfit = (raw.revenue - raw.partsCost) + inspectionProfit + raw.manualProfit;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const aro = raw.jobCount > 0 ? raw.revenue / raw.jobCount : 0;
  const estimateCloseRate =
    raw.estimatesSent > 0 ? (raw.estimatesApproved / raw.estimatesSent) * 100 : 0;

  return {
    key: raw.key,
    label: raw.label,
    revenue,
    grossProfit,
    partsRevenue: raw.partsRevenue,
    laborRevenue: raw.laborRevenue,
    partsCost: raw.partsCost,
    grossMarginPct: Math.round(grossMarginPct * 10) / 10,
    jobCount: raw.jobCount,
    aro: Math.round(aro * 100) / 100,
    estimateCloseRate: Math.round(estimateCloseRate * 10) / 10,
    inspectionCount,
    inspectionRevenue,
  };
}

// ── Main ─────────────────────────────────────────────────────

export async function getTrendData(
  granularity: Granularity,
  year?: number,
  customerType?: string
): Promise<TrendData> {
  const supabase = await createClient();
  const today = todayET();
  const { startDate, endDate, resolvedYear } = getDateRange(granularity, today, year);
  const isFiltered = !!(customerType && customerType !== "all");

  const jobSelect: string = isFiltered
    ? "id, date_finished, customers!inner(customer_type), job_line_items(type, total, quantity, unit_cost, cost, category)"
    : "id, date_finished, job_line_items(type, total, quantity, unit_cost, cost, category)";
  let jobQuery = supabase
    .from("jobs")
    .select(jobSelect)
    .eq("status", "complete")
    .gte("date_finished", startDate)
    .lte("date_finished", endDate)
    .limit(10000);
  if (isFiltered) jobQuery = jobQuery.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");

  // Limit 10000 to override Supabase default 1000-row cap
  const [jobsResult, estimatesResult, inspectionsResult, manualEntries] = await Promise.all([
    jobQuery,
    supabase
      .from("estimates")
      .select("id, status, sent_at")
      .in("status", ["sent", "approved"])
      .gte("sent_at", startDate)
      .lte("sent_at", endDate)
      .limit(10000),
    isFiltered ? Promise.resolve({ data: [] }) : supabase
      .from("daily_inspection_counts")
      .select("date, state_count, tnc_count")
      .gte("date", startDate)
      .lte("date", endDate)
      .limit(10000),
    isFiltered ? Promise.resolve([]) : getManualIncomeForRange(startDate, endDate),
  ]);

  const jobs = (jobsResult.data || []) as any[];
  const estimates = estimatesResult.data || [];
  const inspections = (inspectionsResult as any).data || [];

  const bucketMap = buildTrendBuckets(granularity, startDate, endDate, resolvedYear);

  type LineItem = {
    type: string;
    total: number;
    quantity: number;
    unit_cost: number;
    cost: number | null;
    category: string | null;
  };

  for (const job of jobs) {
    if (!job.date_finished) continue;
    const bKey = getBucketKey(job.date_finished, granularity);
    const bucket = bucketMap.get(bKey);
    if (!bucket) continue;

    const lineItems = ((job.job_line_items as LineItem[]) || []).filter(
      (li) => !INSPECTION_CATEGORIES.has(li.category ?? "")
    );

    bucket.jobCount += 1;

    for (const li of lineItems) {
      const total = li.total || 0;
      bucket.revenue += total;

      if (li.type === "labor") {
        bucket.laborRevenue += total;
      } else if (li.type === "part") {
        bucket.partsRevenue += total;
        bucket.partsCost +=
          li.cost != null ? li.cost * li.quantity : total * 0.6;
      }
    }
  }

  for (const est of estimates) {
    if (!est.sent_at) continue;
    const dateStr = timestampToDateET(est.sent_at);
    const bKey = getBucketKey(dateStr, granularity);
    const bucket = bucketMap.get(bKey);
    if (!bucket) continue;

    bucket.estimatesSent += 1;
    if (est.status === "approved") {
      bucket.estimatesApproved += 1;
    }
  }

  if (!isFiltered) {
    for (const row of inspections) {
      if (!row.date) continue;
      const bKey = getBucketKey(row.date, granularity);
      const bucket = bucketMap.get(bKey);
      if (!bucket) continue;

      bucket.inspectionStateCount += row.state_count || 0;
      bucket.inspectionTncCount += row.tnc_count || 0;
    }
  }

  for (const entry of (isFiltered ? [] : manualEntries)) {
    if (!entry.date) continue;
    const bKey = getBucketKey(entry.date, granularity);
    const bucket = bucketMap.get(bKey);
    if (!bucket) continue;

    bucket.manualIncome += entry.amount;
    bucket.manualProfit += entry.amount * (entry.shop_keep_pct / 100);
  }

  const buckets: TrendBucket[] = [];
  for (const raw of bucketMap.values()) {
    buckets.push(finalize(raw));
  }

  return {
    granularity,
    year: resolvedYear,
    buckets,
  };
}
