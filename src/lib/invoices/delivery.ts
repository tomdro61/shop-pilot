// Pure predicates about invoice delivery, shared by the server action and the
// invoice card. They lived in both places as copies, which meant the button
// could say "Send" while the message that went out opened "reminder" — and
// neither copy was reachable by a test, since this repo has no DOM test setup.

const RECENT_SEND_MS = 24 * 60 * 60 * 1000;

interface DeliveryState {
  status: string;
  last_sent_at: string | null;
}

/**
 * Whether this send is the customer's first contact about the invoice, and so
 * should use "your invoice is ready" copy rather than reminder copy.
 *
 * This is an APPROXIMATION, and knowingly so. `createInvoiceFromJob` sets
 * `status` from the requested channels *before* its fire-and-forget sends run,
 * so a first send that failed silently still leaves `status: 'sent'` — that
 * invoice is treated as already-delivered and its genuine first contact will be
 * worded as a reminder. The alternative, keying on `last_sent_at` alone, is
 * worse: the column was added without backfill, so every invoice predating it
 * would be treated as never-sent and long-since-billed customers would be told
 * their invoice "is ready".
 *
 * Erring toward reminder copy on a rare silent failure beats erring toward
 * first-send copy on every historical invoice.
 */
export function isFirstDelivery(invoice: DeliveryState): boolean {
  return invoice.status === "draft" && !invoice.last_sent_at;
}

/** True when a reminder went out inside the throttle window. Null = unknown, not "never". */
export function wasSentRecently(lastSentAt: string | null, now: number = Date.now()): boolean {
  if (!lastSentAt) return false;
  const sentAt = new Date(lastSentAt).getTime();
  if (Number.isNaN(sentAt)) return false;
  return now - sentAt < RECENT_SEND_MS;
}

/** Human gap for the throttle warning: "3 hours ago". */
export function describeGap(from: string, now: number = Date.now()): string {
  const sentAt = new Date(from).getTime();
  if (Number.isNaN(sentAt)) return "recently";
  const hours = Math.floor((now - sentAt) / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour ago";
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}
