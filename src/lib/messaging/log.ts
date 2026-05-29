// Shared outbound-SMS logging into the `messages` table.
//
// Consolidates the insert that was inlined across the SMS senders (quote-requests,
// parking on-reservation-created, sendCustomerSMS). Per BOOKING_TECHNICAL_PLAN §6.2.
// `messages` has no `error` column — a failed send is recorded as status:'failed'
// and the underlying error is surfaced via the return value / console, not stored.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { PhoneLine } from "@/lib/quo/routing";

export type OutboundSmsLog = {
  customer_id: string;
  body: string;
  phone_line: PhoneLine;
  status: "sent" | "failed";
  job_id?: string | null;
  related_appointment_id?: string | null;
};

export async function logOutboundSms(
  supabase: SupabaseClient<Database>,
  log: OutboundSmsLog
): Promise<{ error?: string }> {
  const { error } = await supabase.from("messages").insert({
    customer_id: log.customer_id,
    job_id: log.job_id ?? null,
    channel: "sms" as const,
    direction: "out" as const,
    body: log.body,
    status: log.status,
    phone_line: log.phone_line,
    related_appointment_id: log.related_appointment_id ?? null,
  });

  if (error) {
    console.error("Failed to log outbound SMS:", error.message);
    return { error: error.message };
  }
  return {};
}
