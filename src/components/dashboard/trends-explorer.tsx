"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLUMN_HEADER, SECTION_LABEL } from "@/components/ui/section-card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { Granularity } from "@/lib/utils/trend-buckets";
import type { MetricKey, TrendData } from "@/lib/actions/trends";
import { CustomerTypePills } from "@/components/dashboard/customer-type-pills";

// ── Metric config ────────────────────────────────────────────

interface MetricConfig {
  label: string;
  format: (v: number) => string;
  formatShort: (v: number) => string;
  aggregate: "sum" | "avg";
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function fmtInt(v: number): string {
  return String(Math.round(v));
}

const METRICS: Record<MetricKey, MetricConfig> = {
  revenue:           { label: "Revenue",             format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  grossProfit:       { label: "Gross Profit",        format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  partsRevenue:      { label: "Parts Revenue",       format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  laborRevenue:      { label: "Labor Revenue",       format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  partsCost:         { label: "Parts Cost (COGS)",   format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  grossMarginPct:    { label: "Gross Margin %",      format: fmtPct,        formatShort: fmtPct,     aggregate: "avg" },
  jobCount:          { label: "Job Count",           format: fmtInt,        formatShort: fmtInt,     aggregate: "sum" },
  aro:               { label: "Avg Repair Order",    format: formatCurrency, formatShort: fmtCompact, aggregate: "avg" },
  estimateCloseRate: { label: "Estimate Close Rate", format: (v) => `${v.toFixed(0)}%`, formatShort: (v) => `${v.toFixed(0)}%`, aggregate: "avg" },
  inspectionCount:   { label: "Inspection Count",    format: fmtInt,        formatShort: fmtInt,     aggregate: "sum" },
  inspectionRevenue: { label: "Inspection Revenue",  format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
};

const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

// ── Component ────────────────────────────────────────────────

interface TrendsExplorerProps {
  data: TrendData;
  initialMetric: MetricKey;
  initialGranularity: Granularity;
  initialYear: number;
  initialCustomerType?: string;
}

export function TrendsExplorer({
  data,
  initialMetric,
  initialGranularity,
  initialYear,
  initialCustomerType = "all",
}: TrendsExplorerProps) {
  const router = useRouter();
  const [metric, setMetric] = useState<MetricKey>(initialMetric);

  const metricCfg = METRICS[metric];

  function pushParams(params: Record<string, string>) {
    const sp = new URLSearchParams(params);
    sp.set("metric", metric);
    if (initialCustomerType !== "all") sp.set("customerType", initialCustomerType);
    router.push(`/reports/trends?${sp.toString()}`);
  }

  function setCustomerType(type: string) {
    const sp = new URLSearchParams({ granularity: initialGranularity });
    if (initialGranularity === "month") sp.set("year", String(initialYear));
    sp.set("metric", metric);
    if (type !== "all") sp.set("customerType", type);
    router.push(`/reports/trends?${sp.toString()}`);
  }

  function setGranularity(g: Granularity) {
    const params: Record<string, string> = { granularity: g };
    if (g === "month") params.year = String(initialYear);
    pushParams(params);
  }

  function setYear(y: number) {
    pushParams({ granularity: "month", year: String(y) });
  }

  // Chart data
  const chartData = data.buckets.map((b) => ({
    label: b.label,
    value: b[metric],
  }));

  const chartConfig: ChartConfig = {
    value: {
      label: metricCfg.label,
      color: "oklch(0.55 0.15 250)",
    },
  };

  // Totals row — weighted averages for ratio metrics, simple sum for others
  const totalValue = (() => {
    const values = data.buckets.map((b) => b[metric]);
    if (metricCfg.aggregate === "sum") {
      return values.reduce((s, v) => s + v, 0);
    }
    if (metric === "aro") {
      const totalRev = data.buckets.reduce((s, b) => s + b.revenue, 0);
      const totalJobs = data.buckets.reduce((s, b) => s + b.jobCount, 0);
      return totalJobs > 0 ? totalRev / totalJobs : 0;
    }
    if (metric === "grossMarginPct") {
      const totalRev = data.buckets.reduce((s, b) => s + b.revenue, 0);
      const totalProfit = data.buckets.reduce((s, b) => s + b.grossProfit, 0);
      return totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
    }
    // Simple average for estimateCloseRate and any other avg metrics
    const nonZero = values.filter((v) => v > 0);
    return nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
  })();

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm flex flex-wrap items-center gap-3 px-4 py-3">
        <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {METRICS[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear(initialYear - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[4rem] text-center text-sm font-semibold font-mono tabular-nums text-stone-900 dark:text-stone-50">
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
      </div>

      {/* Chart */}
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
          <h3 className={COLUMN_HEADER}>{metricCfg.label}</h3>
        </div>
        <div className="px-4 py-3">
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
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
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={metricCfg.formatShort}
                width={60}
              />
              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const val = payload[0].value as number;
                  return (
                    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-card px-3 py-2 text-xs shadow-md">
                      <p className="font-medium text-stone-900 dark:text-stone-50">{label}</p>
                      <p className="text-stone-900 dark:text-stone-50 font-mono font-medium tabular-nums mt-0.5">
                        {metricCfg.format(val)}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="value"
                fill="var(--color-value)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
      </div>

      {/* Data table */}
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
          <h3 className={COLUMN_HEADER}>
            {metricCfg.label} — {initialGranularity === "month" ? initialYear : initialGranularity === "week" ? "Last 12 Weeks" : "Last 30 Days"}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800/60 text-left">
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>Period</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>{metricCfg.label}</th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((bucket) => (
                <tr key={bucket.key} className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-2 text-sm font-medium text-stone-900 dark:text-stone-50">{bucket.label}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                    {metricCfg.format(bucket[metric])}
                  </td>
                </tr>
              ))}
              <tr className="bg-stone-50 dark:bg-stone-900/40 border-t border-stone-200 dark:border-stone-800 font-semibold">
                <td className="px-4 py-2.5 text-sm text-stone-900 dark:text-stone-50">
                  {metricCfg.aggregate === "sum" ? "Total" : "Average"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                  {metricCfg.format(totalValue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
