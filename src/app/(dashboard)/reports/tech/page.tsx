import { getTechTrendData } from "@/lib/actions/tech-trends";
import { CategoryDeepDive } from "@/components/dashboard/category-deep-dive";
import { ReportsNav } from "@/components/dashboard/reports-nav";
import { Wrench } from "lucide-react";
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
    <>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 flex-none">
          <Wrench className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Tech Scoreboard
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Per-tech performance over time.
          </p>
        </div>
      </div>
      <ReportsNav />
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
    </>
  );
}
