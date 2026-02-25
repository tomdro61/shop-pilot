import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

const BAR_COLORS = [
  "bg-blue-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-emerald-500",
  "bg-indigo-500",
  "bg-cyan-500",
];

interface HorizontalBarChartProps {
  title: string;
  data: { label: string; revenue: number; jobCount: number }[];
}

export function HorizontalBarChart({ title, data }: HorizontalBarChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-stone-400 dark:text-stone-500">
            No data for this period
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((row, i) => {
            const pct = maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0;
            const color = BAR_COLORS[i % BAR_COLORS.length];
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm font-medium text-stone-700 dark:text-stone-300">
                  {row.label}
                </span>
                <div className="relative flex-1">
                  <div className="h-2 w-full rounded-full bg-stone-100 dark:bg-stone-800" />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${color}`}
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-50">
                  {formatCurrency(row.revenue)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-stone-400 dark:text-stone-500">
                  ({row.jobCount} {row.jobCount === 1 ? "job" : "jobs"})
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
