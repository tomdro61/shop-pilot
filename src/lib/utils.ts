import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Get today's date as YYYY-MM-DD in Eastern Time (America/New_York). */
export function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Get a Date object representing "now" in Eastern Time, for computing week/month bounds. */
export function nowET(): Date {
  const eastern = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(eastern);
}

/** Format a Date to YYYY-MM-DD in Eastern Time. */
export function formatDateET(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Whole days between two YYYY-MM-DD strings (or ISO timestamps), never negative.
 * Uses T12:00:00 to avoid DST-edge shifting by one day around clock changes.
 */
export function daysBetween(from: string | null, today: string): number {
  if (!from) return 0;
  const fromDay = from.includes("T") ? from.slice(0, 10) : from;
  const todayDay = today.includes("T") ? today.slice(0, 10) : today;
  const f = new Date(fromDay + "T12:00:00");
  const t = new Date(todayDay + "T12:00:00");
  return Math.max(0, Math.floor((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)));
}
