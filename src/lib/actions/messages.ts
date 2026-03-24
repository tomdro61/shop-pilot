"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/quo/format";
import { sendSMS, isQuoConfigured } from "@/lib/quo/client";
import { getPhoneNumber, type PhoneLine } from "@/lib/quo/routing";

export async function sendCustomerSMS({
  customerId,
  body,
  jobId,
  line = "shop",
}: {
  customerId: string;
  body: string;
  jobId?: string;
  line?: PhoneLine;
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
    const from = getPhoneNumber(line);
    const result = await sendSMS({ to: phone, body, from });

    // Log to messages table regardless of mode
    const { error: insertError } = await supabase.from("messages").insert({
      customer_id: customerId,
      job_id: jobId ?? null,
      channel: "sms" as const,
      direction: "out" as const,
      body,
      phone_line: line,
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

export async function sendVehicleReadySMS(jobId: string) {
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, customer_id, customers(id, first_name, last_name, phone), vehicles(year, make, model)")
    .eq("id", jobId)
    .single();

  if (jobError || !job) return { error: "Job not found" };
  if (job.status !== "complete") return { error: "Job must be complete to send ready text" };

  const customer = job.customers as { id: string; first_name: string; last_name: string; phone: string | null } | null;
  if (!customer?.phone) return { error: "Customer has no phone number" };

  const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
  const { vehicleReadySMS } = await import("@/lib/messaging/templates");

  return sendCustomerSMS({
    customerId: customer.id,
    body: vehicleReadySMS({
      firstName: customer.first_name,
      year: vehicle?.year,
      make: vehicle?.make,
      model: vehicle?.model,
      closeTime: "5:00 PM",
    }),
    jobId,
    line: "shop",
  });
}

export async function sendParkingSpecialsSMS(reservationId: string) {
  const supabase = await createClient();

  const { data: reservation, error: resError } = await supabase
    .from("parking_reservations")
    .select("id, first_name, phone, customer_id, status")
    .eq("id", reservationId)
    .single();

  if (resError || !reservation) return { error: "Reservation not found" };
  if (reservation.status !== "checked_in") return { error: "Can only send specials to checked-in reservations" };
  if (!reservation.phone) return { error: "Customer has no phone number" };
  if (!reservation.customer_id) return { error: "No linked customer" };

  const { PARKING_SPECIALS } = await import("@/lib/constants");
  const { parkingSpecialsSMS } = await import("@/lib/messaging/templates");

  const body = parkingSpecialsSMS({
    firstName: reservation.first_name,
    specials: PARKING_SPECIALS.map((s) => ({ label: s.label, price: s.price })),
  });

  const phone = toE164(reservation.phone);
  if (!phone) return { error: `Invalid phone number: ${reservation.phone}` };

  try {
    const from = getPhoneNumber("parking");
    const result = await sendSMS({ to: phone, body, from });

    await supabase.from("messages").insert({
      customer_id: reservation.customer_id,
      channel: "sms" as const,
      direction: "out" as const,
      body,
      phone_line: "parking",
    });

    await supabase
      .from("parking_reservations")
      .update({ specials_sent_at: new Date().toISOString() })
      .eq("id", reservationId);

    return { data: { sent: true, testMode: result.testMode } };
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
  phoneLine,
}: {
  customerPhone: string;
  body: string;
  phoneLine?: PhoneLine;
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
    phone_line: phoneLine ?? null,
  });

  if (error) return { error: error.message };
  return { data: { logged: true, customerId: customer.id } };
}
