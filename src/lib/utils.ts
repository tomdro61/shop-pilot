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
 * The current Eastern Time UTC offset in hours for the given UTC instant.
 * EDT = -4, EST = -5. Throws if Intl returns an unexpected format — silent
 * EST fallback would produce a 1-hour drift in summer with no error signal.
 */
function getEtOffsetHours(probe: Date): number {
  const tzPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = tzPart.match(/GMT([+-]\d+)/);
  if (!m) {
    throw new Error(
      `getEtOffsetHours: unexpected Intl shortOffset format "${tzPart}" for ${probe.toISOString()}`
    );
  }
  return parseInt(m[1], 10);
}

/**
 * Combine a YYYY-MM-DD ET date and HH:MM ET time into a UTC ISO string.
 * Independent of process timezone — safe to call from Vercel server actions
 * where Node runs in UTC. Validates inputs to fail loudly on garbage rather
 * than silently storing wrong-time data.
 */
export function etDateTimeToUtcIso(etDate: string, etTime: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDate)) {
    throw new Error(`etDateTimeToUtcIso: expected YYYY-MM-DD, got "${etDate}"`);
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(etTime)) {
    throw new Error(`etDateTimeToUtcIso: expected HH:MM (24h), got "${etTime}"`);
  }
  const [y, mo, d] = etDate.split("-").map(Number);
  const [h, mi] = etTime.split(":").map(Number);
  // Probe at noon UTC of the date to safely land inside the day in ET no
  // matter the offset (and avoid the ambiguous DST jump hour).
  const probe = new Date(`${etDate}T12:00:00Z`);
  const offsetHours = getEtOffsetHours(probe);
  // ET wall-clock h:mi == UTC (h - offsetHours):mi.
  // EDT (-4): 14:00 ET == 18:00 UTC. EST (-5): 14:00 ET == 19:00 UTC.
  return new Date(Date.UTC(y, mo - 1, d, h - offsetHours, mi, 0)).toISOString();
}

/** Format a UTC ISO timestamp as ET wall-clock time, "2:00 PM" style. */
export function formatTimeEt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Does a stored UTC timestamp fall on the given ET calendar date?
 * Tolerates `null` (returns false). The `timeZone` option is the
 * load-bearing part — without it this would re-introduce the original
 * "scheduled_at filtered against UTC date" bug.
 */
export function isScheduledOnEtDate(
  scheduledAt: string | null,
  etDate: string
): boolean {
  if (!scheduledAt) return false;
  const rowEtDate = new Date(scheduledAt).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  return rowEtDate === etDate;
}

/**
 * Re-anchor a stored scheduled_at to a new drop-off date while keeping
 * the same ET wall-clock time. Used when the manager changes the drop-off
 * date on a job that already has a time set — the appointment stays at
 * the same time, just on a different day.
 */
export function shiftScheduledAtToNewDate(
  scheduledAtIso: string,
  newEtDate: string
): string {
  const time = new Date(scheduledAtIso).toLocaleTimeString("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });
  return etDateTimeToUtcIso(newEtDate, time);
}
