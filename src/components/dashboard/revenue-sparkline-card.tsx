"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface RevenueSparklineCardProps {
  label: string;
  value: number;
  previous: number;
  previousLabel: string;
  sparklineData: { date: string; revenue: number }[];
}

export function RevenueSparklineCard({
  label,
  value,
  previous,
  previousLabel,
  sparklineData,
}: RevenueSparklineCardProps) {
  const diff =
    previous > 0
      ? ((value - previous) / previous) * 100
      : value > 0
        ? 100
        : 0;
  const isUp = diff >= 0;

  return (
    <Card className="border-t-2 border-t-emerald-500 dark:border-t-emerald-400 gap-0 py-0 overflow-hidden">
      <CardContent className="px-4 pt-3 pb-0">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">
            {label}
          </p>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-400/10">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">
          {formatCurrency(value)}
        </p>
        <div className="mt-1 flex items-center gap-1">
          {isUp ? (
            <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
          )}
          <span
            className={`text-xs font-medium tabular-nums ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
          >
            {isUp ? "+" : ""}
            {diff.toFixed(0)}%
          </span>
          <span className="text-xs text-muted-foreground">{previousLabel}</span>
        </div>
      </CardContent>
      <div className="h-10 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`sparkGrad-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.6 0.18 160)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="oklch(0.6 0.18 160)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="oklch(0.6 0.18 160)"
              strokeWidth={1.5}
              fill={`url(#sparkGrad-${label.replace(/\s/g, "")})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
