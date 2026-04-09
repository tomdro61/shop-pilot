"use server";

import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/utils";
import { INSPECTION_CATEGORIES } from "@/lib/utils/revenue";
import {
  INSPECTION_RATE_STATE,
  INSPECTION_RATE_TNC,
} from "@/lib/constants";
import {
  subDays,
  subWeeks,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachWeekOfInterval,
  format,
  parseISO,
} from "date-fns";

// ── Types ────────────────────────────────────────────────────

export type Granularity = "day" | "week" | "month";

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

// ── Helpers ──────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDate(dateStr: string): Date {
  return parseISO(dateStr);
}

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

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
}

function emptyRaw(key: string, label: string): RawBucket {
  return {
    key,
    label,
    revenue: 0,
    partsRevenue: 0,
    laborRevenue: 0,
    partsCost: 0,
    jobCount: 0,
    estimatesSent: 0,
    estimatesApproved: 0,
    inspectionStateCount: 0,
    inspectionTncCount: 0,
  };
}

function buildBuckets(granularity: Granularity, startDate: string, endDate: string, year?: number): Map<string, RawBucket> {
  const map = new Map<string, RawBucket>();

  if (granularity === "day") {
    const days = eachDayOfInterval({ start: toDate(startDate), end: toDate(endDate) });
    for (const d of days) {
      const key = toDateStr(d);
      map.set(key, emptyRaw(key, format(d, "MMM d")));
    }
  } else if (granularity === "week") {
    const weeks = eachWeekOfInterval(
      { start: toDate(startDate), end: toDate(endDate) },
      { weekStartsOn: 1 }
    );
    for (const ws of weeks) {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const key = toDateStr(ws);
      const label = `${format(ws, "MMM d")} – ${format(we, "MMM d")}`;
      map.set(key, emptyRaw(key, label));
    }
  } else {
    // month — 12 buckets for the year
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      map.set(key, emptyRaw(key, MONTH_NAMES[m - 1]));
    }
  }

  return map;
}

function getBucketKey(dateStr: string, granularity: Granularity): string {
  if (granularity === "day") {
    return dateStr; // already YYYY-MM-DD
  }
  if (granularity === "week") {
    const ws = startOfWeek(toDate(dateStr), { weekStartsOn: 1 });
    return toDateStr(ws);
  }
  // month
  return dateStr.substring(0, 7); // "YYYY-MM"
}

function sentAtToDateStr(sentAt: string): string {
  // sent_at is a timestamptz — convert to ET date string
  const utcDate = new Date(sentAt);
  return utcDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function finalize(raw: RawBucket): TrendBucket {
  const grossProfit = raw.revenue - raw.partsCost;
  const grossMarginPct = raw.revenue > 0 ? (grossProfit / raw.revenue) * 100 : 0;
  const aro = raw.jobCount > 0 ? raw.revenue / raw.jobCount : 0;
  const estimateCloseRate =
    raw.estimatesSent > 0 ? (raw.estimatesApproved / raw.estimatesSent) * 100 : 0;
  const inspectionCount = raw.inspectionStateCount + raw.inspectionTncCount;
  const inspectionRevenue =
    raw.inspectionStateCount * INSPECTION_RATE_STATE +
    raw.inspectionTncCount * INSPECTION_RATE_TNC;

  return {
    key: raw.key,
    label: raw.label,
    revenue: raw.revenue,
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
  year?: number
): Promise<TrendData> {
  const supabase = await createClient();
  const today = todayET();
  const todayDate = toDate(today);

  // Determine date range
  let startDate: string;
  let endDate: string;
  let resolvedYear = year;

  if (granularity === "day") {
    startDate = toDateStr(subDays(todayDate, 29));
    endDate = today;
  } else if (granularity === "week") {
    const weekStart = startOfWeek(subWeeks(todayDate, 11), { weekStartsOn: 1 });
    startDate = toDateStr(weekStart);
    endDate = today;
  } else {
    resolvedYear = year || todayDate.getFullYear();
    startDate = `${resolvedYear}-01-01`;
    endDate = `${resolvedYear}-12-31`;
  }

  // 3 parallel queries
  const [jobsResult, estimatesResult, inspectionsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, date_finished, job_line_items(type, total, quantity, unit_cost, cost, category)")
      .eq("status", "complete")
      .gte("date_finished", startDate)
      .lte("date_finished", endDate),
    supabase
      .from("estimates")
      .select("id, status, sent_at")
      .in("status", ["sent", "approved"])
      .gte("sent_at", startDate)
      .lte("sent_at", endDate),
    supabase
      .from("daily_inspection_counts")
      .select("date, state_count, tnc_count")
      .gte("date", startDate)
      .lte("date", endDate),
  ]);

  const jobs = jobsResult.data || [];
  const estimates = estimatesResult.data || [];
  const inspections = inspectionsResult.data || [];

  // Initialize buckets
  const bucketMap = buildBuckets(granularity, startDate, endDate, resolvedYear);

  // Aggregate jobs
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

  // Aggregate estimates
  for (const est of estimates) {
    if (!est.sent_at) continue;
    const dateStr = sentAtToDateStr(est.sent_at);
    const bKey = getBucketKey(dateStr, granularity);
    const bucket = bucketMap.get(bKey);
    if (!bucket) continue;

    bucket.estimatesSent += 1;
    if (est.status === "approved") {
      bucket.estimatesApproved += 1;
    }
  }

  // Aggregate inspections
  for (const row of inspections) {
    if (!row.date) continue;
    const bKey = getBucketKey(row.date, granularity);
    const bucket = bucketMap.get(bKey);
    if (!bucket) continue;

    bucket.inspectionStateCount += row.state_count || 0;
    bucket.inspectionTncCount += row.tnc_count || 0;
  }

  // Finalize buckets in order
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
