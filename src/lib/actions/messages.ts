"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/quo/format";
import { sendSMS, isQuoConfigured } from "@/lib/quo/client";

export async function sendCustomerSMS({
  customerId,
  body,
  jobId,
}: {
  customerId: string;
  body: string;
  jobId?: string;
}) {
  const supabase = await createClient();

  // Look up customer phone
  const { data: customer, error: custError } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone")
    .eq("id", customerId)
    .single();

  if (custError || !customer) return { error: "Customer not found" };
  if (!customer.phone) return { error: "Customer has no phone number on file" };

  const phone = toE164(customer.phone);
  if (!phone) return { error: `Invalid phone number: ${customer.phone}` };

  // Send via Quo (or test mode)
  try {
    const result = await sendSMS({ to: phone, body });

    // Log to messages table regardless of mode
    const { error: insertError } = await supabase.from("messages").insert({
      customer_id: customerId,
      job_id: jobId ?? null,
      channel: "sms" as const,
      direction: "out" as const,
      body,
    });

    if (insertError) {
      console.error("Failed to log outbound SMS:", insertError.message);
    }

    return {
      data: {
        sent: true,
        testMode: result.testMode,
        to: phone,
        customerName: `${customer.first_name} ${customer.last_name}`,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send SMS";
    return { error: message };
  }
}

export async function getCustomerMessages(customerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("customer_id", customerId)
    .order("sent_at", { ascending: false })
    .limit(50);

  if (error) return { error: error.message };
  return { data };
}

export async function getMessagesForJob(jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("job_id", jobId)
    .order("sent_at", { ascending: false })
    .limit(50);

  if (error) return { error: error.message };
  return { data };
}

export async function logInboundSMS({
  customerPhone,
  body,
}: {
  customerPhone: string;
  body: string;
}) {
  const phone = toE164(customerPhone);
  if (!phone) return { error: `Invalid phone number: ${customerPhone}` };

  const supabase = createAdminClient();

  // Match phone to a customer
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (!customer) {
    console.log(`[SMS] Inbound from unknown number: ${phone}`);
    return { error: "No customer found for this phone number" };
  }

  const { error } = await supabase.from("messages").insert({
    customer_id: customer.id,
    channel: "sms" as const,
    direction: "in" as const,
    body,
  });

  if (error) return { error: error.message };
  return { data: { logged: true, customerId: customer.id } };
}
