import { describe, it, expect } from "vitest";
import {
  classifyInvoiceMessage,
  groupInvoiceDeliveries,
  type InvoiceDeliveryRow,
} from "./deliveries";

const JOB_A = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";
const JOB_B = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

function row(overrides: Partial<InvoiceDeliveryRow> & { sent_at: string }): InvoiceDeliveryRow {
  return {
    id: overrides.sent_at,
    job_id: JOB_A,
    channel: "sms",
    status: "sent",
    body: "Hi EZY, your invoice from Broadway Motors for your 2018 Ford Explorer is ready. Pay here: https://x",
    ...overrides,
  };
}

describe("classifyInvoiceMessage", () => {
  it("recognises the first-send text and email", () => {
    expect(
      classifyInvoiceMessage("Hi Mike, your invoice from Broadway Motors is ready. Pay here: https://x")
    ).toBe("invoice");
    expect(classifyInvoiceMessage("Your invoice from Broadway Motors")).toBe("invoice");
  });

  it("recognises the reminder text and the balance-due email", () => {
    expect(
      classifyInvoiceMessage(
        "Hi Mike, reminder from Broadway Motors: your invoice has a balance of $10. Pay here: https://x"
      )
    ).toBe("reminder");
    expect(classifyInvoiceMessage("Your Broadway Motors invoice — balance due")).toBe("reminder");
  });

  it("does not mislabel a hand-written text that mentions the invoice", () => {
    expect(classifyInvoiceMessage("Hey, did you get the invoice I sent?")).toBe("other");
  });
});

describe("groupInvoiceDeliveries", () => {
  it("merges a text and an email sent seconds apart into one delivery, newest first", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31.829Z", channel: "email", body: "Your invoice from Broadway Motors" }),
      row({ sent_at: "2026-10-09T18:50:33.447Z", channel: "sms" }),
      row({ sent_at: "2026-09-25T18:18:04.675Z", channel: "sms" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      kind: "invoice",
      sentAt: "2026-10-09T18:50:33.447Z",
      channels: ["sms", "email"],
      failedChannels: [],
    });
    expect(groups[1]).toMatchObject({ sentAt: "2026-09-25T18:18:04.675Z", channels: ["sms"] });
  });

  it("keeps a reminder separate from the first send even on the same day", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-08-18T16:51:59Z", channel: "sms" }),
      row({
        sent_at: "2026-08-18T17:21:35.208Z",
        channel: "sms",
        body: "Hi EZY, reminder from Broadway Motors: your invoice has a balance of $3590.00. Pay here: https://x",
      }),
      row({
        sent_at: "2026-08-18T17:21:35.681Z",
        channel: "email",
        body: "Your Broadway Motors invoice — balance due",
      }),
    ]);

    expect(groups.map((g) => g.kind)).toEqual(["reminder", "invoice"]);
    expect(groups[0].channels).toEqual(["email", "sms"]);
  });

  it("does not merge across jobs", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31Z", job_id: JOB_A }),
      row({ sent_at: "2026-10-09T18:50:32Z", job_id: JOB_B, channel: "email" }),
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

  it("does not merge beyond the two-minute window", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:00Z", channel: "sms" }),
      row({ sent_at: "2026-10-09T18:53:00Z", channel: "email", body: "Your invoice from Broadway Motors" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("records a failed channel on the delivery it belongs to", () => {
    const groups = groupInvoiceDeliveries([
      row({ sent_at: "2026-10-09T18:50:31Z", channel: "sms", status: "failed" }),
      row({ sent_at: "2026-10-09T18:50:32Z", channel: "email", body: "Your invoice from Broadway Motors" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].failedChannels).toEqual(["sms"]);
  });

  it("returns nothing for no rows", () => {
    expect(groupInvoiceDeliveries([])).toEqual([]);
  });
});
