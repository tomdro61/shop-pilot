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
  getDateRange,
} from "@/lib/utils/trend-buckets";

// ── Types ────────────────────────────────────────────────────

export type CategoryMetricKey =
  | "revenue"
  | "grossProfit"
  | "jobCount"
  | "aro"
  | "partsCost"
  | "grossMarginPct";

export interface CategoryMetrics {
  revenue: number;
  grossProfit: number;
  partsCost: number;
  jobCount: number;
  aro: number;
  grossMarginPct: number;
}

export interface CategoryTrendBucket {
  key: string;
  label: string;
  categories: Record<string, CategoryMetrics>;
}

export interface CategoryTrendData {
  granularity: Granularity;
  year?: number;
  categories: string[];
  buckets: CategoryTrendBucket[];
}

// ── Raw accumulator ──────────────────────────────────────────

interface RawCategoryAccum {
  revenue: number;
  partsRevenue: number;
  laborRevenue: number;
  partsCost: number;
  jobCount: number;
}

function emptyAccum(): RawCategoryAccum {
  return { revenue: 0, partsRevenue: 0, laborRevenue: 0, partsCost: 0, jobCount: 0 };
}

function getOrCreate(
  map: Record<string, RawCategoryAccum>,
  cat: string
): RawCategoryAccum {
  if (!map[cat]) map[cat] = emptyAccum();
  return map[cat];
}

function finalizeCategory(raw: RawCategoryAccum): CategoryMetrics {
  const grossProfit = raw.revenue - raw.partsCost;
  return {
    revenue: raw.revenue,
    grossProfit,
    partsCost: raw.partsCost,
    jobCount: raw.jobCount,
    aro: raw.jobCount > 0 ? Math.round((raw.revenue / raw.jobCount) * 100) / 100 : 0,
    grossMarginPct: raw.revenue > 0 ? Math.round(((grossProfit / raw.revenue) * 100) * 10) / 10 : 0,
  };
}

// ── Main ─────────────────────────────────────────────────────

const MAX_CATEGORIES = 8;

export async function getCategoryTrendData(
  granularity: Granularity,
  year?: number
): Promise<CategoryTrendData> {
  const supabase = await createClient();
  const today = todayET();
  const { startDate, endDate, resolvedYear } = getDateRange(granularity, today, year);

  // 2 parallel queries (no estimates needed for category breakdown)
  const [jobsResult, inspectionsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, date_finished, job_line_items(type, total, quantity, unit_cost, cost, category)")
      .eq("status", "complete")
      .gte("date_finished", startDate)
      .lte("date_finished", endDate)
      .limit(10000),
    supabase
      .from("daily_inspection_counts")
      .select("date, state_count, tnc_count")
      .gte("date", startDate)
      .lte("date", endDate)
      .limit(10000),
  ]);

  const jobs = jobsResult.data || [];
  const inspections = inspectionsResult.data || [];

  // Initialize buckets — each bucket has a Record<string, RawCategoryAccum>
  const bucketKeys = buildBucketKeys(granularity, startDate, endDate, resolvedYear);
  const rawBuckets = new Map<string, { key: string; label: string; categories: Record<string, RawCategoryAccum> }>();
  for (const { key, label } of bucketKeys) {
    rawBuckets.set(key, { key, label, categories: {} });
  }

  // Track total revenue per category for ordering
  const categoryTotals: Record<string, number> = {};

  type LineItem = {
    type: string;
    total: number;
    quantity: number;
    unit_cost: number;
    cost: number | null;
    category: string | null;
  };

  // Aggregate jobs — line-item-level category attribution for revenue/cost
  for (const job of jobs) {
    if (!job.date_finished) continue;
    const bKey = getBucketKey(job.date_finished, granularity);
    const bucket = rawBuckets.get(bKey);
    if (!bucket) continue;

    const lineItems = ((job.job_line_items as LineItem[]) || []).filter(
      (li) => !INSPECTION_CATEGORIES.has(li.category ?? "")
    );

    // Revenue per line item category (for determining job's primary category)
    const liCatRevenue: Record<string, number> = {};

    for (const li of lineItems) {
      const cat = li.category || "Uncategorized";
      const total = li.total || 0;
      const accum = getOrCreate(bucket.categories, cat);

      accum.revenue += total;
      liCatRevenue[cat] = (liCatRevenue[cat] || 0) + total;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + total;

      if (li.type === "labor") {
        accum.laborRevenue += total;
      } else if (li.type === "part") {
        accum.partsRevenue += total;
        accum.partsCost += li.cost != null ? li.cost * li.quantity : total * 0.6;
      }
    }

    // Job count goes to the highest-revenue category (matches revenue report)
    const primaryCat = Object.entries(liCatRevenue).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (primaryCat) {
      getOrCreate(bucket.categories, primaryCat).jobCount += 1;
    }
  }

  // Aggregate inspections as categories
  for (const row of inspections) {
    if (!row.date) continue;
    const bKey = getBucketKey(row.date, granularity);
    const bucket = rawBuckets.get(bKey);
    if (!bucket) continue;

    if (row.state_count > 0) {
      const accum = getOrCreate(bucket.categories, "State Inspection");
      const rev = row.state_count * INSPECTION_RATE_STATE;
      const cost = row.state_count * INSPECTION_COST_STATE;
      accum.revenue += rev;
      accum.laborRevenue += rev;
      accum.partsCost += cost;
      accum.jobCount += row.state_count;
      categoryTotals["State Inspection"] = (categoryTotals["State Inspection"] || 0) + rev;
    }

    if (row.tnc_count > 0) {
      const accum = getOrCreate(bucket.categories, "TNC Inspection");
      const rev = row.tnc_count * INSPECTION_RATE_TNC;
      accum.revenue += rev;
      accum.laborRevenue += rev;
      accum.jobCount += row.tnc_count;
      categoryTotals["TNC Inspection"] = (categoryTotals["TNC Inspection"] || 0) + rev;
    }
  }

  // Order categories by total revenue, cap at MAX_CATEGORIES + "Other"
  const sortedCats = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1]);

  let categories: string[];
  let rollIntoOther: Set<string> | null = null;

  if (sortedCats.length > MAX_CATEGORIES) {
    categories = sortedCats.slice(0, MAX_CATEGORIES).map(([cat]) => cat);
    categories.push("Other");
    rollIntoOther = new Set(sortedCats.slice(MAX_CATEGORIES).map(([cat]) => cat));
  } else {
    categories = sortedCats.map(([cat]) => cat);
  }

  // Finalize buckets — roll up "Other" and compute derived metrics
  const buckets: CategoryTrendBucket[] = [];
  for (const raw of rawBuckets.values()) {
    const finalCats: Record<string, CategoryMetrics> = {};

    if (rollIntoOther) {
      const otherAccum = emptyAccum();
      for (const [cat, accum] of Object.entries(raw.categories)) {
        if (rollIntoOther.has(cat)) {
          otherAccum.revenue += accum.revenue;
          otherAccum.partsRevenue += accum.partsRevenue;
          otherAccum.laborRevenue += accum.laborRevenue;
          otherAccum.partsCost += accum.partsCost;
          otherAccum.jobCount += accum.jobCount;
        } else {
          finalCats[cat] = finalizeCategory(accum);
        }
      }
      if (otherAccum.revenue > 0 || otherAccum.jobCount > 0) {
        finalCats["Other"] = finalizeCategory(otherAccum);
      }
    } else {
      for (const [cat, accum] of Object.entries(raw.categories)) {
        finalCats[cat] = finalizeCategory(accum);
      }
    }

    buckets.push({ key: raw.key, label: raw.label, categories: finalCats });
  }

  return {
    granularity,
    year: resolvedYear,
    categories,
    buckets,
  };
}
