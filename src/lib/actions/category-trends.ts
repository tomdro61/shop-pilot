"use server";

import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/utils";
import { isInspectionCategory } from "@/lib/utils/revenue";
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
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { assertComplete } from "@/lib/supabase/assert-complete";
import type { Tables } from "@/types/supabase";

type CategoryLineItem = Pick<
  Tables<"job_line_items">,
  "type" | "total" | "quantity" | "unit_cost" | "cost" | "category"
>;
type CategoryJobRow = Pick<Tables<"jobs">, "id" | "date_finished"> & {
  job_line_items: CategoryLineItem[] | null;
};

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

const MAX_CATEGORIES = 20;

export async function getCategoryTrendData(
  granularity: Granularity,
  year?: number,
  customerType?: string
): Promise<CategoryTrendData> {
  const supabase = await createClient();
  const today = todayET();
  const { startDate, endDate, resolvedYear } = getDateRange(granularity, today, year);
  const isFiltered = !!(customerType && customerType !== "all");

  const jobSelect: string = isFiltered
    ? "id, date_finished, customers!inner(customer_type), job_line_items(type, total, quantity, unit_cost, cost, category)"
    : "id, date_finished, job_line_items(type, total, quantity, unit_cost, cost, category)";
  // Paged, not a single read. The "month" granularity spans a whole calendar
  // year of completed jobs, and `.limit()` is clamped by api.max_rows (1000)
  // rather than raising it, with no error — so once the year passed 1000
  // completed jobs this silently kept 1000 and dropped the rest, understating
  // every bucket it dropped a job from.
  const jobsPromise = fetchAllRows<CategoryJobRow>((from, to) => {
    let q = supabase
      .from("jobs")
      .select(jobSelect, { count: "exact" })
      .eq("status", "complete")
      .gte("date_finished", startDate)
      .lte("date_finished", endDate)
      .order("id", { ascending: true })
      .range(from, to);
    if (isFiltered) q = q.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
    return q.returns<CategoryJobRow[]>();
  }, "jobs for service-mix trends");

  const [jobs, inspectionsResult, manualEntries] = await Promise.all([
    jobsPromise,
    isFiltered
      ? Promise.resolve(null)
      : supabase
          .from("daily_inspection_counts")
          .select("date, state_count, tnc_count", { count: "exact" })
          .gte("date", startDate)
          .lte("date", endDate),
    isFiltered ? Promise.resolve([]) : getManualIncomeForRange(startDate, endDate),
  ]);

  // daily_inspection_counts is one row per date, so a calendar year is at most
  // 366 — but `error` used to be discarded here, and a failed read then read as
  // zero. The "State Inspection" and "TNC Inspection" categories are built
  // solely from these rows, so they vanished from the chart entirely rather
  // than plotting zero.
  const inspections = inspectionsResult
    ? assertComplete(inspectionsResult, "inspection counts for service-mix trends")
    : [];

  // Initialize buckets — each bucket has a Record<string, RawCategoryAccum>
  const bucketKeys = buildBucketKeys(granularity, startDate, endDate, resolvedYear);
  const rawBuckets = new Map<string, { key: string; label: string; categories: Record<string, RawCategoryAccum> }>();
  for (const { key, label } of bucketKeys) {
    rawBuckets.set(key, { key, label, categories: {} });
  }

  // Track total revenue per category for ordering
  const categoryTotals: Record<string, number> = {};

  // Aggregate jobs — line-item-level category attribution for revenue/cost
  for (const job of jobs) {
    if (!job.date_finished) continue;
    const bKey = getBucketKey(job.date_finished, granularity);
    const bucket = rawBuckets.get(bKey);
    if (!bucket) continue;

    const lineItems = (job.job_line_items ?? []).filter(
      (li) => !isInspectionCategory(li.category)
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

  // Aggregate inspections as categories (skip when filtering by customer type)
  for (const row of inspections) {
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

  // Aggregate manual income as categories
  for (const entry of manualEntries) {
    if (!entry.date) continue;
    const bKey = getBucketKey(entry.date, granularity);
    const bucket = rawBuckets.get(bKey);
    if (!bucket) continue;

    const accum = getOrCreate(bucket.categories, entry.category);
    accum.revenue += entry.amount;
    accum.partsCost += entry.amount * (1 - entry.shop_keep_pct / 100);
    accum.laborRevenue += entry.amount;
    categoryTotals[entry.category] = (categoryTotals[entry.category] || 0) + entry.amount;
  }

  // Order categories by total revenue, cap at MAX_CATEGORIES + "Other"
  const sortedCats = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1]);

  let categories: string[];
  let rollIntoOther: Set<string> | null = null;

  if (sortedCats.length > MAX_CATEGORIES) {
    categories = sortedCats.slice(0, MAX_CATEGORIES).map(([cat]) => cat);
    rollIntoOther = new Set(sortedCats.slice(MAX_CATEGORIES).map(([cat]) => cat));
    // If a real "Other" category is already in the top N, fold its values into
    // the rollup so we don't end up with two "Other" entries in the chart and
    // the real data isn't overwritten by the rollup total.
    if (categories.includes("Other")) {
      categories = categories.filter((c) => c !== "Other");
      rollIntoOther.add("Other");
    }
    categories.push("Other");
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
