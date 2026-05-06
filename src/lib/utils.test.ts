/**
 * Pin timezone correctness for the scheduled_at feature. The math here is
 * exactly the kind of thing that quietly breaks when DST flips or when
 * Vercel's UTC runtime parses ambiguous date strings — both happened to
 * the first version of this code, both are caught here now.
 */
import { describe, it, expect } from "vitest";
import { etDateTimeToUtcIso, formatTimeEt, isScheduledOnEtDate } from "./utils";

describe("etDateTimeToUtcIso", () => {
  describe("EDT (summer, UTC-4)", () => {
    it("14:00 ET on 2026-07-15 == 18:00 UTC", () => {
      expect(etDateTimeToUtcIso("2026-07-15", "14:00")).toBe(
        "2026-07-15T18:00:00.000Z"
      );
    });

    it("09:30 ET on 2026-06-01 == 13:30 UTC", () => {
      expect(etDateTimeToUtcIso("2026-06-01", "09:30")).toBe(
        "2026-06-01T13:30:00.000Z"
      );
    });

    it("midnight ET on 2026-08-04 == 04:00 UTC", () => {
      expect(etDateTimeToUtcIso("2026-08-04", "00:00")).toBe(
        "2026-08-04T04:00:00.000Z"
      );
    });

    it("23:59 ET on 2026-07-15 == 03:59 UTC of the next day", () => {
      expect(etDateTimeToUtcIso("2026-07-15", "23:59")).toBe(
        "2026-07-16T03:59:00.000Z"
      );
    });
  });

  describe("EST (winter, UTC-5)", () => {
    it("14:00 ET on 2026-01-15 == 19:00 UTC", () => {
      expect(etDateTimeToUtcIso("2026-01-15", "14:00")).toBe(
        "2026-01-15T19:00:00.000Z"
      );
    });

    it("09:30 ET on 2026-02-01 == 14:30 UTC", () => {
      expect(etDateTimeToUtcIso("2026-02-01", "09:30")).toBe(
        "2026-02-01T14:30:00.000Z"
      );
    });

    it("midnight ET on 2026-12-04 == 05:00 UTC", () => {
      expect(etDateTimeToUtcIso("2026-12-04", "00:00")).toBe(
        "2026-12-04T05:00:00.000Z"
      );
    });
  });

  describe("DST transition days", () => {
    // 2026 spring-forward: March 8, clocks jump 02:00 → 03:00 EST→EDT.
    // The probe at 12:00 UTC = 07:00 EST (before the jump) → -5 offset.
    // But by the time of the probe (noon UTC), it's already 08:00 EDT.
    // Either way, picking a time well after the jump (e.g., 14:00) should
    // resolve as EDT and produce 18:00 UTC.
    it("14:00 ET on 2026-03-08 (spring forward day) resolves as EDT == 18:00 UTC", () => {
      expect(etDateTimeToUtcIso("2026-03-08", "14:00")).toBe(
        "2026-03-08T18:00:00.000Z"
      );
    });

    // 2026 fall-back: November 1, clocks jump 02:00 → 01:00 EDT→EST.
    // 14:00 on Nov 1 is firmly in EST, so == 19:00 UTC.
    it("14:00 ET on 2026-11-01 (fall back day) resolves as EST == 19:00 UTC", () => {
      expect(etDateTimeToUtcIso("2026-11-01", "14:00")).toBe(
        "2026-11-01T19:00:00.000Z"
      );
    });

    it("14:00 ET on 2026-03-09 (first full EDT day) == 18:00 UTC", () => {
      expect(etDateTimeToUtcIso("2026-03-09", "14:00")).toBe(
        "2026-03-09T18:00:00.000Z"
      );
    });
  });

  describe("input validation", () => {
    it("throws on malformed date", () => {
      expect(() => etDateTimeToUtcIso("not-a-date", "14:00")).toThrow(
        /YYYY-MM-DD/
      );
    });

    it("throws on date with single-digit month", () => {
      expect(() => etDateTimeToUtcIso("2026-7-15", "14:00")).toThrow(
        /YYYY-MM-DD/
      );
    });

    it("throws on empty date", () => {
      expect(() => etDateTimeToUtcIso("", "14:00")).toThrow(/YYYY-MM-DD/);
    });

    it("throws on time with hour > 23", () => {
      expect(() => etDateTimeToUtcIso("2026-07-15", "25:00")).toThrow(/HH:MM/);
    });

    it("throws on time with minute > 59", () => {
      expect(() => etDateTimeToUtcIso("2026-07-15", "14:60")).toThrow(/HH:MM/);
    });

    it("throws on time without leading zero", () => {
      expect(() => etDateTimeToUtcIso("2026-07-15", "9:00")).toThrow(/HH:MM/);
    });

    it("throws on empty time", () => {
      expect(() => etDateTimeToUtcIso("2026-07-15", "")).toThrow(/HH:MM/);
    });
  });
});

describe("isScheduledOnEtDate", () => {
  it("returns false when scheduled_at is null", () => {
    expect(isScheduledOnEtDate(null, "2026-07-15")).toBe(false);
  });

  it("returns true when scheduled_at falls on the given ET date in EDT", () => {
    // 14:00 ET on 2026-07-15 (EDT) = 18:00 UTC same day
    const iso = etDateTimeToUtcIso("2026-07-15", "14:00");
    expect(isScheduledOnEtDate(iso, "2026-07-15")).toBe(true);
  });

  it("returns true for late-evening ET that wraps to next-day UTC", () => {
    // 23:30 ET on 2026-07-15 (EDT) = 03:30 UTC on 2026-07-16
    // The UTC date is "tomorrow" but the ET date is still 2026-07-15.
    const iso = etDateTimeToUtcIso("2026-07-15", "23:30");
    expect(iso.startsWith("2026-07-16")).toBe(true); // sanity
    expect(isScheduledOnEtDate(iso, "2026-07-15")).toBe(true);
    expect(isScheduledOnEtDate(iso, "2026-07-16")).toBe(false);
  });

  it("returns false for 00:01 of the next ET day", () => {
    const iso = etDateTimeToUtcIso("2026-07-16", "00:01");
    expect(isScheduledOnEtDate(iso, "2026-07-15")).toBe(false);
    expect(isScheduledOnEtDate(iso, "2026-07-16")).toBe(true);
  });

  it("works correctly across DST in EST", () => {
    // 23:30 ET on 2026-01-15 (EST) = 04:30 UTC on 2026-01-16
    const iso = etDateTimeToUtcIso("2026-01-15", "23:30");
    expect(isScheduledOnEtDate(iso, "2026-01-15")).toBe(true);
    expect(isScheduledOnEtDate(iso, "2026-01-16")).toBe(false);
  });
});

describe("formatTimeEt", () => {
  it("formats summer UTC ISO as ET 12-hour wall clock", () => {
    expect(formatTimeEt("2026-07-15T18:00:00.000Z")).toBe("2:00 PM");
  });

  it("formats winter UTC ISO as ET 12-hour wall clock", () => {
    expect(formatTimeEt("2026-01-15T19:00:00.000Z")).toBe("2:00 PM");
  });

  it("formats midnight ET", () => {
    expect(formatTimeEt("2026-07-15T04:00:00.000Z")).toBe("12:00 AM");
  });

  it("round-trips with etDateTimeToUtcIso for both DST regimes", () => {
    expect(formatTimeEt(etDateTimeToUtcIso("2026-07-15", "14:30"))).toBe(
      "2:30 PM"
    );
    expect(formatTimeEt(etDateTimeToUtcIso("2026-01-15", "09:15"))).toBe(
      "9:15 AM"
    );
  });
});
