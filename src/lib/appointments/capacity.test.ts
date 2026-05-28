import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAPS,
  defaultCapacityFor,
  effectiveCapacity,
} from "./capacity";

// Date sanity (independently verifiable):
//   2026-06-01 = Monday
//   2026-06-05 = Friday
//   2026-06-06 = Saturday
//   2026-06-07 = Sunday
//   2026-03-08 = Sunday — spring-forward DST transition in America/New_York
//   2026-11-01 = Sunday — fall-back DST transition in America/New_York
//   2024-02-29 = Thursday — leap day

describe("defaultCapacityFor", () => {
  it("returns weekday defaults (8/8) for Monday", () => {
    expect(defaultCapacityFor("2026-06-01")).toEqual(DEFAULT_CAPS.weekday);
  });

  it("returns weekday defaults for Tuesday/Wednesday/Thursday/Friday", () => {
    expect(defaultCapacityFor("2026-06-02")).toEqual(DEFAULT_CAPS.weekday);
    expect(defaultCapacityFor("2026-06-03")).toEqual(DEFAULT_CAPS.weekday);
    expect(defaultCapacityFor("2026-06-04")).toEqual(DEFAULT_CAPS.weekday);
    expect(defaultCapacityFor("2026-06-05")).toEqual(DEFAULT_CAPS.weekday);
  });

  it("returns saturday defaults (4/0) for Saturday", () => {
    expect(defaultCapacityFor("2026-06-06")).toEqual(DEFAULT_CAPS.saturday);
    expect(defaultCapacityFor("2026-06-06")).toEqual({ morning: 4, afternoon: 0 });
  });

  it("returns sunday defaults (0/0) for Sunday", () => {
    expect(defaultCapacityFor("2026-06-07")).toEqual(DEFAULT_CAPS.sunday);
    expect(defaultCapacityFor("2026-06-07")).toEqual({ morning: 0, afternoon: 0 });
  });

  it("is timezone-stable across DST transitions", () => {
    // Spring-forward Sunday — day-of-week math must not slip into Saturday/Monday
    expect(defaultCapacityFor("2026-03-08")).toEqual(DEFAULT_CAPS.sunday);
    // Fall-back Sunday
    expect(defaultCapacityFor("2026-11-01")).toEqual(DEFAULT_CAPS.sunday);
    // Day after spring-forward should still be Monday (weekday)
    expect(defaultCapacityFor("2026-03-09")).toEqual(DEFAULT_CAPS.weekday);
  });

  it("handles leap day", () => {
    // 2024-02-29 is a Thursday
    expect(defaultCapacityFor("2024-02-29")).toEqual(DEFAULT_CAPS.weekday);
  });

  it("throws on malformed input", () => {
    expect(() => defaultCapacityFor("06/01/2026")).toThrow();
    expect(() => defaultCapacityFor("2026-6-1")).toThrow();
    expect(() => defaultCapacityFor("")).toThrow();
    expect(() => defaultCapacityFor("not a date")).toThrow();
  });

  it("rejects semantically invalid dates that pass the regex", () => {
    // The regex permits 13 as month and 45 as day; the Number.isNaN(dow) guard
    // catches them at the Date layer where the constructor yields Invalid Date.
    expect(() => defaultCapacityFor("2026-13-45")).toThrow();
    expect(() => defaultCapacityFor("2026-02-30")).toThrow(); // no Feb 30
    expect(() => defaultCapacityFor("2026-00-15")).toThrow(); // no month 0
    expect(() => defaultCapacityFor("2026-06-00")).toThrow(); // no day 0
  });
});

describe("effectiveCapacity", () => {
  describe("no override", () => {
    it("uses weekday defaults", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01", // Monday
        bookedMorning: 2,
        bookedAfternoon: 3,
      });
      expect(cap.morning).toEqual({ max: 8, booked: 2, remaining: 6 });
      expect(cap.afternoon).toEqual({ max: 8, booked: 3, remaining: 5 });
      expect(cap.hasOverride).toBe(false);
      expect(cap.isClosed).toBe(false);
      expect(cap.note).toBeNull();
      expect(cap.date).toBe("2026-06-01");
    });

    it("uses saturday defaults (afternoon at 0)", () => {
      const cap = effectiveCapacity({
        date: "2026-06-06", // Saturday
        bookedMorning: 1,
        bookedAfternoon: 0,
      });
      expect(cap.morning).toEqual({ max: 4, booked: 1, remaining: 3 });
      expect(cap.afternoon).toEqual({ max: 0, booked: 0, remaining: 0 });
      expect(cap.isClosed).toBe(false); // morning still open
    });

    it("uses sunday defaults and marks day closed", () => {
      const cap = effectiveCapacity({
        date: "2026-06-07", // Sunday
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.morning.max).toBe(0);
      expect(cap.afternoon.max).toBe(0);
      expect(cap.isClosed).toBe(true);
    });
  });

  describe("with override", () => {
    it("override reduces a weekday from 8/8 to 4/4", () => {
      const cap = effectiveCapacity({
        date: "2026-06-03", // Wednesday
        override: { morning_max: 4, afternoon_max: 4 },
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.morning.max).toBe(4);
      expect(cap.afternoon.max).toBe(4);
      expect(cap.hasOverride).toBe(true);
    });

    it("override of 0/0 marks day closed", () => {
      const cap = effectiveCapacity({
        date: "2026-06-03", // Wednesday default 8/8
        override: { morning_max: 0, afternoon_max: 0 },
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.isClosed).toBe(true);
      expect(cap.morning.max).toBe(0);
      expect(cap.afternoon.max).toBe(0);
    });

    it("partial override — morning null falls through to weekday default 8", () => {
      const cap = effectiveCapacity({
        date: "2026-06-03",
        override: { morning_max: null, afternoon_max: 4 },
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.morning.max).toBe(8); // fallback
      expect(cap.afternoon.max).toBe(4); // override
      expect(cap.hasOverride).toBe(true);
    });

    it("partial override — afternoon null falls through", () => {
      const cap = effectiveCapacity({
        date: "2026-06-03",
        override: { morning_max: 2, afternoon_max: null },
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.morning.max).toBe(2);
      expect(cap.afternoon.max).toBe(8);
    });

    it("override with both fields null still flags hasOverride (manager left a note only)", () => {
      const cap = effectiveCapacity({
        date: "2026-06-03",
        override: { morning_max: null, afternoon_max: null },
        bookedMorning: 0,
        bookedAfternoon: 0,
        note: "Tom on vacation but caps unchanged",
      });
      expect(cap.morning.max).toBe(8);
      expect(cap.afternoon.max).toBe(8);
      expect(cap.hasOverride).toBe(true);
      expect(cap.note).toBe("Tom on vacation but caps unchanged");
    });

    it("override on Saturday can re-open afternoon", () => {
      const cap = effectiveCapacity({
        date: "2026-06-06", // Saturday — default afternoon 0
        override: { morning_max: null, afternoon_max: 2 },
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.morning.max).toBe(4); // saturday default
      expect(cap.afternoon.max).toBe(2); // override
      expect(cap.isClosed).toBe(false);
    });

    it("override on Sunday can re-open the day", () => {
      const cap = effectiveCapacity({
        date: "2026-06-07", // Sunday — default 0/0
        override: { morning_max: 2, afternoon_max: null },
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.morning.max).toBe(2);
      expect(cap.afternoon.max).toBe(0); // sunday default
      expect(cap.isClosed).toBe(false);
    });
  });

  describe("booked counts and remaining", () => {
    it("clamps remaining to zero when booked exceeds max", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01",
        bookedMorning: 12, // over the 8-slot weekday cap
        bookedAfternoon: 0,
      });
      expect(cap.morning.remaining).toBe(0); // clamped, not -4
      expect(cap.morning.booked).toBe(12); // booked is the actual count, not clamped
    });

    it("remaining = max when nothing booked", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01",
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.morning.remaining).toBe(8);
      expect(cap.afternoon.remaining).toBe(8);
    });

    it("remaining = 0 when booked equals max", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01",
        bookedMorning: 8,
        bookedAfternoon: 8,
      });
      expect(cap.morning.remaining).toBe(0);
      expect(cap.afternoon.remaining).toBe(0);
    });
  });

  describe("note handling", () => {
    it("note is null when not supplied", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01",
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.note).toBeNull();
    });

    it("preserves the supplied note", () => {
      const cap = effectiveCapacity({
        date: "2026-06-03",
        override: { morning_max: 4, afternoon_max: 4 },
        bookedMorning: 0,
        bookedAfternoon: 0,
        note: "Equipment delivery — light day",
      });
      expect(cap.note).toBe("Equipment delivery — light day");
    });
  });

  describe("input validation", () => {
    it("rejects negative bookedMorning", () => {
      expect(() =>
        effectiveCapacity({
          date: "2026-06-01",
          bookedMorning: -1,
          bookedAfternoon: 0,
        })
      ).toThrow(/bookedMorning/);
    });

    it("rejects negative bookedAfternoon", () => {
      expect(() =>
        effectiveCapacity({
          date: "2026-06-01",
          bookedMorning: 0,
          bookedAfternoon: -3,
        })
      ).toThrow(/bookedAfternoon/);
    });

    it("rejects non-integer booked counts", () => {
      expect(() =>
        effectiveCapacity({
          date: "2026-06-01",
          bookedMorning: 3.5,
          bookedAfternoon: 0,
        })
      ).toThrow(/bookedMorning/);
    });
  });

  describe("invariant: remaining always in [0, max]", () => {
    it("holds across the booked range", () => {
      const max = 8;
      // Cover: nothing booked, partial, exactly full, over capacity, way over
      const bookedCases = [0, 1, 4, 7, 8, 9, 100];
      for (const booked of bookedCases) {
        const cap = effectiveCapacity({
          date: "2026-06-01", // Monday, weekday default 8/8
          override: { morning_max: max, afternoon_max: null },
          bookedMorning: booked,
          bookedAfternoon: 0,
        });
        expect(cap.morning.remaining).toBeGreaterThanOrEqual(0);
        expect(cap.morning.remaining).toBeLessThanOrEqual(max);
      }
    });
  });

  describe("hasOverride flag", () => {
    it("is false when override is omitted", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01",
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.hasOverride).toBe(false);
    });

    it("is false when override is explicitly null", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01",
        override: null,
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.hasOverride).toBe(false);
    });

    it("is true when an override object is supplied, even with both fields null", () => {
      const cap = effectiveCapacity({
        date: "2026-06-01",
        override: { morning_max: null, afternoon_max: null },
        bookedMorning: 0,
        bookedAfternoon: 0,
      });
      expect(cap.hasOverride).toBe(true);
    });
  });
});

// Lockstep guard: the PL/pgSQL trigger in 20260601000001_appointments.sql
// (function enforce_appointment_capacity) hardcodes the SAME default cap values
// as DEFAULT_CAPS above. If either side changes without the other, the booking
// form will offer slots the DB rejects (or vice versa) — silently.
//
// This test reads the migration file and asserts the expected literals appear
// in the trigger's CASE expression. It's a string-match, not a real DB call,
// so it won't catch all drift — but it catches the common "I updated TS but
// forgot SQL" case.
describe("SQL ↔ TS parity (lockstep guard)", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260601000001_appointments.sql"
  );

  it("migration file exists at the expected path", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("DEFAULT_CAPS values appear in the appointments capacity trigger", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Saturday morning cap
    expect(sql).toMatch(
      new RegExp(
        `when weekday = 6 and new\\.preferred_time_window = 'morning' then ${DEFAULT_CAPS.saturday.morning}`
      )
    );

    // Saturday afternoon cap (currently 0 — afternoon closed)
    expect(sql).toMatch(
      new RegExp(
        `when weekday = 6 and new\\.preferred_time_window = 'afternoon' then ${DEFAULT_CAPS.saturday.afternoon}`
      )
    );

    // Sunday — must be 0 to match DEFAULT_CAPS.sunday
    expect(DEFAULT_CAPS.sunday.morning).toBe(0);
    expect(DEFAULT_CAPS.sunday.afternoon).toBe(0);
    expect(sql).toMatch(/when weekday = 0 then 0/);

    // Weekday morning + afternoon default (the trailing `else N` branch)
    expect(DEFAULT_CAPS.weekday.morning).toBe(DEFAULT_CAPS.weekday.afternoon);
    expect(sql).toMatch(new RegExp(`else ${DEFAULT_CAPS.weekday.morning}\\b`));
  });
});
