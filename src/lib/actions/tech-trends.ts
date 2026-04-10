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
import type { CategoryTrendData, CategoryMetrics } from "@/lib/actions/category-trends";

// ── Raw accumulator (same shape as category-trends) ──────────

interface RawAccum {
  revenue: number;
  partsCost: number;
  jobCount: number;
}

function getOrCreate(map: Record<string, RawAccum>, key: string): RawAccum {
  if (!map[key]) map[key] = { revenue: 0, partsCost: 0, jobCount: 0 };
  return map[key];
}

function finalize(raw: RawAccum): CategoryMetrics {
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

export async function getTechTrendData(
  granularity: Granularity,
  year?: number
): Promise<CategoryTrendData> {
  const supabase = await createClient();
  const today = todayET();
  const { startDate, endDate, resolvedYear } = getDateRange(granularity, today, year);

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, date_finished, assigned_tech, users!jobs_assigned_tech_fkey(name), job_line_items(type, total, quantity, unit_cost, cost, category)")
    .eq("status", "complete")
    .gte("date_finished", startDate)
    .lte("date_finished", endDate)
    .limit(10000);

  const bucketKeys = buildBucketKeys(granularity, startDate, endDate, resolvedYear);
  const rawBuckets = new Map<string, { key: string; label: string; techs: Record<string, RawAccum> }>();
  for (const { key, label } of bucketKeys) {
    rawBuckets.set(key, { key, label, techs: {} });
  }

  const techTotals: Record<string, number> = {};

  type LineItem = {
    type: string;
    total: number;
    quantity: number;
    unit_cost: number;
    cost: number | null;
    category: string | null;
  };

  for (const job of (jobs || [])) {
    if (!job.date_finished) continue;
    const bKey = getBucketKey(job.date_finished, granularity);
    const bucket = rawBuckets.get(bKey);
    if (!bucket) continue;

    const user = job.users as { name: string } | null;
    const techName = user?.name || "Unassigned";

    const lineItems = ((job.job_line_items as LineItem[]) || []).filter(
      (li) => !INSPECTION_CATEGORIES.has(li.category ?? "")
    );

    const accum = getOrCreate(bucket.techs, techName);
    accum.jobCount += 1;

    for (const li of lineItems) {
      const total = li.total || 0;
      accum.revenue += total;
      techTotals[techName] = (techTotals[techName] || 0) + total;

      if (li.type === "part") {
        accum.partsCost += li.cost != null ? li.cost * li.quantity : total * 0.6;
      }
    }
  }

  // Sort techs by total revenue descending
  const categories = Object.entries(techTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  // Finalize buckets
  const buckets = Array.from(rawBuckets.values()).map((raw) => ({
    key: raw.key,
    label: raw.label,
    categories: Object.fromEntries(
      Object.entries(raw.techs).map(([name, accum]) => [name, finalize(accum)])
    ),
  }));

  return {
    granularity,
    year: resolvedYear,
    categories,
    buckets,
  };
}
