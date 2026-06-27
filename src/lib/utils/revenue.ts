import {
  INSPECTION_RATE_STATE,
  INSPECTION_RATE_TNC,
  INSPECTION_COST_STATE,
} from "@/lib/constants";

// Excluded from service revenue: inspections are billed separately at fixed
// per-inspection rates (see calcInspectionRevenue), so counting their line
// items here too would double-count. Categories have shipped in mixed casing
// (catalog presets, hand-typed), so match on a normalized key — keys are
// derived from the canonical names through the same normalization as the
// lookup, so a new entry can be added in readable display case.
const INSPECTION_CATEGORIES = ["Inspection", "State Inspection", "TNC Inspection"] as const;
const INSPECTION_CATEGORY_KEYS = new Set(
  INSPECTION_CATEGORIES.map((c) => c.trim().toLowerCase())
);

export function isInspectionCategory(
  category: string | null | undefined
): boolean {
  return INSPECTION_CATEGORY_KEYS.has((category ?? "").trim().toLowerCase());
}

type LineItem = { total: number; category?: string | null };

/** Sum line item totals for jobs, excluding inspection-category items */
export function sumJobRevenue(
  jobs: { job_line_items: unknown }[] | null
): number {
  return (
    jobs?.reduce((sum, job) => {
      const items = (job.job_line_items as LineItem[]) || [];
      const jobTotal = items
        .filter((li) => !isInspectionCategory(li.category))
        .reduce((s, li) => s + (li.total || 0), 0);
      return sum + jobTotal;
    }, 0) || 0
  );
}

/** Compute inspection revenue, cost, and profit from aggregated counts */
export function calcInspectionRevenue(counts: {
  state_count: number;
  tnc_count: number;
}) {
  const stateRevenue = counts.state_count * INSPECTION_RATE_STATE;
  const tncRevenue = counts.tnc_count * INSPECTION_RATE_TNC;
  const stateCost = counts.state_count * INSPECTION_COST_STATE;
  return {
    stateCount: counts.state_count,
    tncCount: counts.tnc_count,
    totalCount: counts.state_count + counts.tnc_count,
    stateRevenue,
    tncRevenue,
    totalRevenue: stateRevenue + tncRevenue,
    totalCost: stateCost,
    totalProfit: stateRevenue - stateCost + tncRevenue,
  };
}

type ManualIncomeRow = { amount: number; shop_keep_pct: number };

/** Sum manual-income revenue (amount) */
export function sumManualIncome(entries: ManualIncomeRow[] | null | undefined): number {
  return entries?.reduce((s, e) => s + (e.amount || 0), 0) || 0;
}

/** Sum manual-income shop-keep profit (amount × shop_keep_pct / 100) */
export function sumManualIncomeProfit(entries: ManualIncomeRow[] | null | undefined): number {
  return entries?.reduce((s, e) => s + (e.amount || 0) * (e.shop_keep_pct || 0) / 100, 0) || 0;
}
