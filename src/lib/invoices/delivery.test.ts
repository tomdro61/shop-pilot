import { describe, it, expect } from "vitest";
import { isFirstDelivery, wasSentRecently, describeGap } from "./delivery";

const NOW = new Date("2026-08-04T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

describe("isFirstDelivery", () => {
  it("is true for a draft that was never sent", () => {
    expect(isFirstDelivery({ status: "draft", last_sent_at: null })).toBe(true);
  });

  it("is false for a draft that has already been delivered once", () => {
    // Otherwise a customer who got the first text would be told a second time
    // that their invoice "is ready".
    expect(isFirstDelivery({ status: "draft", last_sent_at: hoursAgo(50) })).toBe(false);
  });

  it("is false for a pre-migration invoice with no recorded send", () => {
    // last_sent_at was added without backfill, so null means unknown. Treating
    // these as first-sends would tell long-since-billed customers their invoice
    // "is ready" — the reason the predicate isn't keyed on last_sent_at alone.
    expect(isFirstDelivery({ status: "sent", last_sent_at: null })).toBe(false);
    expect(isFirstDelivery({ status: "paid", last_sent_at: null })).toBe(false);
  });
});

describe("wasSentRecently", () => {
  it("is false when nothing is recorded — unknown is not recent", () => {
    expect(wasSentRecently(null, NOW)).toBe(false);
  });

  it("is true inside the 24h window and false outside it", () => {
    expect(wasSentRecently(hoursAgo(1), NOW)).toBe(true);
    expect(wasSentRecently(hoursAgo(23), NOW)).toBe(true);
    expect(wasSentRecently(hoursAgo(25), NOW)).toBe(false);
  });

  it("is false exactly at the boundary", () => {
    expect(wasSentRecently(hoursAgo(24), NOW)).toBe(false);
  });

  it("does not throw the throttle open on an unparseable timestamp", () => {
    expect(wasSentRecently("not-a-date", NOW)).toBe(false);
  });
});

describe("describeGap", () => {
  it("reads naturally at each boundary", () => {
    expect(describeGap(hoursAgo(0), NOW)).toBe("less than an hour ago");
    expect(describeGap(hoursAgo(1), NOW)).toBe("1 hour ago");
    expect(describeGap(hoursAgo(3), NOW)).toBe("3 hours ago");
  });

  it("degrades rather than rendering NaN", () => {
    expect(describeGap("not-a-date", NOW)).toBe("recently");
  });
});
