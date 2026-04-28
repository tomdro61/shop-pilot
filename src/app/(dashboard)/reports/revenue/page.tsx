import { Suspense } from "react";
import { getReportData } from "@/lib/actions/reports";
import { resolveDateRange } from "@/lib/utils/date-range";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { HorizontalBarChart } from "@/components/dashboard/horizontal-bar-chart";
import { ReportsToolbar } from "@/components/dashboard/reports-toolbar";
import { COLUMN_HEADER, SECTION_LABEL } from "@/components/ui/section-card";
import { formatCurrency, formatCurrencyWhole } from "@/lib/utils/format";

export const metadata = {
  title: "Revenue Overview | ShopPilot",
};

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; customerType?: string }>;
}) {
  const { range, from, to, customerType } = await searchParams;
  const resolved = resolveDateRange(range, from, to);
  const data = await getReportData({
    from: resolved.from,
    to: resolved.to,
    priorFrom: resolved.priorFrom,
    priorTo: resolved.priorTo,
    isAllTime: resolved.isAllTime,
    customerType,
  });

  const { profitability, breakdown, inspectionCount, inspectionRevenue, estimateCloseRate } = data;

  const categoryChartData = data.categoryBreakdown.map((d) => ({
    label: d.category,
    revenue: d.revenue,
    jobCount: d.jobCount,
  }));

  const techChartData = data.techBreakdown.map((d) => ({
    label: d.name,
    revenue: d.revenue,
    jobCount: d.jobCount,
  }));

  const techProfitChartData = data.techProfitBreakdown.map((d) => ({
    label: d.name,
    revenue: d.grossProfit,
    jobCount: d.jobCount,
  }));

  const totalRevenue = breakdown.totalRevenue + inspectionRevenue;
  const laborPct = totalRevenue > 0 ? Math.round((breakdown.laborRevenue / totalRevenue) * 100) : 0;
  const partsPct = totalRevenue > 0 ? Math.round((breakdown.partsRevenue / totalRevenue) * 100) : 0;
  const inspectionPct = totalRevenue > 0 ? Math.round((inspectionRevenue / totalRevenue) * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <Suspense fallback={null}>
          <ReportsToolbar basePath="/reports/revenue" showExport />
        </Suspense>
      </div>

      {/* Row 1 — Money */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          title={`Revenue (${resolved.label})`}
          value={formatCurrencyWhole(totalRevenue)}
          currentValue={data.isAllTime ? undefined : totalRevenue}
          previousValue={data.isAllTime ? undefined : (data.revenuePrior ?? undefined)}
          accentColor="blue"
        />
        <KpiCard title="Labor Revenue" value={formatCurrencyWhole(breakdown.laborRevenue)} subtitle={`${laborPct}% of total`} accentColor="emerald" />
        <KpiCard title="Parts Revenue" value={formatCurrencyWhole(breakdown.partsRevenue)} subtitle={`${partsPct}% of total`} accentColor="amber" />
        <KpiCard
          title="Gross Profit"
          value={formatCurrencyWhole(data.totalGrossProfit)}
          currentValue={data.isAllTime ? undefined : data.totalGrossProfit}
          previousValue={data.isAllTime ? undefined : (data.grossProfitPrior ?? undefined)}
          subtitle={breakdown.costDataCoverage < 100 ? `${breakdown.costDataCoverage}% actual cost data` : "Based on actual costs"}
          accentColor="purple"
        />
      </div>

      {/* Row 2 — Operations */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          title="Jobs Completed"
          value={data.jobsCurrent.toString()}
          currentValue={data.isAllTime ? undefined : data.jobsCurrent}
          previousValue={data.isAllTime ? undefined : (data.jobsPrior ?? undefined)}
          accentColor="blue"
        />
        <KpiCard
          title="Avg Ticket"
          value={formatCurrencyWhole(data.avgTicket)}
          currentValue={data.isAllTime ? undefined : data.avgTicket}
          previousValue={data.isAllTime ? undefined : (data.avgTicketPrior ?? undefined)}
          accentColor="emerald"
        />
        <KpiCard
          title="Inspections"
          value={inspectionCount.toString()}
          subtitle={inspectionRevenue > 0 ? `${formatCurrencyWhole(inspectionRevenue)} (${inspectionPct}%)` : undefined}
          currentValue={data.isAllTime ? undefined : inspectionCount}
          previousValue={data.isAllTime ? undefined : (data.inspectionCountPrior ?? undefined)}
          accentColor="amber"
        />
        <KpiCard
          title="Estimate Close Rate"
          value={`${estimateCloseRate.rate.toFixed(0)}%`}
          subtitle={estimateCloseRate.sent > 0 ? `${estimateCloseRate.approved} of ${estimateCloseRate.sent} sent` : "No estimates sent"}
          currentValue={data.isAllTime ? undefined : estimateCloseRate.rate}
          previousValue={data.isAllTime ? undefined : (data.priorEstimateCloseRate?.rate ?? undefined)}
          accentColor="purple"
        />
      </div>

      {/* Horizontal Bar Charts */}
      <div className="space-y-6">
        <HorizontalBarChart
          title={`Revenue by Category (${resolved.label})`}
          data={categoryChartData}
        />
        <HorizontalBarChart
          title={`Revenue by Customer Type (${resolved.label})`}
          data={data.customerTypeBreakdown}
        />
        <HorizontalBarChart
          title={`Revenue by Technician (${resolved.label})`}
          data={techChartData}
        />
        <HorizontalBarChart
          title={`Gross Profit by Technician (${resolved.label})`}
          data={techProfitChartData}
        />
      </div>

      {/* Service Profitability */}
      {profitability.length > 0 && (
        <div className="mt-6 bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
            <h3 className={COLUMN_HEADER}>Service Profitability ({resolved.label})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-800/60 text-left">
                  <th className={`px-4 py-2 ${SECTION_LABEL}`}>Category</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Revenue</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Parts Cost</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Labor Rev</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Gross Profit</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {profitability.map((row) => (
                  <tr key={row.category} className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-2 text-sm font-medium text-stone-900 dark:text-stone-50">{row.category}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {row.hasEstimatedCosts && <span className="text-stone-400 dark:text-stone-500" title="Includes estimated costs">~</span>}
                      {formatCurrency(row.partsCost)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {formatCurrency(row.laborRevenue)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {formatCurrency(row.grossProfit)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-sm font-medium ${row.margin >= 50 ? "text-green-600 dark:text-green-400" : row.margin >= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {row.hasEstimatedCosts && <span className="text-stone-400 dark:text-stone-500">~</span>}
                      {row.margin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
