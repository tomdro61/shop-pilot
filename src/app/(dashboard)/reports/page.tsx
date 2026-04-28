import Link from "next/link";
import { getReportData } from "@/lib/actions/reports";
import { getTrendData } from "@/lib/actions/trends";
import { getReceivablesSummary } from "@/lib/actions/receivables";
import { getCustomerKpis } from "@/lib/actions/customer-insights";
import { resolveDateRange } from "@/lib/utils/date-range";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { COLUMN_HEADER, SECTION_LABEL } from "@/components/ui/section-card";
import { formatCurrency, formatCurrencyWhole } from "@/lib/utils/format";
import { ReportsOverviewChart } from "@/components/dashboard/reports-overview-chart";

export const metadata = {
  title: "Reports | ShopPilot",
};

export default async function ReportsOverviewPage() {
  const resolved = resolveDateRange("this_month");
  const currentYear = new Date().getFullYear();

  const [reportData, trendData, arData, customerData] = await Promise.all([
    getReportData({
      from: resolved.from,
      to: resolved.to,
      priorFrom: resolved.priorFrom,
      priorTo: resolved.priorTo,
      isAllTime: false,
    }),
    getTrendData("month", currentYear),
    getReceivablesSummary(),
    getCustomerKpis(resolved.from, resolved.to),
  ]);

  const { breakdown, inspectionRevenue, estimateCloseRate } = reportData;
  const totalRevenue = breakdown.totalRevenue + inspectionRevenue;
  const totalGrossProfit = reportData.totalGrossProfit;
  const grossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  // Last 6 months for mini chart
  const now = new Date();
  const currentMonthIdx = now.getMonth(); // 0-based
  const last6 = trendData.buckets.slice(Math.max(0, currentMonthIdx - 5), currentMonthIdx + 1);

  // Top 5 categories
  const topCategories = reportData.profitability
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Tech summary
  const techSummary = reportData.techBreakdown
    .filter((t) => t.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      {/* Row 1 — Money KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link href="/reports/trends?metric=revenue&granularity=month">
          <KpiCard
            title="Revenue (This Month)"
            value={formatCurrencyWhole(totalRevenue)}
            currentValue={totalRevenue}
            previousValue={reportData.revenuePrior ?? undefined}
            accentColor="blue"
          />
        </Link>
        <Link href="/reports/trends?metric=grossProfit&granularity=month">
          <KpiCard
            title="Gross Profit"
            value={formatCurrencyWhole(totalGrossProfit)}
            currentValue={totalGrossProfit}
            previousValue={reportData.grossProfitPrior ?? undefined}
            accentColor="emerald"
          />
        </Link>
        <Link href="/reports/trends?metric=grossMarginPct&granularity=month">
          <KpiCard
            title="Gross Margin %"
            value={`${grossMarginPct.toFixed(1)}%`}
            accentColor="amber"
          />
        </Link>
        <Link href="/reports/trends?metric=aro&granularity=month">
          <KpiCard
            title="Avg Repair Order"
            value={formatCurrencyWhole(reportData.avgTicket)}
            currentValue={reportData.avgTicket}
            previousValue={reportData.avgTicketPrior ?? undefined}
            accentColor="purple"
          />
        </Link>
      </div>

      {/* Row 2 — Operations KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link href="/reports/trends?metric=jobCount&granularity=month">
          <KpiCard
            title="Jobs Completed"
            value={reportData.jobsCurrent.toString()}
            currentValue={reportData.jobsCurrent}
            previousValue={reportData.jobsPrior ?? undefined}
            accentColor="blue"
          />
        </Link>
        <Link href="/reports/trends?metric=estimateCloseRate&granularity=month">
          <KpiCard
            title="Estimate Close Rate"
            value={`${estimateCloseRate.rate.toFixed(0)}%`}
            subtitle={estimateCloseRate.sent > 0 ? `${estimateCloseRate.approved} of ${estimateCloseRate.sent}` : undefined}
            accentColor="emerald"
          />
        </Link>
        <Link href="/reports/receivables">
          <KpiCard
            title="Total Outstanding"
            value={formatCurrencyWhole(arData.totalOutstanding)}
            subtitle={arData.aging60plus > 0 ? `${formatCurrency(arData.aging60plus)} over 60 days` : undefined}
            accentColor="amber"
          />
        </Link>
        <Link href="/reports/customers">
          <KpiCard
            title="New Customers"
            value={customerData.newCustomers.toString()}
            subtitle={`${customerData.repeatRate}% repeat rate`}
            accentColor="purple"
          />
        </Link>
      </div>

      {/* Row 3 — 6-month revenue chart */}
      <Link href="/reports/trends?metric=revenue&granularity=month" className="block mb-6">
        <ReportsOverviewChart data={last6.map((b) => ({ label: b.label, value: b.revenue }))} />
      </Link>

      {/* Row 4 — Mini tables */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Top Categories */}
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
            <h3 className={COLUMN_HEADER}>Top Categories (This Month)</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800/60 text-left">
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>Category</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Revenue</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {topCategories.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-4 text-center text-stone-500 dark:text-stone-400">No data</td></tr>
              ) : (
                topCategories.map((cat) => (
                  <tr key={cat.category} className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-2">
                      <Link href={`/reports/service-mix?category=${encodeURIComponent(cat.category)}&granularity=month`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">
                        {cat.category}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {formatCurrency(cat.revenue)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-sm font-medium ${cat.margin >= 50 ? "text-green-600 dark:text-green-400" : cat.margin >= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {cat.margin.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Tech Summary */}
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
            <h3 className={COLUMN_HEADER}>Tech Summary (This Month)</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800/60 text-left">
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>Tech</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Revenue</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Jobs</th>
              </tr>
            </thead>
            <tbody>
              {techSummary.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-4 text-center text-stone-500 dark:text-stone-400">No data</td></tr>
              ) : (
                techSummary.map((tech) => (
                  <tr key={tech.name} className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-2">
                      <Link href={`/reports/tech?category=${encodeURIComponent(tech.name)}&granularity=month`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">
                        {tech.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {formatCurrency(tech.revenue)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {tech.jobCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
