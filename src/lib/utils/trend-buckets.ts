import {
  subDays,
  subWeeks,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachWeekOfInterval,
  format,
  parseISO,
} from "date-fns";

export type Granularity = "day" | "week" | "month";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Generate time bucket keys and labels for a granularity + date range. */
export function buildBucketKeys(
  granularity: Granularity,
  startDate: string,
  endDate: string,
  year?: number
): Array<{ key: string; label: string }> {
  const entries: Array<{ key: string; label: string }> = [];

  if (granularity === "day") {
    for (const d of eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })) {
      entries.push({ key: toDateStr(d), label: format(d, "MMM d") });
    }
  } else if (granularity === "week") {
    for (const ws of eachWeekOfInterval({ start: parseISO(startDate), end: parseISO(endDate) }, { weekStartsOn: 1 })) {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      entries.push({ key: toDateStr(ws), label: `${format(ws, "MMM d")} – ${format(we, "MMM d")}` });
    }
  } else {
    for (let m = 1; m <= 12; m++) {
      entries.push({ key: `${year}-${String(m).padStart(2, "0")}`, label: MONTH_NAMES[m - 1] });
    }
  }

  return entries;
}

export function getBucketKey(dateStr: string, granularity: Granularity): string {
  if (granularity === "day") return dateStr;
  if (granularity === "week") {
    return toDateStr(startOfWeek(parseISO(dateStr), { weekStartsOn: 1 }));
  }
  return dateStr.substring(0, 7);
}

/** Convert a timestamptz string to an ET date string (YYYY-MM-DD). */
export function timestampToDateET(ts: string): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Compute date range for a given granularity. */
export function getDateRange(
  granularity: Granularity,
  today: string,
  year?: number
): { startDate: string; endDate: string; resolvedYear?: number } {
  const todayDate = parseISO(today);

  if (granularity === "day") {
    return { startDate: toDateStr(subDays(todayDate, 29)), endDate: today };
  }
  if (granularity === "week") {
    const weekStart = startOfWeek(subWeeks(todayDate, 11), { weekStartsOn: 1 });
    return { startDate: toDateStr(weekStart), endDate: today };
  }
  const resolvedYear = year || todayDate.getFullYear();
  return { startDate: `${resolvedYear}-01-01`, endDate: `${resolvedYear}-12-31`, resolvedYear };
}
