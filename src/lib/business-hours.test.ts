import { describe, it, expect } from "vitest";
import { getBusinessClosedState, isShopClosed } from "./business-hours";

// Dates chosen for known ET weekdays in June 2026 (EDT, UTC-4):
//   Wed 2026-06-03, Sat 2026-06-06, Sun 2026-06-07.
// Inputs are absolute UTC instants so the assertions hold regardless of the
// test runner's own timezone (the function re-anchors to ET internally).

describe("getBusinessClosedState", () => {
  it("is open on a weekday mid-morning", () => {
    // Wed 10:00am EDT
    expect(getBusinessClosedState(new Date("2026-06-03T14:00:00Z"))).toEqual({
      closed: false,
    });
  });

  it("is still open at 5:59pm on a weekday (cutoff is 6pm)", () => {
    expect(getBusinessClosedState(new Date("2026-06-03T21:59:00Z"))).toEqual({
      closed: false,
    });
  });

  it("flips to 'evening' at 6:00pm on a weekday", () => {
    expect(getBusinessClosedState(new Date("2026-06-03T22:00:00Z"))).toEqual({
      closed: true,
      reason: "evening",
    });
  });

  it("uses 'evening' on Friday after 6pm (tomorrow is Saturday, still open)", () => {
    // Fri 2026-06-05, 6pm EDT. The ack copy's "by 9am tomorrow" is correct here
    // because Saturday morning is open — Friday is not a special case.
    expect(getBusinessClosedState(new Date("2026-06-05T22:00:00Z"))).toEqual({
      closed: true,
      reason: "evening",
    });
  });

  it("honors the cutoffs in EST (winter), not just EDT — guards the DST re-anchor", () => {
    // Wed 2026-01-07 (EST, UTC-5): 5:59pm EST = 22:59Z (open), 6:00pm EST = 23:00Z
    // (evening). A regression to a hardcoded -4 offset passes the June tests but
    // fails this one.
    expect(getBusinessClosedState(new Date("2026-01-07T22:59:00Z"))).toEqual({
      closed: false,
    });
    expect(getBusinessClosedState(new Date("2026-01-07T23:00:00Z"))).toEqual({
      closed: true,
      reason: "evening",
    });
  });

  it("is open at 12:59pm on Saturday (morning only)", () => {
    expect(getBusinessClosedState(new Date("2026-06-06T16:59:00Z"))).toEqual({
      closed: false,
    });
  });

  it("flips to 'saturday-afternoon' at 1:00pm Saturday", () => {
    expect(getBusinessClosedState(new Date("2026-06-06T17:00:00Z"))).toEqual({
      closed: true,
      reason: "saturday-afternoon",
    });
  });

  it("is closed all day Sunday", () => {
    expect(getBusinessClosedState(new Date("2026-06-07T15:00:00Z"))).toEqual({
      closed: true,
      reason: "sunday",
    });
  });
});

describe("isShopClosed", () => {
  it("is false during open hours and true when closed", () => {
    expect(isShopClosed(new Date("2026-06-03T14:00:00Z"))).toBe(false);
    expect(isShopClosed(new Date("2026-06-07T15:00:00Z"))).toBe(true);
  });
});
