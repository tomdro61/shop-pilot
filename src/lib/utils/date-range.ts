import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
} from "date-fns";
import { todayET } from "@/lib/utils";

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

export type DateRangePreset =
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "all_time"
  | "custom";

export function resolveDateRange(
  range?: string,
  from?: string,
  to?: string
): { from: string; to: string; label: string; isAllTime: boolean } {
  // Use ET date to match job date_finished values (set via todayET())
  const now = new Date(todayET() + "T12:00:00");
  const weekOpts = { weekStartsOn: 1 as const };

  switch (range) {
    case "this_week":
      return {
        from: toDateStr(startOfWeek(now, weekOpts)),
        to: toDateStr(endOfWeek(now, weekOpts)),
        label: "This Week",
        isAllTime: false,
      };
    case "this_quarter":
      return {
        from: toDateStr(startOfQuarter(now)),
        to: toDateStr(endOfQuarter(now)),
        label: "This Quarter",
        isAllTime: false,
      };
    case "this_year":
      return {
        from: toDateStr(startOfYear(now)),
        to: toDateStr(endOfYear(now)),
        label: "This Year",
        isAllTime: false,
      };
    case "all_time":
      return {
        from: "2000-01-01",
        to: toDateStr(now),
        label: "All Time",
        isAllTime: true,
      };
    case "custom":
      if (from && to) {
        return { from, to, label: `${from} – ${to}`, isAllTime: false };
      }
      break;
    default:
      break;
  }

  // Default: this month
  return {
    from: toDateStr(startOfMonth(now)),
    to: toDateStr(endOfMonth(now)),
    label: "This Month",
    isAllTime: false,
  };
}
