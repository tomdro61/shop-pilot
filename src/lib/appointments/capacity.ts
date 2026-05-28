// Pure capacity math for online appointment booking. No DB calls — server queries
// pass in `bookedMorning`/`bookedAfternoon` counts; this module turns them into
// "how many slots are left" alongside the default + manager override.
//
// Defaults live in code (not the DB) so the operator can change shop hours by
// editing one constant. The PL/pgSQL capacity trigger in migration
// `20260601000001_appointments.sql` (function `enforce_appointment_capacity`)
// hardcodes the SAME defaults in a CASE expression — when these constants
// change, that trigger must change in lockstep or the form and the DB will
// disagree about who's full.
//
// Per BOOKING_TECHNICAL_PLAN.md §4 / §7.4.

export type TimeWindow = "morning" | "afternoon";

export type DayDefaults = { morning: number; afternoon: number };

export const DEFAULT_CAPS = {
  weekday: { morning: 8, afternoon: 8 },
  saturday: { morning: 4, afternoon: 0 },
  sunday: { morning: 0, afternoon: 0 },
} as const satisfies Record<"weekday" | "saturday" | "sunday", DayDefaults>;

export type DayCapacityWindow = {
  max: number;
  booked: number;
  remaining: number;
};

export type DayCapacity = {
  date: string; // YYYY-MM-DD in ET
  morning: DayCapacityWindow;
  afternoon: DayCapacityWindow;
  isClosed: boolean; // both windows at 0 — Sunday by default, or weekday with override 0/0
  hasOverride: boolean; // a daily_capacity_overrides row exists for this date
  note: string | null; // free-text from the override row (e.g., "Tom on vacation")
};

export type CapacityOverride = {
  morning_max: number | null;
  afternoon_max: number | null;
};

export type EffectiveCapacityInput = {
  date: string; // YYYY-MM-DD in ET
  override?: CapacityOverride | null;
  bookedMorning: number;
  bookedAfternoon: number;
  note?: string | null;
};

/**
 * Day-of-week defaults for a YYYY-MM-DD ET date. Parses as UTC noon so the
 * day-of-week is independent of the runtime's timezone — Vercel runs UTC,
 * dev machines may run anything.
 */
export function defaultCapacityFor(date: string): DayDefaults {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`defaultCapacityFor: expected YYYY-MM-DD, got "${date}"`);
  }
  const [, yStr, mStr, dStr] = match;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  // Component bounds — Date silently rolls invalid components over (Feb 30 → Mar 2,
  // month 13 → next-year January), which would let typo'd dates compute a real-looking
  // day-of-week and ship as if valid.
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`defaultCapacityFor: invalid date "${date}"`);
  }

  // Noon UTC is firmly inside the ET calendar day regardless of DST (ET is UTC-4
  // or UTC-5), so .getUTCDay() yields the day-of-week of the ET date.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  // Catch month-day mismatches (Feb 30, Apr 31, etc.) by verifying components round-trip.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`defaultCapacityFor: invalid date "${date}"`);
  }

  const dow = dt.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (dow === 0) return DEFAULT_CAPS.sunday;
  if (dow === 6) return DEFAULT_CAPS.saturday;
  return DEFAULT_CAPS.weekday;
}

/**
 * Combine default + override + booked counts into per-window remaining slots.
 * `remaining` is clamped to zero — over-capacity doesn't surface as negative.
 *
 * Override semantics (must match the SQL trigger AND the column comment on
 * daily_capacity_overrides.morning_max):
 *   null = use default
 *   0    = closed
 *   N    = explicit cap
 */
export function effectiveCapacity(opts: EffectiveCapacityInput): DayCapacity {
  if (!Number.isInteger(opts.bookedMorning) || opts.bookedMorning < 0) {
    throw new Error(
      `effectiveCapacity: bookedMorning must be a non-negative integer, got ${opts.bookedMorning}`
    );
  }
  if (!Number.isInteger(opts.bookedAfternoon) || opts.bookedAfternoon < 0) {
    throw new Error(
      `effectiveCapacity: bookedAfternoon must be a non-negative integer, got ${opts.bookedAfternoon}`
    );
  }

  const defaults = defaultCapacityFor(opts.date);
  const override = opts.override ?? null;

  const morningMax = override?.morning_max ?? defaults.morning;
  const afternoonMax = override?.afternoon_max ?? defaults.afternoon;

  const morning: DayCapacityWindow = {
    max: morningMax,
    booked: opts.bookedMorning,
    remaining: Math.max(0, morningMax - opts.bookedMorning),
  };
  const afternoon: DayCapacityWindow = {
    max: afternoonMax,
    booked: opts.bookedAfternoon,
    remaining: Math.max(0, afternoonMax - opts.bookedAfternoon),
  };

  return {
    date: opts.date,
    morning,
    afternoon,
    isClosed: morningMax === 0 && afternoonMax === 0,
    hasOverride: override !== null,
    note: opts.note ?? null,
  };
}
