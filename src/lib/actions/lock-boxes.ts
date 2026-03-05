"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { toE164 } from "@/lib/quo/format";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickupReadySMS } from "@/lib/messaging/templates";

export async function getLockBoxes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lock_boxes")
    .select("*")
    .order("box_number", { ascending: true });

  if (error) return [];
  return data;
}

export async function checkOutWithLockbox(reservationId: string, boxNumber: number) {
  const supabase = await createClient();

  // Get lock box code
  const { data: lockBox, error: lbError } = await supabase
    .from("lock_boxes")
    .select("box_number, code")
    .eq("box_number", boxNumber)
    .single();

  if (lbError || !lockBox) return { error: "Lock box not found" };

  // Get reservation details for SMS
  const { data: reservation, error: resError } = await supabase
    .from("parking_reservations")
    .select("id, first_name, phone, customer_id, status")
    .eq("id", reservationId)
    .single();

  if (resError || !reservation) return { error: "Reservation not found" };
  if (reservation.status !== "checked_in") return { error: "Reservation must be checked in to check out" };

  // Update reservation
  const { error: updateError } = await supabase
    .from("parking_reservations")
    .update({
      status: "checked_out" as const,
      checked_out_at: new Date().toISOString(),
      lock_box_number: boxNumber,
    })
    .eq("id", reservationId);

  if (updateError) return { error: updateError.message };

  // Send pickup SMS with lock box info
  if (reservation.phone) {
    const e164 = toE164(reservation.phone);
    if (e164) {
      const body = pickupReadySMS({
        firstName: reservation.first_name,
        boxNumber: lockBox.box_number,
        boxCode: lockBox.code,
      });

      try {
        const from = getPhoneNumber("parking");
        await sendSMS({ to: e164, body, from });

        // Log to messages table
        if (reservation.customer_id) {
          const admin = createAdminClient();
          await admin.from("messages").insert({
            customer_id: reservation.customer_id,
            channel: "sms" as const,
            direction: "out" as const,
            body,
            phone_line: "parking",
          });
        }
      } catch (err) {
        console.error("Failed to send pickup SMS:", err);
        // Don't fail the checkout if SMS fails
      }
    }
  }

  revalidatePath("/parking");
  revalidatePath(`/parking/${reservationId}`);
  return { success: true };
}

export async function checkOutInPerson(reservationId: string) {
  const supabase = await createClient();

  const { data: reservation, error: resError } = await supabase
    .from("parking_reservations")
    .select("id, status")
    .eq("id", reservationId)
    .single();

  if (resError || !reservation) return { error: "Reservation not found" };
  if (reservation.status !== "checked_in") return { error: "Reservation must be checked in to check out" };

  const { error } = await supabase
    .from("parking_reservations")
    .update({
      status: "checked_out" as const,
      checked_out_at: new Date().toISOString(),
    })
    .eq("id", reservationId);

  if (error) return { error: error.message };

  revalidatePath("/parking");
  revalidatePath(`/parking/${reservationId}`);
  return { success: true };
}
