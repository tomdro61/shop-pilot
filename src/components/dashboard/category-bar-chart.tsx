"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

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
  const formatValue = isCurrency
    ? (v: number) => formatCurrency(v)
    : (v: number) => v.toString();
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
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
      color: "var(--chart-1)",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
          >
            <XAxis type="number" tickFormatter={formatValue} />
            <YAxis
              type="category"
              dataKey="category"
              width={120}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatValue(Number(value))}
                />
              }
            />
            <Bar
              dataKey="value"
              fill="var(--color-value)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
