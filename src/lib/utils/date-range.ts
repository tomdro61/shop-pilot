import {
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subYears,
  differenceInDays,
  parseISO,
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

export interface ResolvedDateRange {
  from: string;
  to: string;
  priorFrom: string | null;
  priorTo: string | null;
  label: string;
  isAllTime: boolean;
}

/**
 * Resolves a date range preset into concrete date strings.
 *
 * Prior period logic: "same slice of the prior period"
 *   - This Week (Mon–Today)  → prior = same weekdays last week (Mon–same day last week)
 *   - This Month (1st–Today) → prior = same days last month (1st–same day last month)
 *   - This Quarter            → prior = same offset into last quarter
 *   - This Year               → prior = same offset into last year
 *   - Custom                  → prior = same number of days ending the day before start
 *   - All Time                → no prior (null)
 */
export function resolveDateRange(
  range?: string,
  from?: string,
  to?: string
): ResolvedDateRange {
  // Use ET date to match job date_finished values (set via todayET())
  const now = new Date(todayET() + "T12:00:00");
  const weekOpts = { weekStartsOn: 1 as const };
  const today = toDateStr(now);

  switch (range) {
    case "this_week": {
      const weekFrom = toDateStr(startOfWeek(now, weekOpts));
      // Prior: same weekdays last week (subtract 7 days from both)
      const priorFrom = toDateStr(subDays(parseISO(weekFrom), 7));
      const priorTo = toDateStr(subDays(now, 7));
      return {
        from: weekFrom,
        to: today,
        priorFrom,
        priorTo,
        label: "This Week",
        isAllTime: false,
      };
    }
    case "this_quarter": {
      const qFrom = toDateStr(startOfQuarter(now));
      // Prior: same offset into last quarter (subtract 3 months from both)
      const priorFrom = toDateStr(startOfQuarter(subMonths(now, 3)));
      const priorTo = toDateStr(subMonths(now, 3));
      return {
        from: qFrom,
        to: today,
        priorFrom,
        priorTo,
        label: "This Quarter",
        isAllTime: false,
      };
    }
    case "this_year": {
      const yFrom = toDateStr(startOfYear(now));
      // Prior: same offset into last year (subtract 1 year from both)
      const priorFrom = toDateStr(startOfYear(subYears(now, 1)));
      const priorTo = toDateStr(subYears(now, 1));
      return {
        from: yFrom,
        to: today,
        priorFrom,
        priorTo,
        label: "This Year",
        isAllTime: false,
      };
    }
    case "all_time":
      return {
        from: "2000-01-01",
        to: today,
        priorFrom: null,
        priorTo: null,
        label: "All Time",
        isAllTime: true,
      };
    case "custom":
      if (from && to) {
        // Prior: same number of days ending the day before start
        const days = differenceInDays(parseISO(to), parseISO(from));
        const priorEnd = subDays(parseISO(from), 1);
        const priorStart = subDays(priorEnd, days);
        return {
          from,
          to,
          priorFrom: toDateStr(priorStart),
          priorTo: toDateStr(priorEnd),
          label: `${from} – ${to}`,
          isAllTime: false,
        };
      }
      break;
    default:
      break;
  }

  // Default: this month
  const mFrom = toDateStr(startOfMonth(now));
  // Prior: same days last month (1st through same day-of-month)
  const priorFrom = toDateStr(startOfMonth(subMonths(now, 1)));
  const priorTo = toDateStr(subMonths(now, 1));
  return {
    from: mFrom,
    to: today,
    priorFrom,
    priorTo,
    label: "This Month",
    isAllTime: false,
  };
}
