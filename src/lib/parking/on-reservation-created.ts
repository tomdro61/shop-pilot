import { createOrUpdateQuoContact } from "@/lib/quo/contacts";
import { toE164 } from "@/lib/quo/format";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { reservationConfirmationSMS } from "@/lib/messaging/templates";

/**
 * Called after a parking reservation is created (from Wix webhook or direct form).
 * 1. Creates/updates a Quo contact with "Parking" tag
 * 2. Sends a confirmation SMS on the parking line
 * 3. Logs the SMS to the messages table
 *
 * Fire-and-forget — caller should not await this.
 */
export async function onReservationCreated({
  phone,
  firstName,
  lastName,
  email,
  dropOffDate,
  pickUpDate,
  customerId,
}: {
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  dropOffDate: string;
  pickUpDate: string;
  customerId: string | null;
}) {
  // 1. Create/update Quo contact (graceful failure)
  const e164Phone = toE164(phone);
  if (e164Phone) {
    createOrUpdateQuoContact({
      phone: e164Phone,
      firstName,
      lastName,
      email,
    }).catch((err) => console.error("[onReservationCreated] Quo contact error:", err));
  }

  // 2. Send confirmation SMS on parking line
  if (!e164Phone) {
    console.log("[onReservationCreated] No valid phone — skipping SMS");
    return;
  }

  // Format dates for human-readable display
  const formatDate = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  const body = reservationConfirmationSMS({
    firstName,
    dropOffDate: formatDate(dropOffDate),
    pickUpDate: formatDate(pickUpDate),
  });

  try {
    const from = getPhoneNumber("parking");
    await sendSMS({ to: e164Phone, body, from });

    // 3. Log to messages table if we have a customer ID
    if (customerId) {
      const supabase = createAdminClient();
      await supabase.from("messages").insert({
        customer_id: customerId,
        channel: "sms" as const,
        direction: "out" as const,
        body,
        phone_line: "parking",
      });
    }
  } catch (err) {
    console.error("[onReservationCreated] SMS send error:", err);
  }
}
