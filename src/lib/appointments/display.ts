// Pure display helpers for appointment UI (card, detail, dialogs). Kept separate
// from the server actions so they're trivially unit-testable and usable in both
// server and client components.

import {
  APPOINTMENT_SERVICE_LABELS,
  APPOINTMENT_TIME_WINDOW_LABELS,
  APPOINTMENT_DROP_OFF_LABELS,
} from "@/lib/constants";

export function serviceLabel(category: string): string {
  return APPOINTMENT_SERVICE_LABELS[category] ?? category;
}

export function windowLabel(window: string): string {
  return APPOINTMENT_TIME_WINDOW_LABELS[window] ?? window;
}

export function dropOffLabel(value: string): string {
  return APPOINTMENT_DROP_OFF_LABELS[value] ?? value;
}

export function vehicleLabel(
  year: number | null,
  make: string | null,
  model: string | null
): string {
  return [year, make, model].filter(Boolean).join(" ");
}

export function customerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

// Default confirm time from the requested window: morning → 9:00, afternoon → 1:00.
// Returns a 24h HH:MM string the <input type="time"> default reads directly.
export function defaultEtTimeForWindow(window: string): string {
  return window === "afternoon" ? "13:00" : "09:00";
}

// ET calendar date (YYYY-MM-DD) of a UTC instant (en-CA → YYYY-MM-DD).
export function etDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

// ET wall-clock time (HH:MM, 24h) of a UTC instant (en-GB → 24h HH:MM).
export function etTimeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "Wed, Jun 5" — accepts a date-only string (YYYY-MM-DD) or a UTC instant.
// Date-only values are anchored at noon UTC so the ET calendar day never shifts.
export function formatEtDate(dateOrIso: string): string {
  const d = dateOrIso.includes("T")
    ? new Date(dateOrIso)
    : new Date(dateOrIso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// "1:00 PM" ET from a UTC instant.
export function formatEtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// "10:00" (HH:MM) → "10:00 AM" — the customer's requested booking hour.
export function formatHourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Compact submitted-ago label: "just now" / "5m ago" / "3h ago" / "2d ago".
export function relativeTime(iso: string, now: number = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
