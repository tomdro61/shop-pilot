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
