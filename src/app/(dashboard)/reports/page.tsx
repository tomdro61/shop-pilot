import { Suspense } from "react";
import { getReportData, getFleetARSummary, getServiceProfitability, getRevenueBreakdown, getInspectionCount } from "@/lib/actions/reports";
import { resolveDateRange } from "@/lib/utils/date-range";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [data, fleetAR, profitability, breakdown, inspectionCount] = await Promise.all([
    getReportData({
      from: resolved.from,
      to: resolved.to,
      isAllTime: resolved.isAllTime,
    }),
    getFleetARSummary(),
    getServiceProfitability(resolved.from, resolved.to),
    getRevenueBreakdown(resolved.from, resolved.to),
    getInspectionCount(resolved.from, resolved.to),
  ]);

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

      {/* Revenue Breakdown */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard title={`Revenue (${resolved.label})`} value={formatCurrency(breakdown.totalRevenue)} />
        <KpiCard title="Labor" value={formatCurrency(breakdown.laborRevenue)} />
        <KpiCard title="Parts" value={formatCurrency(breakdown.partsRevenue)} />
        <KpiCard title="Est. Gross Profit" value={formatCurrency(breakdown.estimatedGrossProfit)} subtitle="Assumes 40% parts margin" />
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
          title={`Inspections (${resolved.label})`}
          value={inspectionCount.toString()}
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

      {/* Fleet A/R Aging */}
      {/* Service Profitability */}
      {profitability.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Service Profitability ({resolved.label})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Category</th>
                      <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
                      <th className="pb-2 pr-4 text-right font-medium">Parts Cost</th>
                      <th className="pb-2 pr-4 text-right font-medium">Labor Revenue</th>
                      <th className="pb-2 text-right font-medium">Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.map((row) => (
                      <tr key={row.category} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{row.category}</td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(row.revenue)}</td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(row.partsCost)}</td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(row.laborRevenue)}</td>
                        <td className={`py-2 text-right font-medium ${row.margin >= 50 ? "text-green-600" : row.margin >= 30 ? "text-yellow-600" : "text-red-600"}`}>
                          {row.margin.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fleet A/R Aging */}
      {fleetAR.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Fleet A/R Aging</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Account</th>
                      <th className="pb-2 pr-4 text-right font-medium">0-30 Days</th>
                      <th className="pb-2 pr-4 text-right font-medium">31-60 Days</th>
                      <th className="pb-2 pr-4 text-right font-medium">60+ Days</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleetAR.map((row) => (
                      <tr key={row.account} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{row.account}</td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(row.current)}</td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(row.days31to60)}</td>
                        <td className="py-2 pr-4 text-right text-red-600">{row.days60plus > 0 ? formatCurrency(row.days60plus) : "-"}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
