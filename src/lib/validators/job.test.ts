/**
 * Pin scheduled_time / scheduled_at behavior at the validator boundary.
 * The Vercel serverless runtime defaults to UTC, so the round-trip from
 * "manager picks 2:00 PM" → DB → "shows 2:00 PM" is what we're protecting.
 */
import { describe, it, expect } from "vitest";
import { jobSchema, prepareJobData, type JobFormData } from "./job";

const baseJob: JobFormData = {
  customer_id: "11111111-1111-4111-9111-111111111111",
  vehicle_id: null,
  status: "not_started",
  date_received: "2026-07-15",
  notes: "",
  payment_status: "unpaid",
};

describe("jobSchema scheduled_time", () => {
  it("accepts empty string", () => {
    const r = jobSchema.safeParse({ ...baseJob, scheduled_time: "" });
    expect(r.success).toBe(true);
  });

  it("accepts null", () => {
    const r = jobSchema.safeParse({ ...baseJob, scheduled_time: null });
    expect(r.success).toBe(true);
  });

  it("accepts undefined (omitted)", () => {
    const r = jobSchema.safeParse(baseJob);
    expect(r.success).toBe(true);
  });

  it("accepts well-formed HH:MM in 24h range", () => {
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "00:00" }).success).toBe(true);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "09:30" }).success).toBe(true);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "14:00" }).success).toBe(true);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "23:59" }).success).toBe(true);
  });

  it("rejects hour >= 24", () => {
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "24:00" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "25:00" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "99:00" }).success).toBe(false);
  });

  it("rejects minute >= 60", () => {
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "14:60" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "00:99" }).success).toBe(false);
  });

  it("rejects missing leading zero", () => {
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "9:30" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "14:5" }).success).toBe(false);
  });

  it("rejects non-time strings", () => {
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "abc" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...baseJob, scheduled_time: "1400" }).success).toBe(false);
  });
});

describe("prepareJobData scheduled_at", () => {
  it("returns null when scheduled_time is empty string", () => {
    const r = prepareJobData({ ...baseJob, scheduled_time: "" });
    expect(r.scheduled_at).toBeNull();
  });

  it("returns null when scheduled_time is null", () => {
    const r = prepareJobData({ ...baseJob, scheduled_time: null });
    expect(r.scheduled_at).toBeNull();
  });

  it("returns null when scheduled_time is omitted", () => {
    const r = prepareJobData(baseJob);
    expect(r.scheduled_at).toBeNull();
  });

  it("combines date_received + scheduled_time as UTC ISO during EDT", () => {
    // 14:00 ET on 2026-07-15 (EDT, UTC-4) = 18:00 UTC
    const r = prepareJobData({
      ...baseJob,
      date_received: "2026-07-15",
      scheduled_time: "14:00",
    });
    expect(r.scheduled_at).toBe("2026-07-15T18:00:00.000Z");
  });

  it("combines date_received + scheduled_time as UTC ISO during EST", () => {
    // 14:00 ET on 2026-01-15 (EST, UTC-5) = 19:00 UTC
    const r = prepareJobData({
      ...baseJob,
      date_received: "2026-01-15",
      scheduled_time: "14:00",
    });
    expect(r.scheduled_at).toBe("2026-01-15T19:00:00.000Z");
  });

  it("late-evening ET wraps to next day in UTC during EDT", () => {
    // 23:00 ET on 2026-07-15 (EDT) = 03:00 UTC on 2026-07-16
    const r = prepareJobData({
      ...baseJob,
      date_received: "2026-07-15",
      scheduled_time: "23:00",
    });
    expect(r.scheduled_at).toBe("2026-07-16T03:00:00.000Z");
  });
});
