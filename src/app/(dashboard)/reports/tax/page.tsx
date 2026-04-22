import { getTaxReportData } from "@/lib/actions/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
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
        <p className="text-sm text-muted-foreground">
          Monthly taxable sales and MA sales tax collected ({taxPct}%)
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
      <Card className="py-0 gap-0">
        <CardHeader className="bg-sidebar px-5 py-3">
          <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-stone-100">
            Monthly Breakdown — {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Month</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Total Revenue</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Taxable Amt</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Tax Collected</th>
                  <th className="pb-2 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Non-Taxable</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((row) => {
                  const isFuture = isCurrentYear && row.monthNum > currentMonth + 1;
                  const isEmpty = row.totalRevenue === 0;

                  return (
                    <tr
                      key={row.monthNum}
                      className={
                        isFuture ? "text-stone-300 dark:text-stone-700" : ""
                      }
                    >
                      <td className="py-2 pr-4 font-medium">{row.month}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {isEmpty && isFuture ? "—" : formatCurrency(row.totalRevenue)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {isEmpty && isFuture ? "—" : formatCurrency(row.taxableAmount)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {isEmpty && isFuture ? "—" : formatCurrency(row.taxCollected)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {isEmpty && isFuture ? "—" : formatCurrency(row.nonTaxableAmount)}
                      </td>
                    </tr>
                  );
                })}

                {/* YTD Totals Row */}
                <tr className="border-t border-stone-200 dark:border-stone-700 font-semibold">
                  <td className="py-2 pr-4">YTD Total</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCurrency(data.ytd.totalRevenue)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCurrency(data.ytd.taxableAmount)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-purple-600 dark:text-purple-400">
                    {formatCurrency(data.ytd.taxCollected)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCurrency(data.ytd.nonTaxableAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
