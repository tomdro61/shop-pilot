import { getCustomerInsightsData } from "@/lib/actions/customer-insights";
import { CustomerInsights } from "@/components/dashboard/customer-insights";
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
    <CustomerInsights
      data={data}
      initialGranularity={granularity}
      initialYear={year}
      initialCustomerType={customerType}
    />
  );
}
