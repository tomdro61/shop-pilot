import {
  INSPECTION_RATE_STATE,
  INSPECTION_RATE_TNC,
  INSPECTION_COST_STATE,
} from "@/lib/constants";

export const INSPECTION_CATEGORIES = new Set([
  "Inspection",
  "State Inspection",
  "TNC Inspection",
]);

type LineItem = { total: number; category?: string | null };

/** Sum line item totals for jobs, excluding inspection-category items */
export function sumJobRevenue(
  jobs: { job_line_items: unknown }[] | null
): number {
  return (
    jobs?.reduce((sum, job) => {
      const items = (job.job_line_items as LineItem[]) || [];
      const jobTotal = items
        .filter((li) => !INSPECTION_CATEGORIES.has(li.category ?? ""))
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
