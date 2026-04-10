import Link from "next/link";
import { getCustomerInsightsData } from "@/lib/actions/customer-insights";
import { CustomerInsights } from "@/components/dashboard/customer-insights";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Granularity } from "@/lib/utils/trend-buckets";

export const metadata = {
  title: "Customer Insights | ShopPilot",
};

const VALID_GRANULARITIES = new Set(["day", "week", "month"]);

export default async function CustomerInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string; year?: string }>;
}) {
  const params = await searchParams;

  const granularity: Granularity = VALID_GRANULARITIES.has(params.granularity || "")
    ? (params.granularity as Granularity)
    : "month";

  const currentYear = new Date().getFullYear();
  const year = params.year ? parseInt(params.year, 10) : currentYear;

  const data = await getCustomerInsightsData(granularity, year);

  return (
    <div className="p-4 lg:p-10">
      <div className="mb-6">
        <Link href="/reports">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">Customer Insights</h2>
        <p className="text-sm text-muted-foreground">
          New vs returning trends, top customers, and retention metrics
        </p>
      </div>

      <CustomerInsights
        data={data}
        initialGranularity={granularity}
        initialYear={year}
      />
    </div>
  );
}
