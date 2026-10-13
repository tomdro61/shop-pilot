import { describe, it, expect } from "vitest";
import {
  allChannelsFailed,
  classifyInvoiceMessage,
  groupInvoiceDeliveries,
  type InvoiceDeliveryRow,
} from "./deliveries";
import { invoiceSentSMS, invoiceReminderSMS } from "@/lib/messaging/templates";
import { invoiceReadyEmail } from "@/lib/resend/templates";

const JOB_A = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";
const JOB_B = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const INVOICE_SMS = invoiceSentSMS({ firstName: "EZY", year: 2018, make: "Ford", model: "Explorer", link: "https://x" });
const REMINDER_SMS = invoiceReminderSMS({ firstName: "EZY", year: 2018, make: "Chevy", model: "Cruze", amount: 3590, link: "https://x" });
const INVOICE_EMAIL = invoiceReadyEmail({ customerName: "EZY Rent", vehicleDesc: "2018 Ford Explorer", jobTitle: null, paymentUrl: "https://x", amount: 4665 }).subject;
const REMINDER_EMAIL = invoiceReadyEmail({ customerName: "EZY Rent", vehicleDesc: "2018 Chevy Cruze", jobTitle: null, paymentUrl: "https://x", amount: 3590, reminder: true }).subject;

function row(overrides: Partial<InvoiceDeliveryRow> & { sent_at: string }): InvoiceDeliveryRow {
  return {
    id: overrides.sent_at,
    job_id: JOB_A,
    channel: "sms",
    status: "sent",
    body: INVOICE_SMS,
    ...overrides,
  };
}

describe("classifyInvoiceMessage", () => {
  it("recognises what the live templates actually produce", () => {
    expect(classifyInvoiceMessage(INVOICE_SMS)).toBe("invoice");
    expect(classifyInvoiceMessage(INVOICE_EMAIL)).toBe("invoice");
    expect(classifyInvoiceMessage(REMINDER_SMS)).toBe("reminder");
    expect(classifyInvoiceMessage(REMINDER_EMAIL)).toBe("reminder");
  });

  it("does not mislabel a hand-written text that mentions the invoice", () => {
    expect(classifyInvoiceMessage("Hey, did you get the invoice I sent?")).toBe("other");
  });
});

describe("groupInvoiceDeliveries", () => {
  it("merges a text and an email sent seconds apart into one delivery, newest first", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31.829Z", channel: "email", body: INVOICE_EMAIL }),
      row({ sent_at: "2026-10-09T18:50:33.447Z", channel: "sms" }),
      row({ sent_at: "2026-09-25T18:18:04.675Z", channel: "sms" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      kind: "invoice",
      sentAt: "2026-10-09T18:50:33.447Z",
      channels: [
        { channel: "sms", failed: false },
        { channel: "email", failed: false },
      ],
    });
    expect(groups[1]).toMatchObject({
      sentAt: "2026-09-25T18:18:04.675Z",
      channels: [{ channel: "sms", failed: false }],
    });
  });

  it("still merges when the email lagged the text by a slow minute and a half", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:00Z", channel: "sms" }),
      row({ sent_at: "2026-10-09T18:51:30Z", channel: "email", body: INVOICE_EMAIL }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("does not merge beyond the two-minute window", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:00Z", channel: "sms" }),
      row({ sent_at: "2026-10-09T18:53:00Z", channel: "email", body: INVOICE_EMAIL }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps a reminder separate from the first send even on the same day", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-08-18T16:51:59Z", channel: "sms" }),
      row({ sent_at: "2026-08-18T17:21:35.208Z", channel: "sms", body: REMINDER_SMS }),
      row({ sent_at: "2026-08-18T17:21:35.681Z", channel: "email", body: REMINDER_EMAIL }),
    ]);

    expect(groups.map((g) => g.kind)).toEqual(["reminder", "invoice"]);
    expect(groups[0].channels.map((c) => c.channel)).toEqual(["email", "sms"]);
  });

  it("keeps a reminder separate from a first send even one second apart", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-08-18T16:51:59Z", channel: "sms" }),
      row({ sent_at: "2026-08-18T16:52:00Z", channel: "email", body: REMINDER_EMAIL }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["reminder", "invoice"]);
  });

  it("does not merge across jobs", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31Z", job_id: JOB_A }),
      row({ sent_at: "2026-10-09T18:50:32Z", job_id: JOB_B, channel: "email", body: INVOICE_EMAIL }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("does not merge two texts into one delivery even when close together", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31Z" }),
      row({ sent_at: "2026-10-09T18:50:45Z" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("marks a failed channel on the delivery it belongs to, and the delivery as not wholly failed", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31Z", channel: "sms", status: "failed" }),
      row({ sent_at: "2026-10-09T18:50:32Z", channel: "email", body: INVOICE_EMAIL }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].channels).toEqual([
      { channel: "email", failed: false },
      { channel: "sms", failed: true },
    ]);
    expect(allChannelsFailed(groups[0])).toBe(false);
  });

  it("reports a delivery whose only channel failed as wholly failed", () => {
    const [group] = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31Z", channel: "sms", status: "failed" }),
    ]);
    expect(allChannelsFailed(group)).toBe(true);
  });

  it("treats a null status as delivered, not failed", () => {
    const [group] = groupInvoiceDeliveries([row({ sent_at: "2026-10-09T18:50:31Z", status: null })]);
    expect(group.channels).toEqual([{ channel: "sms", failed: false }]);
  });

  it("truncates a long body to 79 characters plus an ellipsis", () => {
    const body = "x".repeat(100);
    const [group] = groupInvoiceDeliveries([row({ sent_at: "2026-10-09T18:50:31Z", body })]);
    expect(group.excerpt).toBe(`${"x".repeat(79)}…`);
    expect(group.excerpt).toHaveLength(80);
  });

  it("returns nothing for no rows", () => {
    expect(groupInvoiceDeliveries([])).toEqual([]);
  });
});
