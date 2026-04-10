"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

const chartConfig: ChartConfig = {
  value: {
    label: "Revenue",
    color: "oklch(0.55 0.15 250)",
  },
};

interface ReportsOverviewChartProps {
  data: Array<{ label: string; value: number }>;
}

export function ReportsOverviewChart({ data }: ReportsOverviewChartProps) {
  return (
    <Card className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-bold">Revenue — Last 6 Months</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <ChartTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                    <p className="font-medium">{label}</p>
                    <p className="text-foreground font-mono font-medium tabular-nums mt-0.5">
                      {formatCurrency(payload[0].value as number)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
