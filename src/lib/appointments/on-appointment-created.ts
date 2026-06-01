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
import {
  appointmentAckSMS,
  bookingRequestInternalSMS,
} from "@/lib/messaging/templates";
import { serviceLabel, formatEtDate, formatHourLabel } from "@/lib/appointments/display";
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
  // For the internal owner alert (fanned out to INTERNAL_NOTIFICATION_PHONES):
  firstName: string;
  lastName: string;
  serviceCategory: string; // raw enum, e.g. "brakes"
  preferredDate: string; // YYYY-MM-DD
  preferredTime: string; // HH:MM (24h)
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

  // Internal "new booking request" alert to the shop owners. Best-effort + always
  // runs (even with no linked customer — the owners still want to know a request
  // came in). A failure here never affects the customer ack above or the booking.
  await notifyOwnersOfBookingRequest(opts);

  return { smsSent, smsError, messageLogged };
}

// Fan out an internal alert to the owner list (INTERNAL_NOTIFICATION_PHONES — the
// same list the payment-received alert uses). Each send is independently caught,
// so one bad number doesn't drop the others, and nothing here throws.
async function notifyOwnersOfBookingRequest(opts: {
  firstName: string;
  lastName: string;
  serviceCategory: string;
  preferredDate: string;
  preferredTime: string;
}): Promise<void> {
  const raw = process.env.INTERNAL_NOTIFICATION_PHONES;
  const phones = raw ? raw.split(",").map((p) => p.trim()).filter(Boolean) : [];
  if (phones.length === 0) return;

  // Wrap the whole thing: a missing shop line, a formatter, anything — must never
  // bubble into the booking flow. Per-send failures are caught individually below
  // so one bad number doesn't drop the rest.
  try {
    const from = getPhoneNumber("shop");
    const when = `${formatEtDate(opts.preferredDate)} · ${formatHourLabel(opts.preferredTime)}`;
    const body = bookingRequestInternalSMS({
      firstName: opts.firstName,
      lastName: opts.lastName,
      service: serviceLabel(opts.serviceCategory),
      when,
    });
    await Promise.all(
      phones.map((to) =>
        sendSMS({ to, body, from }).catch((err) => {
          console.error(
            `[onAppointmentCreated] owner booking alert to ${to} failed:`,
            err instanceof Error ? err.message : err
          );
        })
      )
    );
  } catch (err) {
    console.error(
      "[onAppointmentCreated] owner booking alert skipped:",
      err instanceof Error ? err.message : err
    );
  }
}
