"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { CustomerTypePills } from "@/components/dashboard/customer-type-pills";
import { formatCurrency } from "@/lib/utils/format";
import type { Granularity } from "@/lib/utils/trend-buckets";
import type {
  CategoryMetricKey,
  CategoryTrendData,
} from "@/lib/actions/category-trends";

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

const METRICS: Record<CategoryMetricKey, MetricConfig> = {
  revenue:        { label: "Revenue",          format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  grossProfit:    { label: "Gross Profit",     format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  jobCount:       { label: "Job Count",        format: (v) => String(Math.round(v)), formatShort: (v) => String(Math.round(v)), aggregate: "sum" },
  aro:            { label: "Avg Repair Order", format: formatCurrency, formatShort: fmtCompact, aggregate: "avg" },
  partsCost:      { label: "Parts Cost",       format: formatCurrency, formatShort: fmtCompact, aggregate: "sum" },
  grossMarginPct: { label: "Gross Margin %",   format: (v) => `${v.toFixed(1)}%`, formatShort: (v) => `${v.toFixed(1)}%`, aggregate: "avg" },
};

const METRIC_KEYS = Object.keys(METRICS) as CategoryMetricKey[];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const CATEGORY_COLORS = [
  "oklch(0.55 0.15 250)",  // blue
  "oklch(0.60 0.12 180)",  // teal
  "oklch(0.65 0.15 80)",   // amber
  "oklch(0.50 0.15 300)",  // purple
  "oklch(0.55 0.15 15)",   // rose
  "oklch(0.60 0.15 155)",  // emerald
  "oklch(0.45 0.15 270)",  // indigo
  "oklch(0.60 0.12 210)",  // cyan
  "oklch(0.55 0.08 40)",   // stone (for "Other")
];

// ── Component ────────────────────────────────────────────────

interface CategoryDeepDiveProps {
  data: CategoryTrendData;
  initialCategory: string;
  initialMetric: CategoryMetricKey;
  initialGranularity: Granularity;
  initialYear: number;
  groupLabel?: string;
  basePath?: string;
  initialCustomerType?: string;
}

export function CategoryDeepDive({
  data,
  initialCategory,
  initialMetric,
  initialGranularity,
  initialYear,
  groupLabel = "Category",
  basePath = "/reports/service-mix",
  initialCustomerType = "all",
}: CategoryDeepDiveProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(() => {
    if (initialCategory === "all") return [...data.categories];
    const parsed = initialCategory.split(",").filter((c) => data.categories.includes(c));
    return parsed.length > 0 ? parsed : [...data.categories];
  });
  const [metric, setMetric] = useState<CategoryMetricKey>(initialMetric);

  const metricCfg = METRICS[metric];
  const catIndexMap = new Map(data.categories.map((c, i) => [c, i]));
  const isAllSelected = selected.length === data.categories.length;
  const visibleCategories = selected;
  const isSingle = visibleCategories.length === 1;
  const groupLabelPlural = groupLabel === "Category" ? "Categories" : `${groupLabel}s`;
  const allLabel = `All ${groupLabelPlural}`;

  function toggleAll() {
    setSelected(isAllSelected ? [] : [...data.categories]);
  }

  function toggleCategory(cat: string) {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  const triggerLabel = isAllSelected
    ? allLabel
    : selected.length === 0
      ? `Select ${groupLabelPlural}…`
      : selected.length === 1
        ? selected[0]
        : selected.length <= 3
          ? selected.join(", ")
          : `${selected.length} ${groupLabelPlural}`;

  function pushParams(params: Record<string, string>) {
    const sp = new URLSearchParams(params);
    sp.set("metric", metric);
    sp.set("category", isAllSelected ? "all" : selected.join(","));
    if (initialCustomerType !== "all") sp.set("customerType", initialCustomerType);
    router.push(`${basePath}?${sp.toString()}`);
  }

  function setCustomerType(type: string) {
    const sp = new URLSearchParams({ granularity: initialGranularity });
    if (initialGranularity === "month") sp.set("year", String(initialYear));
    sp.set("metric", metric);
    sp.set("category", isAllSelected ? "all" : selected.join(","));
    if (type !== "all") sp.set("customerType", type);
    router.push(`${basePath}?${sp.toString()}`);
  }

  function setGranularity(g: Granularity) {
    const params: Record<string, string> = { granularity: g };
    if (g === "month") params.year = String(initialYear);
    pushParams(params);
  }

  function setYear(y: number) {
    pushParams({ granularity: "month", year: String(y) });
  }

  // Use index-based keys for chart (category names have spaces/special chars that break CSS vars)
  const catKeys = data.categories.map((_, i) => `cat${i}`);
  const visibleCatKeys = visibleCategories.map((cat) => catKeys[catIndexMap.get(cat)!]);

  // ── Single category chart data (exactly 1 selected) ──
  const singleChartData = isSingle
    ? data.buckets.map((b) => ({
        label: b.label,
        value: b.categories[visibleCategories[0]]?.[metric] ?? 0,
      }))
    : [];

  // ── Multi category chart data (2+ selected, including "all") ──
  const multiChartData = !isSingle
    ? data.buckets.map((b) => {
        const row: Record<string, unknown> = { label: b.label };
        visibleCategories.forEach((cat) => {
          row[catKeys[catIndexMap.get(cat)!]] = b.categories[cat]?.[metric] ?? 0;
        });
        return row;
      })
    : [];

  // ── Chart config ──
  const chartConfig: ChartConfig = !isSingle
    ? Object.fromEntries(
        visibleCategories.map((cat) => {
          const idx = catIndexMap.get(cat)!;
          return [
            catKeys[idx],
            { label: cat, color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] },
          ];
        })
      )
    : {
        value: {
          label: metricCfg.label,
          color: "oklch(0.55 0.15 250)",
        },
      };

  // ── Total/average row ──
  function computeTotal(cat: string): number {
    const values = data.buckets.map((b) => b.categories[cat]?.[metric] ?? 0);
    if (metricCfg.aggregate === "sum") {
      return values.reduce((s, v) => s + v, 0);
    }
    if (metric === "aro") {
      const totalRev = data.buckets.reduce((s, b) => s + (b.categories[cat]?.revenue ?? 0), 0);
      const totalJobs = data.buckets.reduce((s, b) => s + (b.categories[cat]?.jobCount ?? 0), 0);
      return totalJobs > 0 ? totalRev / totalJobs : 0;
    }
    if (metric === "grossMarginPct") {
      const totalRev = data.buckets.reduce((s, b) => s + (b.categories[cat]?.revenue ?? 0), 0);
      const totalProfit = data.buckets.reduce((s, b) => s + (b.categories[cat]?.grossProfit ?? 0), 0);
      return totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
    }
    const nonZero = values.filter((v) => v > 0);
    return nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
  }

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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-[200px] justify-between text-left font-normal">
                <span className="truncate">{triggerLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-1.5" align="start">
              <button
                onClick={toggleAll}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <Checkbox
                  checked={isAllSelected ? true : selected.length > 0 ? "indeterminate" : false}
                  tabIndex={-1}
                  className="pointer-events-none"
                />
                <span className="font-medium">{allLabel}</span>
              </button>
              <div className="my-1 border-t border-stone-300 dark:border-stone-700" />
              <div className="max-h-[240px] overflow-y-auto">
                {data.categories.map((cat, idx) => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      <Checkbox
                        checked={selected.includes(cat)}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                      />
                      <span className="truncate">{cat}</span>
                    </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Select value={metric} onValueChange={(v) => setMetric(v as CategoryMetricKey)}>
            <SelectTrigger className="w-[180px]">
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

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">
            {isSingle ? `${visibleCategories[0]} — ${metricCfg.label}` : `${metricCfg.label} by ${groupLabel}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <BarChart data={isSingle ? singleChartData : multiChartData}>
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
                  if (isSingle) {
                    const val = payload[0].value as number;
                    return (
                      <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                        <p className="font-medium">{label}</p>
                        <p className="text-foreground font-mono font-medium tabular-nums mt-0.5">
                          {metricCfg.format(val)}
                        </p>
                      </div>
                    );
                  }
                  // Stacked tooltip — show each category
                  const total = payload.reduce((s, p) => s + (p.value as number || 0), 0);
                  return (
                    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl min-w-[160px]">
                      <p className="font-medium mb-1.5">{label}</p>
                      {payload.filter((p) => (p.value as number) > 0).reverse().map((p) => {
                        const catIdx = catKeys.indexOf(p.dataKey as string);
                        const catName = catIdx >= 0 ? data.categories[catIdx] : (p.dataKey as string);
                        return (
                        <div key={p.dataKey as string} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
                            <span className="text-muted-foreground">{catName}</span>
                          </div>
                          <span className="font-mono font-medium tabular-nums">
                            {metricCfg.format(p.value as number)}
                          </span>
                        </div>
                        );
                      })}
                      {metricCfg.aggregate === "sum" && payload.length > 1 && (
                        <div className="flex justify-between gap-3 mt-1 pt-1 border-t border-border/50 font-medium">
                          <span>Total</span>
                          <span className="font-mono tabular-nums">{metricCfg.format(total)}</span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {!isSingle ? (
                visibleCatKeys.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="a"
                    fill={`var(--color-${key})`}
                    radius={i === visibleCatKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))
              ) : (
                <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ChartContainer>
          {!isSingle && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
              {visibleCategories.map((cat) => {
                const idx = catIndexMap.get(cat)!;
                return (
                  <div key={cat} className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                    />
                    <span className="text-muted-foreground">{cat}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data table */}
      <Card className="py-0 gap-0">
        <CardHeader className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
          <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-stone-100">
            {isSingle ? visibleCategories[0] : `${metricCfg.label} by ${groupLabel}`} — {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {!isSingle ? (
              // Multi-column table: one column per visible category
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 dark:border-stone-800 text-left">
                    <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                      Period
                    </th>
                    {visibleCategories.map((cat) => (
                      <th
                        key={cat}
                        className="pb-2 pr-3 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 whitespace-nowrap"
                      >
                        {cat}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.buckets.map((bucket) => (
                    <tr key={bucket.key}>
                      <td className="py-2 pr-4 font-medium whitespace-nowrap">{bucket.label}</td>
                      {visibleCategories.map((cat) => (
                        <td key={cat} className="py-2 pr-3 text-right tabular-nums">
                          {metricCfg.format(bucket.categories[cat]?.[metric] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-stone-300 dark:border-stone-700 font-semibold">
                    <td className="py-2 pr-4">
                      {metricCfg.aggregate === "sum" ? "Total" : "Average"}
                    </td>
                    {visibleCategories.map((cat) => (
                      <td key={cat} className="py-2 pr-3 text-right tabular-nums">
                        {metricCfg.format(computeTotal(cat))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            ) : (
              // Single category table
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 dark:border-stone-800 text-left">
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
                        {metricCfg.format(bucket.categories[visibleCategories[0]]?.[metric] ?? 0)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-stone-300 dark:border-stone-700 font-semibold">
                    <td className="py-2 pr-4">
                      {metricCfg.aggregate === "sum" ? "Total" : "Average"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {metricCfg.format(computeTotal(visibleCategories[0]))}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
