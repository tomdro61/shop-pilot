"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { Granularity, MetricKey, TrendData } from "@/lib/actions/trends";

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
}

export function TrendsExplorer({
  data,
  initialMetric,
  initialGranularity,
  initialYear,
}: TrendsExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [metric, setMetric] = useState<MetricKey>(initialMetric);

  const metricCfg = METRICS[metric];

  // Build URL for navigation
  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      sp.set(k, v);
    }
    // Preserve current metric in URL for bookmarking
    sp.set("metric", metric);
    router.push(`/reports/trends?${sp.toString()}`);
  }

  function setGranularity(g: Granularity) {
    const sp = new URLSearchParams();
    sp.set("granularity", g);
    sp.set("metric", metric);
    if (g === "month") sp.set("year", String(initialYear));
    router.push(`/reports/trends?${sp.toString()}`);
  }

  function setYear(y: number) {
    navigate({ year: String(y) });
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

  // Totals row
  const totalValue = (() => {
    const values = data.buckets.map((b) => b[metric]);
    if (metricCfg.aggregate === "sum") {
      return values.reduce((s, v) => s + v, 0);
    }
    // Weighted average for ARO: total revenue / total jobs
    if (metric === "aro") {
      const totalRev = data.buckets.reduce((s, b) => s + b.revenue, 0);
      const totalJobs = data.buckets.reduce((s, b) => s + b.jobCount, 0);
      return totalJobs > 0 ? totalRev / totalJobs : 0;
    }
    // Weighted average for margin: total profit / total revenue
    if (metric === "grossMarginPct") {
      const totalRev = data.buckets.reduce((s, b) => s + b.revenue, 0);
      const totalProfit = data.buckets.reduce((s, b) => s + b.grossProfit, 0);
      return totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
    }
    // Weighted average for close rate: total approved / total sent
    if (metric === "estimateCloseRate") {
      // We don't have raw sent/approved counts in TrendBucket, so use simple average
      const nonZero = values.filter((v) => v > 0);
      return nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
    }
    // Simple average for other avg metrics
    const nonZero = values.filter((v) => v > 0);
    return nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
  })();

  const thisYear = new Date().getFullYear();

  // Custom tooltip formatter
  function tooltipFormatter(
    value: number | string,
    name: string,
  ) {
    return (
      <span className="text-foreground font-mono font-medium tabular-nums">
        {metricCfg.format(typeof value === "number" ? value : parseFloat(value))}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          {/* Metric picker */}
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

          {/* Granularity toggle */}
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

          {/* Year picker — month mode only */}
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
              <span className="min-w-[4rem] text-center text-sm font-semibold tabular-nums">
                {initialYear}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={initialYear >= thisYear}
                onClick={() => setYear(initialYear + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">
            {metricCfg.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                      <p className="font-medium">{label}</p>
                      <p className="text-foreground font-mono font-medium tabular-nums mt-0.5">
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
        </CardContent>
      </Card>

      {/* Data table */}
      <Card className="py-0 gap-0">
        <CardHeader className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
          <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-stone-100">
            {metricCfg.label} — {initialGranularity === "month" ? initialYear : initialGranularity === "week" ? "Last 12 Weeks" : "Last 30 Days"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    Period
                  </th>
                  <th className="pb-2 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    {metricCfg.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((bucket) => (
                  <tr key={bucket.key}>
                    <td className="py-2 pr-4 font-medium">{bucket.label}</td>
                    <td className="py-2 text-right tabular-nums">
                      {metricCfg.format(bucket[metric])}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t border-stone-200 dark:border-stone-700 font-semibold">
                  <td className="py-2 pr-4">
                    {metricCfg.aggregate === "sum" ? "Total" : "Average"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {metricCfg.format(totalValue)}
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
