"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { COLUMN_HEADER } from "@/components/ui/section-card";
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
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40">
      <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
        <h3 className={COLUMN_HEADER}>Revenue — Last 6 Months</h3>
      </div>
      <div className="px-4 py-3">
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
                  <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-card px-3 py-2 text-xs shadow-md">
                    <p className="font-medium text-stone-900 dark:text-stone-50">{label}</p>
                    <p className="text-stone-900 dark:text-stone-50 font-mono font-medium tabular-nums mt-0.5">
                      {formatCurrency(payload[0].value as number)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
