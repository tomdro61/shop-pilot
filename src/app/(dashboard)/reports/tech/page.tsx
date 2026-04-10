import Link from "next/link";
import { getTechTrendData } from "@/lib/actions/tech-trends";
import { CategoryDeepDive } from "@/components/dashboard/category-deep-dive";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
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
  searchParams: Promise<{ granularity?: string; year?: string; metric?: string; category?: string }>;
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

  const data = await getTechTrendData(granularity, year);

  return (
    <div className="p-4 lg:p-10">
      <div className="mb-6">
        <Link href="/reports">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">Tech Scoreboard</h2>
        <p className="text-sm text-muted-foreground">
          Technician performance trends and workload comparison
        </p>
      </div>

      <CategoryDeepDive
        data={data}
        initialCategory={tech}
        initialMetric={metric}
        initialGranularity={granularity}
        initialYear={year}
        groupLabel="Tech"
        basePath="/reports/tech"
      />
    </div>
  );
}
