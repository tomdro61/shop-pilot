"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { logOutboundSms } from "@/lib/messaging/log";
import { appointmentConfirmedSMS } from "@/lib/messaging/templates";
import { etDateTimeToUtcIso, formatTimeEt } from "@/lib/utils";
import { APPOINTMENT_SERVICE_LABELS } from "@/lib/constants";
import type { ActionResult } from "./_types";
import type { Database } from "@/types/supabase";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
type ServerClient = Awaited<ReturnType<typeof createClient>>;

// ── Reads ──────────────────────────────────────────────────

export type AppointmentInbox = {
  pending: Appointment[];
  confirmed: Appointment[];
  terminal: Appointment[];
};

// Terminal rows (cancelled/completed/converted) stay on the inbox for a rolling
// window so the manager has recent context without the list growing forever.
const TERMINAL_WINDOW_DAYS = 14;

export async function getAppointmentInbox(): Promise<AppointmentInbox> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const cutoff = Date.now() - TERMINAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return {
    pending: rows.filter((r) => r.status === "pending"),
    confirmed: rows
      .filter((r) => r.status === "confirmed")
      .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")),
    terminal: rows.filter(
      (r) =>
        (r.status === "cancelled" ||
          r.status === "completed" ||
          r.status === "converted_to_job") &&
        new Date(r.updated_at).getTime() >= cutoff
    ),
  };
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function getPendingAppointmentCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export type AppointmentMessage = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "id" | "body" | "direction" | "status" | "phone_line" | "sent_at"
>;

// Communication timeline for the detail page: the ack / confirmation / reminder
// SMS logged against this appointment via related_appointment_id.
export async function getAppointmentMessages(
  appointmentId: string
): Promise<AppointmentMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, body, direction, status, phone_line, sent_at")
    .eq("related_appointment_id", appointmentId)
    .order("sent_at", { ascending: true });
  if (error) {
    console.error(
      `[getAppointmentMessages] query failed for ${appointmentId}:`,
      error.message
    );
    return [];
  }
  return data ?? [];
}

// ── Mutations ──────────────────────────────────────────────

// Sends the confirmation SMS on the shop line + logs it. Best-effort: a send
// failure is logged (status:'failed') but does NOT fail the action — the
// appointment is already confirmed/rescheduled and the manager can resend.
async function sendConfirmationSms(
  supabase: ServerClient,
  appt: Pick<
    Appointment,
    "id" | "customer_id" | "snapshot_customer_phone" | "service_category"
  >,
  scheduledAtIso: string
): Promise<void> {
  const body = appointmentConfirmedSMS({
    scheduledDate: new Date(scheduledAtIso).toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    scheduledTime: formatTimeEt(scheduledAtIso),
    serviceCategory:
      APPOINTMENT_SERVICE_LABELS[appt.service_category] ?? "service",
  });

  let smsSent = false;
  try {
    await sendSMS({
      to: appt.snapshot_customer_phone,
      body,
      from: getPhoneNumber("shop"),
    });
    smsSent = true;
  } catch (err) {
    console.error(`[appointments] confirmation SMS failed for ${appt.id}:`, err);
  }

  if (appt.customer_id) {
    await logOutboundSms(supabase, {
      customer_id: appt.customer_id,
      body,
      phone_line: "shop",
      status: smsSent ? "sent" : "failed",
      related_appointment_id: appt.id,
    });
  }
}

export async function confirmAppointment(
  id: string,
  opts: { etDate: string; etTime: string }
): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  let scheduledAt: string;
  try {
    scheduledAt = etDateTimeToUtcIso(opts.etDate, opts.etTime);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid date or time",
    };
  }

  const supabase = await createClient();

  const { data: appt, error: loadErr } = await supabase
    .from("appointments")
    .select("id, status, customer_id, snapshot_customer_phone, service_category")
    .eq("id", id)
    .single();
  if (loadErr || !appt) return { ok: false, error: "Appointment not found" };
  if (appt.status !== "pending") {
    return {
      ok: false,
      error: `Only pending appointments can be confirmed (this one is ${appt.status}).`,
    };
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      status: "confirmed",
      scheduled_at: scheduledAt,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await sendConfirmationSms(supabase, appt, scheduledAt);

  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function rescheduleAppointment(
  id: string,
  opts: { etDate: string; etTime: string }
): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  let scheduledAt: string;
  try {
    scheduledAt = etDateTimeToUtcIso(opts.etDate, opts.etTime);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid date or time",
    };
  }

  const supabase = await createClient();

  const { data: appt, error: loadErr } = await supabase
    .from("appointments")
    .select("id, status, customer_id, snapshot_customer_phone, service_category")
    .eq("id", id)
    .single();
  if (loadErr || !appt) return { ok: false, error: "Appointment not found" };
  if (appt.status !== "confirmed") {
    return { ok: false, error: "Only confirmed appointments can be rescheduled." };
  }

  const { error } = await supabase
    .from("appointments")
    .update({ scheduled_at: scheduledAt })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await sendConfirmationSms(supabase, appt, scheduledAt);

  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function cancelAppointment(id: string): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();

  const { data: appt, error: loadErr } = await supabase
    .from("appointments")
    .select("status")
    .eq("id", id)
    .single();
  if (loadErr || !appt) return { ok: false, error: "Appointment not found" };
  if (appt.status === "converted_to_job") {
    return {
      ok: false,
      error: "This appointment was already converted to a job and can't be cancelled.",
    };
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
