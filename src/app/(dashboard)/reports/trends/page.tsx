import Link from "next/link";
import { getTrendData } from "@/lib/actions/trends";
import { TrendsExplorer } from "@/components/dashboard/trends-explorer";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Granularity, MetricKey } from "@/lib/actions/trends";

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
  searchParams: Promise<{ granularity?: string; year?: string; metric?: string }>;
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

  const data = await getTrendData(granularity, year);

  return (
    <div className="p-4 lg:p-10">
      <div className="mb-6">
        <Link href="/reports">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">Trends Explorer</h2>
        <p className="text-sm text-muted-foreground">
          Track any metric over time
        </p>
      </div>

      <TrendsExplorer
        data={data}
        initialMetric={metric}
        initialGranularity={granularity}
        initialYear={year}
      />
    </div>
  );
}
