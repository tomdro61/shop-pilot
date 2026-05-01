import { getCategoryTrendData } from "@/lib/actions/category-trends";
import { CategoryDeepDive } from "@/components/dashboard/category-deep-dive";
import { ReportsNav } from "@/components/dashboard/reports-nav";
import { PieChart } from "lucide-react";
import type { Granularity } from "@/lib/utils/trend-buckets";
import type { CategoryMetricKey } from "@/lib/actions/category-trends";

export const metadata = {
  title: "Service Mix Deep-Dive | ShopPilot",
};

const VALID_GRANULARITIES = new Set(["day", "week", "month"]);
const VALID_METRICS = new Set([
  "revenue", "grossProfit", "jobCount", "aro", "partsCost", "grossMarginPct",
]);

export default async function ServiceMixPage({
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

  const category = params.category || "all";
  const customerType = params.customerType || "all";

  const data = await getCategoryTrendData(granularity, year, customerType);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none">
          <PieChart className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Service Mix
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Per-category revenue, jobs, and profit.
          </p>
        </div>
      </div>
      <ReportsNav />
      <CategoryDeepDive
        data={data}
        initialCategory={category}
        initialMetric={metric}
        initialGranularity={granularity}
        initialYear={year}
        initialCustomerType={customerType}
      />
    </>
  );
}
