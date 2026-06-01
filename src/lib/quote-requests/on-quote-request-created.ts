// Post-insert side effects for a new estimate (quote) request: the customer
// acknowledgment SMS (business-hours-aware) + the internal owner alert. Mirrors
// src/lib/appointments/on-appointment-created.ts.
//
// Awaited by the route, NOT fire-and-forget. Never throws — the quote_requests
// row is already saved by the time this runs, so a send failure is recorded and
// returned via QuoteAckResult, not turned into a 5xx.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { logOutboundSms } from "@/lib/messaging/log";
import { quoteRequestAckSMS, quoteRequestInternalSMS } from "@/lib/messaging/templates";
import type { BusinessClosedState } from "@/lib/business-hours";

export type QuoteAckResult = {
  smsSent: boolean;
  smsError?: string;
  messageLogged: boolean;
};

export async function onQuoteRequestCreated(opts: {
  customerId: string | null; // null when find-or-create-customer failed
  phone: string; // E.164
  closedState: BusinessClosedState;
  firstName: string;
  lastName: string;
  services: string[];
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
}): Promise<QuoteAckResult> {
  const body = quoteRequestAckSMS(opts.closedState);

  let smsSent = false;
  let smsError: string | undefined;
  try {
    // Inside the try so a missing phone-line env is recorded as a failed send
    // rather than propagating — the handler's contract is to return, never throw.
    const from = getPhoneNumber("shop");
    await sendSMS({ to: opts.phone, body, from });
    smsSent = true;
  } catch (err) {
    smsError = err instanceof Error ? err.message : String(err);
    console.error("[onQuoteRequestCreated] ack SMS failed:", smsError);
  }

  // Log to messages only with a customer_id (the column is NOT NULL). No
  // related_quote_request_id link yet — that column ships with the Tier-2 detail
  // page; for now the ack is on the customer's general timeline.
  let messageLogged = false;
  if (opts.customerId) {
    const supabase = createAdminClient();
    const { error } = await logOutboundSms(supabase, {
      customer_id: opts.customerId,
      body,
      phone_line: "shop",
      status: smsSent ? "sent" : "failed",
    });
    messageLogged = !error;
  }

  await notifyOwnersOfQuoteRequest(opts);

  return { smsSent, smsError, messageLogged };
}

// Fan out an internal alert to INTERNAL_NOTIFICATION_PHONES (the same list the
// payment-received + booking-request alerts use). Each send is independently
// caught; nothing here throws into the submission flow.
async function notifyOwnersOfQuoteRequest(opts: {
  firstName: string;
  lastName: string;
  services: string[];
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
}): Promise<void> {
  const raw = process.env.INTERNAL_NOTIFICATION_PHONES;
  const phones = raw ? raw.split(",").map((p) => p.trim()).filter(Boolean) : [];
  if (phones.length === 0) return;

  try {
    const from = getPhoneNumber("shop");
    const body = quoteRequestInternalSMS({
      firstName: opts.firstName,
      lastName: opts.lastName,
      vehicleYear: opts.vehicleYear,
      vehicleMake: opts.vehicleMake,
      vehicleModel: opts.vehicleModel,
      services: opts.services,
    });
    await Promise.all(
      phones.map((to) =>
        sendSMS({ to, body, from }).catch((err) => {
          console.error(
            `[onQuoteRequestCreated] owner alert to ${to} failed:`,
            err instanceof Error ? err.message : err
          );
        })
      )
    );
  } catch (err) {
    console.error(
      "[onQuoteRequestCreated] owner alert skipped:",
      err instanceof Error ? err.message : err
    );
  }
}
