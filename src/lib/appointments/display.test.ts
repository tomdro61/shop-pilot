import { describe, it, expect } from "vitest";
import {
  etDateOf,
  etTimeOf,
  formatEtDate,
  formatEtTime,
  defaultEtTimeForWindow,
  customerInitials,
  vehicleLabel,
  relativeTime,
} from "./display";
import { etDateTimeToUtcIso } from "@/lib/utils";

describe("etDateOf / etTimeOf", () => {
  it("extracts ET date + time from a UTC instant (EDT)", () => {
    // 2026-06-05 17:00Z = 1:00 PM EDT
    expect(etDateOf("2026-06-05T17:00:00.000Z")).toBe("2026-06-05");
    expect(etTimeOf("2026-06-05T17:00:00.000Z")).toBe("13:00");
  });

  it("extracts ET date + time from a UTC instant (EST)", () => {
    // 2026-01-15 14:00Z = 9:00 AM EST
    expect(etDateOf("2026-01-15T14:00:00.000Z")).toBe("2026-01-15");
    expect(etTimeOf("2026-01-15T14:00:00.000Z")).toBe("09:00");
  });

  it("emits 00:00 (not 24:00) at ET midnight and keeps the ET date", () => {
    // 2026-06-05 04:00Z = 12:00 AM EDT
    expect(etTimeOf("2026-06-05T04:00:00.000Z")).toBe("00:00");
    expect(etDateOf("2026-06-05T04:00:00.000Z")).toBe("2026-06-05");
  });

  it("uses the ET calendar date even when the UTC instant is the next day", () => {
    // 2026-07-16 03:30Z = 11:30 PM EDT on July 15
    expect(etDateOf("2026-07-16T03:30:00.000Z")).toBe("2026-07-15");
    expect(etTimeOf("2026-07-16T03:30:00.000Z")).toBe("23:30");
  });
});

describe("reschedule round-trip (etDateOf/etTimeOf → etDateTimeToUtcIso)", () => {
  // The reschedule dialog seeds its inputs from etDateOf/etTimeOf(scheduled_at),
  // then submits them back through etDateTimeToUtcIso. That must reproduce the
  // same instant, or "Reschedule" silently shifts the stored time.
  it("round-trips an EDT instant exactly", () => {
    const iso = "2026-07-15T17:00:00.000Z"; // 1:00 PM EDT
    expect(etDateTimeToUtcIso(etDateOf(iso), etTimeOf(iso))).toBe(iso);
  });

  it("round-trips an EST instant exactly", () => {
    const iso = "2026-01-15T14:00:00.000Z"; // 9:00 AM EST
    expect(etDateTimeToUtcIso(etDateOf(iso), etTimeOf(iso))).toBe(iso);
  });

  it("round-trips a late-evening ET instant that lands on the next UTC day", () => {
    const iso = "2026-07-16T03:30:00.000Z"; // 11:30 PM EDT, July 15
    expect(etDateTimeToUtcIso(etDateOf(iso), etTimeOf(iso))).toBe(iso);
  });
});

describe("formatEtDate", () => {
  it("formats a date-only string and a same-day UTC instant identically", () => {
    expect(formatEtDate("2026-06-05")).toBe("Fri, Jun 5");
    expect(formatEtDate("2026-06-05T17:00:00.000Z")).toBe("Fri, Jun 5");
  });

  it("keeps a date-only EST date on the right day (noon-UTC anchor)", () => {
    expect(formatEtDate("2026-01-01")).toBe("Thu, Jan 1");
  });
});

describe("formatEtTime", () => {
  it("formats midnight and noon ET", () => {
    expect(formatEtTime("2026-06-05T04:00:00.000Z")).toBe("12:00 AM"); // midnight EDT
    expect(formatEtTime("2026-06-05T16:00:00.000Z")).toBe("12:00 PM"); // noon EDT
  });
});

describe("defaultEtTimeForWindow", () => {
  it("maps morning → 09:00, afternoon → 13:00, unknown → 09:00", () => {
    expect(defaultEtTimeForWindow("morning")).toBe("09:00");
    expect(defaultEtTimeForWindow("afternoon")).toBe("13:00");
    expect(defaultEtTimeForWindow("")).toBe("09:00");
  });
});

describe("customerInitials", () => {
  it("takes up to two initials, uppercased, collapsing whitespace", () => {
    expect(customerInitials("Maria Silva")).toBe("MS");
    expect(customerInitials("Cher")).toBe("C");
    expect(customerInitials("  tom   digregorio  ")).toBe("TD");
    expect(customerInitials("a b c")).toBe("AB");
  });

  it("returns empty string for blank input without throwing", () => {
    expect(customerInitials("")).toBe("");
    expect(customerInitials("   ")).toBe("");
  });
});

describe("vehicleLabel", () => {
  it("joins present parts and drops nulls", () => {
    expect(vehicleLabel(2018, "Honda", "Accord")).toBe("2018 Honda Accord");
    expect(vehicleLabel(null, "Toyota", "Camry")).toBe("Toyota Camry");
    expect(vehicleLabel(null, null, null)).toBe("");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-06-05T12:00:00.000Z").getTime();
  it("buckets into just now / m / h / d", () => {
    expect(relativeTime(new Date(now - 30_000).toISOString(), now)).toBe("just now");
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5m ago");
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3h ago");
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("2d ago");
  });

  it("treats a future timestamp as just now (never negative)", () => {
    expect(relativeTime(new Date(now + 60_000).toISOString(), now)).toBe("just now");
  });
});
