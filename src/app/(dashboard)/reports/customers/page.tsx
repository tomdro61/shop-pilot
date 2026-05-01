import { getCustomerInsightsData } from "@/lib/actions/customer-insights";
import { CustomerInsights } from "@/components/dashboard/customer-insights";
import { ReportsNav } from "@/components/dashboard/reports-nav";
import { Users } from "lucide-react";
import type { Granularity } from "@/lib/utils/trend-buckets";

export const metadata = {
  title: "Customer Insights | ShopPilot",
};

const VALID_GRANULARITIES = new Set(["day", "week", "month"]);

export default async function CustomerInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string; year?: string; customerType?: string }>;
}) {
  const params = await searchParams;

  const granularity: Granularity = VALID_GRANULARITIES.has(params.granularity || "")
    ? (params.granularity as Granularity)
    : "month";

  const currentYear = new Date().getFullYear();
  const year = params.year ? parseInt(params.year, 10) : currentYear;
  const customerType = params.customerType || "all";

  const data = await getCustomerInsightsData(granularity, year, customerType);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 flex-none">
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Customer Insights
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Repeat rate, lifetime value, and retention.
          </p>
        </div>
      </div>
      <ReportsNav />
      <CustomerInsights
        data={data}
        initialGranularity={granularity}
        initialYear={year}
        initialCustomerType={customerType}
      />
    </>
  );
}
