import Link from "next/link";
import { getTaxReportData } from "@/lib/actions/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatCurrency, formatCurrencyWhole } from "@/lib/utils/format";
import { TaxYearPicker } from "@/components/dashboard/tax-year-picker";
import { nowET } from "@/lib/utils";

export const metadata = {
  title: "Tax Summary | ShopPilot",
};

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = yearParam ? parseInt(yearParam, 10) : currentYear;
  const data = await getTaxReportData(year);

  const taxPct = (data.taxRate * 100).toFixed(2);

  // Determine current month index (0-based) for the selected year to know which months have data
  // Use ET to match shop's timezone (Vercel runs UTC)
  const now = nowET();
  const isCurrentYear = year === now.getFullYear();
  const currentMonth = isCurrentYear ? now.getMonth() : 11; // 0-based

  return (
    <div className="p-4 lg:p-10">
      <div className="mb-6">
        <Link href="/reports">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Tax Summary</h2>
            <p className="text-sm text-muted-foreground">
              Monthly taxable sales and MA sales tax collected ({taxPct}%)
            </p>
          </div>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Monthly Breakdown — {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
                  <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Month</th>
                  <th className="pb-2 pr-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Total Revenue</th>
                  <th className="pb-2 pr-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Taxable Amt</th>
                  <th className="pb-2 pr-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Tax Collected</th>
                  <th className="pb-2 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Non-Taxable</th>
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
