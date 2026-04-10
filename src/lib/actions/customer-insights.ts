"use server";

import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/utils";
import { INSPECTION_CATEGORIES } from "@/lib/utils/revenue";
import {
  type Granularity,
  buildBucketKeys,
  getBucketKey,
  getDateRange,
} from "@/lib/utils/trend-buckets";

// ── Types ────────────────────────────────────────────────────

export interface CustomerInsightsData {
  granularity: Granularity;
  year?: number;
  uniqueCustomers: number;
  newCustomers: number;
  repeatRate: number;
  avgVisitsPerCustomer: number;
  buckets: Array<{
    key: string;
    label: string;
    newCount: number;
    returningCount: number;
  }>;
  topCustomers: Array<{
    id: string;
    name: string;
    revenue: number;
    jobCount: number;
    avgTicket: number;
    lastVisit: string;
  }>;
}

const WALK_IN_ID = "00000000-0000-0000-0000-000000000000";

// ── Main ─────────────────────────────────────────────────────

export async function getCustomerInsightsData(
  granularity: Granularity,
  year?: number
): Promise<CustomerInsightsData> {
  const supabase = await createClient();
  const today = todayET();
  const { startDate, endDate, resolvedYear } = getDateRange(granularity, today, year);

  // 2 parallel queries: period jobs (with details) + all-time jobs (for first-visit map)
  const [periodResult, allTimeResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, customer_id, date_finished, customers(id, first_name, last_name), job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", startDate)
      .lte("date_finished", endDate)
      .limit(10000),
    supabase
      .from("jobs")
      .select("customer_id, date_finished")
      .eq("status", "complete")
      .order("date_finished", { ascending: true })
      .limit(50000),
  ]);

  const periodJobs = periodResult.data || [];
  const allTimeJobs = allTimeResult.data || [];

  // Build first-visit map: customer_id → earliest date_finished
  const firstJobDate = new Map<string, string>();
  for (const job of allTimeJobs) {
    if (!job.customer_id || !job.date_finished || job.customer_id === WALK_IN_ID) continue;
    if (!firstJobDate.has(job.customer_id)) {
      firstJobDate.set(job.customer_id, job.date_finished);
    }
  }

  // Initialize buckets
  const bucketKeys = buildBucketKeys(granularity, startDate, endDate, resolvedYear);
  const rawBuckets = new Map<string, { key: string; label: string; newIds: Set<string>; returningIds: Set<string> }>();
  for (const { key, label } of bucketKeys) {
    rawBuckets.set(key, { key, label, newIds: new Set(), returningIds: new Set() });
  }

  // Track per-customer aggregates for top customers + KPIs
  type CustomerAgg = {
    id: string;
    name: string;
    revenue: number;
    jobCount: number;
    lastVisit: string;
  };
  const customerMap = new Map<string, CustomerAgg>();
  const allCustomerIds = new Set<string>();
  let totalJobsInPeriod = 0;

  type LineItem = { total: number; category: string | null };

  for (const job of periodJobs) {
    if (!job.customer_id || !job.date_finished || job.customer_id === WALK_IN_ID) continue;

    const customer = job.customers as { id: string; first_name: string; last_name: string } | null;
    if (!customer) continue;

    allCustomerIds.add(job.customer_id);
    totalJobsInPeriod += 1;

    // Revenue from line items (excluding inspection categories)
    const lineItems = ((job.job_line_items as LineItem[]) || []).filter(
      (li) => !INSPECTION_CATEGORIES.has(li.category ?? "")
    );
    const jobRevenue = lineItems.reduce((s, li) => s + (li.total || 0), 0);

    // Aggregate per customer
    const existing = customerMap.get(job.customer_id);
    if (existing) {
      existing.revenue += jobRevenue;
      existing.jobCount += 1;
      if (job.date_finished > existing.lastVisit) existing.lastVisit = job.date_finished;
    } else {
      customerMap.set(job.customer_id, {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
        revenue: jobRevenue,
        jobCount: 1,
        lastVisit: job.date_finished,
      });
    }

    // Bucket for new vs returning chart
    const bKey = getBucketKey(job.date_finished, granularity);
    const bucket = rawBuckets.get(bKey);
    if (!bucket) continue;

    const custFirstDate = firstJobDate.get(job.customer_id);
    if (!custFirstDate) continue;

    const custFirstBucket = getBucketKey(custFirstDate, granularity);
    if (custFirstBucket === bKey) {
      bucket.newIds.add(job.customer_id);
    } else if (custFirstDate < job.date_finished) {
      bucket.returningIds.add(job.customer_id);
    }
  }

  // Finalize buckets
  const buckets = Array.from(rawBuckets.values()).map((raw) => ({
    key: raw.key,
    label: raw.label,
    newCount: raw.newIds.size,
    returningCount: raw.returningIds.size,
  }));

  // KPI cards
  const uniqueCustomers = allCustomerIds.size;
  let newCustomers = 0;
  for (const custId of allCustomerIds) {
    const firstDate = firstJobDate.get(custId);
    if (firstDate && firstDate >= startDate && firstDate <= endDate) {
      newCustomers += 1;
    }
  }
  const repeatRate = uniqueCustomers > 0
    ? Math.round(((uniqueCustomers - newCustomers) / uniqueCustomers) * 100 * 10) / 10
    : 0;
  const avgVisitsPerCustomer = uniqueCustomers > 0
    ? Math.round((totalJobsInPeriod / uniqueCustomers) * 10) / 10
    : 0;

  // Top 15 customers by revenue
  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)
    .map((c) => ({
      id: c.id,
      name: c.name,
      revenue: c.revenue,
      jobCount: c.jobCount,
      avgTicket: c.jobCount > 0 ? Math.round((c.revenue / c.jobCount) * 100) / 100 : 0,
      lastVisit: c.lastVisit,
    }));

  return {
    granularity,
    year: resolvedYear,
    uniqueCustomers,
    newCustomers,
    repeatRate,
    avgVisitsPerCustomer,
    buckets,
    topCustomers,
  };
}
