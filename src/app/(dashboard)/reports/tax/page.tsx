import { getTaxReportData } from "@/lib/actions/reports";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { COLUMN_HEADER, SECTION_LABEL } from "@/components/ui/section-card";
import { formatCurrency, formatCurrencyWhole } from "@/lib/utils/format";
import { TaxYearPicker } from "@/components/dashboard/tax-year-picker";
import { CustomerTypeNav } from "@/components/dashboard/customer-type-nav";
import { nowET } from "@/lib/utils";

export const metadata = {
  title: "Tax Summary | ShopPilot",
};

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; customerType?: string }>;
}) {
  const { year: yearParam, customerType } = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = yearParam ? parseInt(yearParam, 10) : currentYear;
  const data = await getTaxReportData(year, customerType);

  const taxPct = (data.taxRate * 100).toFixed(2);

  const now = nowET();
  const isCurrentYear = year === now.getFullYear();
  const currentMonth = isCurrentYear ? now.getMonth() : 11;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Monthly taxable sales and MA sales tax collected (<span className="font-mono tabular-nums">{taxPct}%</span>)
        </p>
        <div className="flex items-center gap-3">
          <CustomerTypeNav />
          <TaxYearPicker currentYear={year} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          title={`Total Revenue (${year})`}
          value={formatCurrencyWhole(data.ytd.totalRevenue)}
          accentColor="blue"
        />
        <KpiCard
          title="Taxable Sales"
          value={formatCurrencyWhole(data.ytd.taxableAmount)}
          subtitle="Parts only"
          accentColor="amber"
        />
        <KpiCard
          title="Tax Collected"
          value={formatCurrency(data.ytd.taxCollected)}
          subtitle={`${taxPct}% of taxable`}
          accentColor="purple"
        />
        <KpiCard
          title="Non-Taxable Sales"
          value={formatCurrencyWhole(data.ytd.nonTaxableAmount)}
          subtitle="Labor + other"
          accentColor="emerald"
        />
      </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
          <h3 className={COLUMN_HEADER}>Monthly Breakdown — {year}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800/60 text-left">
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>Month</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Total Revenue</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Taxable Amt</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Tax Collected</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Non-Taxable</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((row) => {
                const isFuture = isCurrentYear && row.monthNum > currentMonth + 1;
                const isEmpty = row.totalRevenue === 0;

                return (
                  <tr
                    key={row.monthNum}
                    className={`border-b border-stone-100 dark:border-stone-800/60 ${
                      isFuture ? "text-stone-300 dark:text-stone-700" : "hover:bg-stone-50 dark:hover:bg-stone-800/40"
                    }`}
                  >
                    <td className="px-4 py-2 text-sm font-medium text-stone-900 dark:text-stone-50">{row.month}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {isEmpty && isFuture ? "—" : formatCurrency(row.totalRevenue)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {isEmpty && isFuture ? "—" : formatCurrency(row.taxableAmount)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {isEmpty && isFuture ? "—" : formatCurrency(row.taxCollected)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                      {isEmpty && isFuture ? "—" : formatCurrency(row.nonTaxableAmount)}
                    </td>
                  </tr>
                );
              })}

              {/* YTD Totals Row */}
              <tr className="bg-stone-50 dark:bg-stone-900/40 border-t border-stone-200 dark:border-stone-800 font-semibold">
                <td className="px-4 py-2.5 text-sm text-stone-900 dark:text-stone-50">YTD Total</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                  {formatCurrency(data.ytd.totalRevenue)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                  {formatCurrency(data.ytd.taxableAmount)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm text-purple-600 dark:text-purple-400">
                  {formatCurrency(data.ytd.taxCollected)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                  {formatCurrency(data.ytd.nonTaxableAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
