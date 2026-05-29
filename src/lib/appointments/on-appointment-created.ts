// Post-submit side effects for a new booking: send the acknowledgment SMS and
// log it to the customer's message timeline.
//
// Awaited by the submit route — NOT fire-and-forget (Vercel kills detached
// promises, and shop-pilot/CLAUDE.md forbids the pattern). A send failure is
// recorded as status:'failed' + console.error and returned via AckResult; it
// does not throw, because the appointment row is already saved by the time this
// runs. Per BOOKING_TECHNICAL_PLAN §6.2.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { logOutboundSms } from "@/lib/messaging/log";
import { appointmentAckSMS } from "@/lib/messaging/templates";
import type { BusinessClosedState } from "@/lib/business-hours";

export type AckResult = {
  smsSent: boolean;
  smsError?: string;
  messageLogged: boolean;
};

export async function onAppointmentCreated(opts: {
  appointmentId: string;
  customerId: string | null; // null when find-or-create-customer failed
  phone: string; // already E.164
  closedState: BusinessClosedState;
}): Promise<AckResult> {
  const body = appointmentAckSMS(opts.closedState);

  let smsSent = false;
  let smsError: string | undefined;
  try {
    // Inside the try so a missing phone-line env throws into smsError (logged as
    // a status:'failed' row below) instead of propagating — the handler's
    // contract is to return AckResult, never throw.
    const from = getPhoneNumber("shop");
    await sendSMS({ to: opts.phone, body, from });
    smsSent = true;
  } catch (err) {
    smsError = err instanceof Error ? err.message : String(err);
    console.error(
      `[onAppointmentCreated] SMS send failed for ${opts.appointmentId}:`,
      smsError
    );
  }

  // Log to messages only when we have a customer_id — messages.customer_id is
  // NOT NULL, so a null id (find-or-create failed) can't be logged. The booking
  // still stands; the manager links it to a customer manually.
  let messageLogged = false;
  if (opts.customerId) {
    const supabase = createAdminClient();
    const { error } = await logOutboundSms(supabase, {
      customer_id: opts.customerId,
      body,
      phone_line: "shop",
      status: smsSent ? "sent" : "failed",
      related_appointment_id: opts.appointmentId,
    });
    messageLogged = !error;
  } else {
    console.warn(
      `[onAppointmentCreated] No customer_id for ${opts.appointmentId} — skipping ` +
        `messages log. Manager must link the appointment to a customer manually.`
    );
  }

  return { smsSent, smsError, messageLogged };
}
