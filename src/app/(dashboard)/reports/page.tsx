import { getReportData } from "@/lib/actions/reports";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CategoryBarChart } from "@/components/dashboard/category-bar-chart";
import { formatCurrency } from "@/lib/utils/format";

export const metadata = {
  title: "Reports | ShopPilot",
};

export default async function ReportsPage() {
  const data = await getReportData();

  const jobsChartData = data.jobsByCategory.map((d) => ({
    category: d.category,
    value: d.count,
  }));

  const revenueChartData = data.revenueByCategory.map((d) => ({
    category: d.category,
    value: d.revenue,
  }));

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Jobs This Week"
          value={data.jobsThisWeek.toString()}
          currentValue={data.jobsThisWeek}
          previousValue={data.jobsLastWeek}
        />
        <KpiCard
          title="Jobs This Month"
          value={data.jobsThisMonth.toString()}
          currentValue={data.jobsThisMonth}
          previousValue={data.jobsLastMonth}
        />
        <KpiCard
          title="Revenue This Week"
          value={formatCurrency(data.revenueThisWeek)}
          currentValue={data.revenueThisWeek}
          previousValue={data.revenueLastWeek}
        />
        <KpiCard
          title="Revenue This Month"
          value={formatCurrency(data.revenueThisMonth)}
          currentValue={data.revenueThisMonth}
          previousValue={data.revenueLastMonth}
        />
      </div>

      <div className="mb-6">
        <KpiCard
          title="Average Ticket Size"
          value={formatCurrency(data.avgTicket)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoryBarChart
          title="Jobs by Category (This Month)"
          data={jobsChartData}
          valueLabel="Jobs"
        />
        <CategoryBarChart
          title="Revenue by Category (This Month)"
          data={revenueChartData}
          valueLabel="Revenue"
          formatValue={(v) => formatCurrency(v)}
        />
      </div>
    </div>
  );
}
