import { describe, it, expect } from "vitest";
import {
  appointmentAckSMS,
  appointmentConfirmedSMS,
  appointmentReminderSMS,
  receiptSMS,
} from "./templates";

describe("appointmentAckSMS", () => {
  it("promises 'within the hour' during open hours", () => {
    expect(appointmentAckSMS({ closed: false })).toBe(
      "Hi! We got your appointment request — we'll text you within the hour to confirm. — Broadway Motors"
    );
  });

  it("promises 'by 9am tomorrow' on a weekday evening", () => {
    expect(appointmentAckSMS({ closed: true, reason: "evening" })).toBe(
      "Hi! We got your appointment request — we'll text you by 9am tomorrow to confirm. — Broadway Motors"
    );
  });

  it("promises 'by 9am Monday' on a Saturday afternoon — never the closed Sunday", () => {
    const msg = appointmentAckSMS({ closed: true, reason: "saturday-afternoon" });
    expect(msg).toBe(
      "Hi! We got your appointment request — we'll text you by 9am Monday to confirm. — Broadway Motors"
    );
    // The whole point of the Saturday 1pm cutoff: don't promise a day we're shut.
    expect(msg).not.toContain("tomorrow");
  });

  it("promises 'by 9am Monday' on a Sunday", () => {
    expect(appointmentAckSMS({ closed: true, reason: "sunday" })).toBe(
      "Hi! We got your appointment request — we'll text you by 9am Monday to confirm. — Broadway Motors"
    );
  });
});

describe("appointmentConfirmedSMS", () => {
  it("includes the scheduled date, time, and service category", () => {
    expect(
      appointmentConfirmedSMS({
        scheduledDate: "Wed, Jun 3",
        scheduledTime: "9:30am",
        serviceCategory: "Brake Service",
      })
    ).toBe(
      "Confirmed for Wed, Jun 3 at 9:30am. See you then for your Brake Service. — Broadway Motors"
    );
  });
});

describe("appointmentReminderSMS", () => {
  it("includes the time, date, and the C/R reply instructions", () => {
    expect(
      appointmentReminderSMS({
        scheduledDate: "Wed, Jun 3",
        scheduledTime: "9:30am",
      })
    ).toBe(
      "Reminder: appointment tomorrow at 9:30am (Wed, Jun 3). Reply C to confirm or R to reschedule. — Broadway Motors"
    );
  });
});

describe("receiptSMS", () => {
  const link = "https://shop-pilot-rosy.vercel.app/receipt/abc";

  it("greets a real customer by name", () => {
    expect(receiptSMS({ firstName: "Maria", year: 2019, make: "Honda", model: "Civic", link })).toBe(
      `Hi Maria, here's your receipt from Broadway Motors for your 2019 Honda Civic: ${link}`
    );
  });

  // Quick Pay and walk-in jobs hang off the shared WALK_IN_CUSTOMER_ID row, whose
  // first_name is literally "Walk-In". Callers pass null for those; the message must
  // not greet a paying customer as "Hi Walk-In,".
  it("drops the greeting entirely for a counter sale", () => {
    const msg = receiptSMS({ firstName: null, link });
    expect(msg).toBe(`Here's your receipt from Broadway Motors: ${link}`);
    expect(msg).not.toContain("Walk-In");
    expect(msg).not.toContain("Hi ,");
    expect(msg).not.toContain("null");
  });

  it("omits the vehicle clause when the job has no vehicle", () => {
    expect(receiptSMS({ firstName: "Maria", link })).toBe(
      `Hi Maria, here's your receipt from Broadway Motors: ${link}`
    );
  });
});
