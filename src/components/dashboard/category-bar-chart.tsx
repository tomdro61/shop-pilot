"use client";

import { useId } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

const CATEGORY_COLORS = [
  "oklch(0.60 0.20 250)",  // blue
  "oklch(0.65 0.18 162)",  // teal
  "oklch(0.70 0.18 80)",   // amber
  "oklch(0.58 0.22 304)",  // purple
  "oklch(0.62 0.22 25)",   // red-orange
  "oklch(0.65 0.18 145)",  // green
  "oklch(0.55 0.20 280)",  // indigo
  "oklch(0.68 0.15 200)",  // cyan
];

interface CategoryBarChartProps {
  title: string;
  data: { category: string; value: number }[];
  valueLabel: string;
  isCurrency?: boolean;
}

export function CategoryBarChart({
  title,
  data,
  valueLabel,
  isCurrency = false,
}: CategoryBarChartProps) {
  const chartId = useId().replace(/:/g, "");
  const formatValue = isCurrency
    ? (v: number) => formatCurrency(v)
    : (v: number) => v.toString();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            No data for this period
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartConfig: ChartConfig = {
    value: {
      label: valueLabel,
      color: CATEGORY_COLORS[0],
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart
            data={data}
            margin={{ left: 0, right: 8, top: 8, bottom: 60 }}
          >
            <defs>
              {data.map((_, i) => {
                const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                return (
                  <linearGradient
                    key={`grad-${chartId}-${i}`}
                    id={`grad-${chartId}-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.45} />
                  </linearGradient>
                );
              })}
            </defs>
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              height={60}
              interval={0}
            />
            <YAxis tickFormatter={formatValue} tick={{ fontSize: 11 }} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatValue(Number(value))}
                />
              }
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={`url(#grad-${chartId}-${i})`}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
