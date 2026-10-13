// Turns rows of the `messages` log into an invoice send history. Pure, so the
// grouping rules are testable without a DOM or a database.

import type { Tables } from "@/types/supabase";

export type InvoiceDeliveryRow = Pick<
  Tables<"messages">,
  "id" | "job_id" | "channel" | "status" | "body" | "sent_at"
>;

export type DeliveryChannel = InvoiceDeliveryRow["channel"];

export type InvoiceDeliveryKind = "invoice" | "reminder" | "other";

export type InvoiceDeliveryGroup = {
  readonly jobId: string | null;
  readonly kind: InvoiceDeliveryKind;
  readonly sentAt: string;
  readonly channels: ReadonlyArray<{ channel: DeliveryChannel; failed: boolean }>;
  readonly excerpt: string;
};

// Text and email for one send are logged a couple of seconds apart by
// createInvoiceFromJob / resendInvoiceForJob. Anything inside this window with
// the same job and kind is one delivery; a later reminder is its own entry.
const SAME_SEND_WINDOW_MS = 2 * 60 * 1000;

// Matches the wording in lib/messaging/templates.ts (invoiceSentSMS,
// invoiceReminderSMS) and lib/resend/templates.ts (the invoice email's two
// subjects). A body that mentions an invoice but matches neither is "other":
// shown with its excerpt rather than mislabelled.
export function classifyInvoiceMessage(body: string): InvoiceDeliveryKind {
  const text = body.toLowerCase();
  if (text.includes("reminder from broadway motors") || text.includes("balance due")) {
    return "reminder";
  }
  if (text.includes("your invoice from broadway motors")) {
    return "invoice";
  }
  return "other";
}

export function allChannelsFailed(group: InvoiceDeliveryGroup): boolean {
  return group.channels.every((c) => c.failed);
}

type MutableGroup = {
  jobId: string | null;
  kind: InvoiceDeliveryKind;
  sentAt: string;
  channels: Array<{ channel: DeliveryChannel; failed: boolean }>;
  excerpt: string;
};

export function groupInvoiceDeliveries(rows: InvoiceDeliveryRow[]): InvoiceDeliveryGroup[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  const groups: MutableGroup[] = [];

  for (const row of sorted) {
    const kind = classifyInvoiceMessage(row.body);
    const failed = row.status === "failed";
    const last = groups[groups.length - 1];
    const sameSend =
      last &&
      last.jobId === row.job_id &&
      last.kind === kind &&
      !last.channels.some((c) => c.channel === row.channel) &&
      Date.parse(last.sentAt) - Date.parse(row.sent_at) <= SAME_SEND_WINDOW_MS;

    if (sameSend) {
      last.channels.push({ channel: row.channel, failed });
      continue;
    }

    groups.push({
      jobId: row.job_id,
      kind,
      sentAt: row.sent_at,
      channels: [{ channel: row.channel, failed }],
      excerpt: row.body.length > 80 ? `${row.body.slice(0, 79)}…` : row.body,
    });
  }

  return groups;
}
