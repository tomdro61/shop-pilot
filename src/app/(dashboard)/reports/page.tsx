import { Suspense } from "react";
import { getReportData } from "@/lib/actions/reports";
import { resolveDateRange } from "@/lib/utils/date-range";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CategoryBarChart } from "@/components/dashboard/category-bar-chart";
import { ReportsToolbar } from "@/components/dashboard/reports-toolbar";
import { formatCurrency } from "@/lib/utils/format";

export const metadata = {
  title: "Reports | ShopPilot",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  const resolved = resolveDateRange(range, from, to);
  const data = await getReportData({
    from: resolved.from,
    to: resolved.to,
    isAllTime: resolved.isAllTime,
  });

  const jobsChartData = data.jobsByCategory.map((d) => ({
    category: d.category,
    value: d.count,
  }));

  const revenueChartData = data.revenueByCategory.map((d) => ({
    category: d.category,
    value: d.revenue,
  }));

  const jobsByTechData = data.jobsByTech.map((d) => ({
    category: d.category,
    value: d.count,
  }));

  const revenueByTechData = data.revenueByTech.map((d) => ({
    category: d.category,
    value: d.revenue,
  }));

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <Suspense fallback={null}>
          <ReportsToolbar />
        </Suspense>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title={`Jobs (${resolved.label})`}
          value={data.jobsCurrent.toString()}
          currentValue={data.isAllTime ? undefined : data.jobsCurrent}
          previousValue={
            data.isAllTime ? undefined : (data.jobsPrior ?? undefined)
          }
        />
        <KpiCard
          title={`Revenue (${resolved.label})`}
          value={formatCurrency(data.revenueCurrent)}
          currentValue={data.isAllTime ? undefined : data.revenueCurrent}
          previousValue={
            data.isAllTime ? undefined : (data.revenuePrior ?? undefined)
          }
        />
        <KpiCard
          title="Avg Ticket Size"
          value={formatCurrency(data.avgTicket)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoryBarChart
          title={`Jobs by Category (${resolved.label})`}
          data={jobsChartData}
          valueLabel="Jobs"
        />
        <CategoryBarChart
          title={`Revenue by Category (${resolved.label})`}
          data={revenueChartData}
          valueLabel="Revenue"
          isCurrency
        />
        <CategoryBarChart
          title={`Jobs by Technician (${resolved.label})`}
          data={jobsByTechData}
          valueLabel="Jobs"
        />
        <CategoryBarChart
          title={`Revenue by Technician (${resolved.label})`}
          data={revenueByTechData}
          valueLabel="Revenue"
          isCurrency
        />
      </div>
    </div>
  );
}
