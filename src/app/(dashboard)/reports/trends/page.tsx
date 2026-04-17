import { getTrendData } from "@/lib/actions/trends";
import { TrendsExplorer } from "@/components/dashboard/trends-explorer";
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
    <TrendsExplorer
      data={data}
      initialMetric={metric}
      initialGranularity={granularity}
      initialYear={year}
      initialCustomerType={customerType}
    />
  );
}
