// Turns rows of the `messages` log into the "when did the invoice go out"
// history shown on the job and customer pages. Pure, so the grouping rules
// are testable without a DOM or a database.

export type InvoiceDeliveryRow = {
  id: string;
  job_id: string | null;
  channel: "sms" | "email";
  status: string | null;
  body: string;
  sent_at: string;
};

export type InvoiceDeliveryKind = "invoice" | "reminder" | "other";

export type InvoiceDeliveryGroup = {
  jobId: string | null;
  kind: InvoiceDeliveryKind;
  sentAt: string;
  channels: Array<"sms" | "email">;
  failedChannels: Array<"sms" | "email">;
  excerpt: string;
};

// Text and email for one send are logged a couple of seconds apart by
// createInvoiceFromJob / resendInvoiceForJob. Anything inside this window with
// the same job and kind is one delivery; a later reminder is its own row.
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

export function groupInvoiceDeliveries(rows: InvoiceDeliveryRow[]): InvoiceDeliveryGroup[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  const groups: InvoiceDeliveryGroup[] = [];

  for (const row of sorted) {
    const kind = classifyInvoiceMessage(row.body);
    const last = groups[groups.length - 1];
    const sameSend =
      last &&
      last.jobId === row.job_id &&
      last.kind === kind &&
      !last.channels.includes(row.channel) &&
      Date.parse(last.sentAt) - Date.parse(row.sent_at) <= SAME_SEND_WINDOW_MS;

    if (sameSend) {
      last.channels.push(row.channel);
      if (row.status === "failed") last.failedChannels.push(row.channel);
      continue;
    }

    groups.push({
      jobId: row.job_id,
      kind,
      sentAt: row.sent_at,
      channels: [row.channel],
      failedChannels: row.status === "failed" ? [row.channel] : [],
      excerpt: row.body.length > 80 ? `${row.body.slice(0, 79)}…` : row.body,
    });
  }

  return groups;
}
