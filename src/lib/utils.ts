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

/**
 * Returns the UTC instant of midnight ET on the given YYYY-MM-DD as an ISO
 * string. DST-aware via Intl. Used to build timestamptz query bounds for
 * "today in ET" filters that work correctly regardless of server timezone.
 */
function midnightEtAsUtcIso(etDateStr: string): string {
  // Probe at noon UTC on that date — safely lands inside the day in ET no
  // matter the offset (and avoids the ambiguous DST jump hour).
  const probe = new Date(`${etDateStr}T12:00:00Z`);
  const tzPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = tzPart.match(/GMT([+-]\d+)/);
  const offsetHours = m ? parseInt(m[1], 10) : -5;
  // Midnight ET as UTC = midnight UTC of same date shifted by -offsetHours.
  // EDT (-4): 04:00 UTC; EST (-5): 05:00 UTC.
  const [y, mo, d] = etDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, -offsetHours, 0, 0)).toISOString();
}

/**
 * Returns [start, end) UTC ISO bounds for "today in Eastern Time".
 * For use with Supabase `.gte/.lt` filters on timestamptz columns.
 */
export function todayEtBoundsUtc(): { startIso: string; endIso: string } {
  const today = todayET();
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return {
    startIso: midnightEtAsUtcIso(today),
    endIso: midnightEtAsUtcIso(tomorrow),
  };
}
