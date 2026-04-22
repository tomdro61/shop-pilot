"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { Granularity } from "@/lib/utils/trend-buckets";
import type { CustomerInsightsData } from "@/lib/actions/customer-insights";
import { CustomerTypePills } from "@/components/dashboard/customer-type-pills";

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const chartConfig: ChartConfig = {
  new: { label: "New Customers", color: "oklch(0.60 0.15 155)" },
  returning: { label: "Returning Customers", color: "oklch(0.55 0.15 250)" },
};

interface CustomerInsightsProps {
  data: CustomerInsightsData;
  initialGranularity: Granularity;
  initialYear: number;
  initialCustomerType?: string;
}

export function CustomerInsights({
  data,
  initialGranularity,
  initialYear,
  initialCustomerType = "all",
}: CustomerInsightsProps) {
  const router = useRouter();

  function pushParams(params: Record<string, string>) {
    const sp = new URLSearchParams(params);
    if (initialCustomerType !== "all") sp.set("customerType", initialCustomerType);
    router.push(`/reports/customers?${sp.toString()}`);
  }

  function setCustomerType(type: string) {
    const sp = new URLSearchParams({ granularity: initialGranularity });
    if (initialGranularity === "month") sp.set("year", String(initialYear));
    if (type !== "all") sp.set("customerType", type);
    router.push(`/reports/customers?${sp.toString()}`);
  }

  function setGranularity(g: Granularity) {
    const params: Record<string, string> = { granularity: g };
    if (g === "month") params.year = String(initialYear);
    pushParams(params);
  }

  function setYear(y: number) {
    pushParams({ granularity: "month", year: String(y) });
  }

  const chartData = data.buckets.map((b) => ({
    label: b.label,
    new: b.newCount,
    returning: b.returningCount,
  }));

  const periodLabel = initialGranularity === "month"
    ? String(initialYear)
    : initialGranularity === "week"
      ? "Last 12 Weeks"
      : "Last 30 Days";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <div className="flex gap-1">
            {GRANULARITIES.map((g) => (
              <Button
                key={g.value}
                variant={initialGranularity === g.value ? "default" : "outline"}
                size="sm"
                onClick={() => setGranularity(g.value)}
              >
                {g.label}
              </Button>
            ))}
          </div>

          {initialGranularity === "month" && (
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(initialYear - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[4rem] text-center text-sm font-semibold tabular-nums">
                {initialYear}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={initialYear >= (data.year ?? initialYear)}
                onClick={() => setYear(initialYear + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="ml-auto">
            <CustomerTypePills value={initialCustomerType} onChange={setCustomerType} />
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          title="Unique Customers"
          value={String(data.uniqueCustomers)}
          accentColor="blue"
        />
        <KpiCard
          title="New Customers"
          value={String(data.newCustomers)}
          accentColor="emerald"
        />
        <KpiCard
          title="Repeat Rate"
          value={`${data.repeatRate}%`}
          accentColor="amber"
        />
        <KpiCard
          title="Avg Visits / Customer"
          value={String(data.avgVisitsPerCustomer)}
          accentColor="purple"
        />
      </div>

      {/* New vs Returning Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">
            New vs Returning Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                interval={initialGranularity === "day" ? 4 : 0}
                angle={initialGranularity === "day" ? -45 : 0}
                textAnchor={initialGranularity === "day" ? "end" : "middle"}
                height={initialGranularity === "day" ? 60 : 30}
              />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={40} />
              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const newVal = (payload.find((p) => p.dataKey === "new")?.value as number) || 0;
                  const retVal = (payload.find((p) => p.dataKey === "returning")?.value as number) || 0;
                  const total = newVal + retVal;
                  return (
                    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl min-w-[140px]">
                      <p className="font-medium mb-1">{label}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "oklch(0.60 0.15 155)" }} />
                          <span className="text-muted-foreground">New</span>
                        </div>
                        <span className="font-mono font-medium tabular-nums">{newVal}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "oklch(0.55 0.15 250)" }} />
                          <span className="text-muted-foreground">Returning</span>
                        </div>
                        <span className="font-mono font-medium tabular-nums">{retVal}</span>
                      </div>
                      <div className="flex justify-between gap-3 mt-1 pt-1 border-t border-border/50 font-medium">
                        <span>Total</span>
                        <span className="font-mono tabular-nums">{total}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="returning" stackId="a" fill="var(--color-returning)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="new" stackId="a" fill="var(--color-new)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "oklch(0.60 0.15 155)" }} />
              <span className="text-muted-foreground">New</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "oklch(0.55 0.15 250)" }} />
              <span className="text-muted-foreground">Returning</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Customers Table */}
      <Card className="py-0 gap-0">
        <CardHeader className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
          <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-stone-100">
            Top Customers — {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 dark:border-stone-800 text-left">
                  <th className="pb-2 pr-2 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 w-8">#</th>
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Customer</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Revenue</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Jobs</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Avg Ticket</th>
                  <th className="pb-2 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Last Visit</th>
                </tr>
              </thead>
              <tbody>
                {data.topCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No customer data for this period
                    </td>
                  </tr>
                ) : (
                  data.topCustomers.map((c, i) => (
                    <tr key={c.id} className="hover:bg-stone-100 dark:hover:bg-stone-800/50">
                      <td className="py-2 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium">
                        <Link href={`/customers/${c.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(c.revenue)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{c.jobCount}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(c.avgTicket)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {new Date(c.lastVisit + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
