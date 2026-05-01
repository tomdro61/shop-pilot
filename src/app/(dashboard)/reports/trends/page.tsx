import { getTrendData } from "@/lib/actions/trends";
import { TrendsExplorer } from "@/components/dashboard/trends-explorer";
import { ReportsNav } from "@/components/dashboard/reports-nav";
import { TrendingUp } from "lucide-react";
import type { Granularity } from "@/lib/utils/trend-buckets";
import type { MetricKey } from "@/lib/actions/trends";

export const metadata = {
  title: "Trends Explorer | ShopPilot",
};

const VALID_GRANULARITIES = new Set(["day", "week", "month"]);
const VALID_METRICS = new Set([
  "revenue", "grossProfit", "partsRevenue", "laborRevenue", "partsCost",
  "grossMarginPct", "jobCount", "aro", "estimateCloseRate",
  "inspectionCount", "inspectionRevenue",
]);

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string; year?: string; metric?: string; customerType?: string }>;
}) {
  const params = await searchParams;

  const granularity: Granularity = VALID_GRANULARITIES.has(params.granularity || "")
    ? (params.granularity as Granularity)
    : "month";

  const currentYear = new Date().getFullYear();
  const year = params.year ? parseInt(params.year, 10) : currentYear;

  const metric: MetricKey = VALID_METRICS.has(params.metric || "")
    ? (params.metric as MetricKey)
    : "revenue";

  const customerType = params.customerType || "all";
  const data = await getTrendData(granularity, year, customerType);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
          <TrendingUp className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Trends Explorer
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Metrics over time.
          </p>
        </div>
      </div>
      <ReportsNav />
      <TrendsExplorer
        data={data}
        initialMetric={metric}
        initialGranularity={granularity}
        initialYear={year}
        initialCustomerType={customerType}
      />
    </>
  );
}
