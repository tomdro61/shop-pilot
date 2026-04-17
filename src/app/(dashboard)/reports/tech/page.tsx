import { getTechTrendData } from "@/lib/actions/tech-trends";
import { CategoryDeepDive } from "@/components/dashboard/category-deep-dive";
import type { Granularity } from "@/lib/utils/trend-buckets";
import type { CategoryMetricKey } from "@/lib/actions/category-trends";

export const metadata = {
  title: "Tech Scoreboard | ShopPilot",
};

const VALID_GRANULARITIES = new Set(["day", "week", "month"]);
const VALID_METRICS = new Set([
  "revenue", "grossProfit", "jobCount", "aro", "partsCost", "grossMarginPct",
]);

export default async function TechScoreboardPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string; year?: string; metric?: string; category?: string; customerType?: string }>;
}) {
  const params = await searchParams;

  const granularity: Granularity = VALID_GRANULARITIES.has(params.granularity || "")
    ? (params.granularity as Granularity)
    : "month";

  const currentYear = new Date().getFullYear();
  const year = params.year ? parseInt(params.year, 10) : currentYear;

  const metric: CategoryMetricKey = VALID_METRICS.has(params.metric || "")
    ? (params.metric as CategoryMetricKey)
    : "revenue";

  const tech = params.category || "all";
  const customerType = params.customerType || "all";

  const data = await getTechTrendData(granularity, year, customerType);

  return (
    <CategoryDeepDive
      data={data}
      initialCategory={tech}
      initialMetric={metric}
      initialGranularity={granularity}
      initialYear={year}
      groupLabel="Tech"
      basePath="/reports/tech"
      initialCustomerType={customerType}
    />
  );
}
