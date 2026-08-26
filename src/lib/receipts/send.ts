// Deliberately NOT a "use server" module. Every export in a "use server" file is
// an independently invokable server action with its own action id, reachable by
// POSTing to any route in the app. This function takes an arbitrary destination
// and sends mail from the shop's verified domain, so exposing it as an action id
// would be an open relay. It is called only from the manager server action
// (src/lib/actions/receipts.ts) and the staff API route (src/app/api/receipts/send).
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getShopSettings } from "@/lib/actions/settings";
import { calculateTotals } from "@/lib/utils/totals";
import { paymentReceiptEmail } from "@/lib/resend/templates";
import { sendEmail } from "@/lib/resend/client";
import { receiptSMS } from "@/lib/messaging/templates";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { toE164 } from "@/lib/quo/format";
import { logOutboundSms } from "@/lib/messaging/log";
import { WALK_IN_CUSTOMER_ID } from "@/lib/constants";

export type ChannelResult = { sent: true; testMode?: boolean } | { sent: false; error: string };

export type SendJobReceiptResult =
  | { ok: false; error: string }
  | { ok: true; email?: ChannelResult; sms?: ChannelResult };

export interface SendJobReceiptParams {
  jobId: string;
  /** Send by email. With `emailTo`, sends there; otherwise to the address on file. */
  email: boolean;
  /** Send by text. With `smsTo`, sends there; otherwise to the number on file. */
  sms: boolean;
  /**
   * Per-transaction destinations. Used for this send only and never written to
   * `customers` — a counter sale has no customer of its own to write to, and the
   * walk-in row is shared by all of them.
   */
  emailTo?: string | null;
  smsTo?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendJobReceiptWith(
  supabase: SupabaseClient<Database>,
  { jobId, email, sms, emailTo, smsTo }: SendJobReceiptParams
): Promise<SendJobReceiptResult> {
  if (!email && !sms) return { ok: false, error: "Select at least one way to send the receipt" };

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, title, payment_status, payment_method, receipt_token, customer_id, charge_sales_tax, customers(id, first_name, phone, email), vehicles(year, make, model, license_plate, vin), job_line_items(type, description, quantity, unit_cost)"
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) return { ok: false, error: "Job not found" };
  if (job.payment_status !== "paid") {
    return { ok: false, error: "This job isn't marked paid yet — a receipt can only be sent for a paid job." };
  }
  if (!job.receipt_token) {
    // Every job carries a DB-default token; a null here means the migration
    // hasn't been applied. Fail loudly rather than text a broken link.
    return { ok: false, error: "Receipt link is unavailable for this job." };
  }

  // The email recomputes totals, and calculateTotals silently substitutes
  // DEFAULT_SETTINGS when settings is null — no shop supplies, no hazmat — which
  // could show a total that differs from what the customer actually paid.
  const settings = await getShopSettings();
  if (!settings) {
    return { ok: false, error: "Couldn't load shop settings — receipt not sent. Try again in a moment." };
  }

  const customer = job.customers as {
    id: string;
    first_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  if (!customer) return { ok: false, error: "Customer not found" };

  const vehicle = job.vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
    license_plate: string | null;
    vin: string | null;
  } | null;

  const isWalkIn = job.customer_id === WALK_IN_CUSTOMER_ID;
  const lineItems = (job.job_line_items || []) as {
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
  }[];

  const result: { email?: ChannelResult; sms?: ChannelResult } = {};

  // Each channel is isolated: a failure on one becomes a { sent:false } result
  // rather than aborting the send, so a bad email address never blocks the text
  // and the caller always gets a per-channel status back.
  if (email) {
    const to = emailTo?.trim() || customer.email;
    if (!to) {
      result.email = { sent: false, error: "No email address to send to" };
    } else if (!EMAIL_RE.test(to)) {
      result.email = { sent: false, error: "That doesn't look like a valid email address" };
    } else {
      try {
        const totals = calculateTotals(lineItems, settings, job.charge_sales_tax);
        const vehicleDesc = vehicle
          ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
            vehicle.license_plate ||
            vehicle.vin ||
            "Vehicle on file"
          : null;

        const { subject, html } = paymentReceiptEmail({
          customerName: isWalkIn ? null : customer.first_name,
          jobTitle: job.title,
          vehicleDesc,
          amount: totals.grandTotal,
          paymentMethod: job.payment_method || "stripe",
          lineItems,
          totals,
        });

        const r = await sendEmail({ to, subject, html });
        result.email = r.success
          ? { sent: true, testMode: r.testMode }
          : { sent: false, error: r.error ?? "Couldn't send the email" };

        await logMessage(supabase, {
          customerId: customer.id,
          jobId,
          channel: "email",
          body: subject,
          sent: r.success,
        });
      } catch (e) {
        result.email = { sent: false, error: e instanceof Error ? e.message : "Couldn't send the email" };
      }
    }
  }

  if (sms) {
    const raw = smsTo?.trim() || customer.phone;
    const to = raw ? toE164(raw) : null;
    if (!raw) {
      result.sms = { sent: false, error: "No phone number to send to" };
    } else if (!to) {
      result.sms = { sent: false, error: "That doesn't look like a valid phone number" };
    } else {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const body = receiptSMS({
          firstName: isWalkIn ? null : customer.first_name,
          year: vehicle?.year,
          make: vehicle?.make,
          model: vehicle?.model,
          link: `${appUrl}/receipt/${job.receipt_token}`,
        });

        const r = await sendSMS({ to, body, from: getPhoneNumber("shop") });
        result.sms = { sent: true, testMode: r.testMode };

        await logOutboundSms(supabase, {
          customer_id: customer.id,
          job_id: jobId,
          body,
          status: "sent",
          phone_line: "shop",
        });
      } catch (e) {
        result.sms = { sent: false, error: e instanceof Error ? e.message : "Couldn't send the text" };
        await logOutboundSms(supabase, {
          customer_id: customer.id,
          job_id: jobId,
          body: "Receipt text — not sent",
          status: "failed",
          phone_line: "shop",
        });
      }
    }
  }

  return { ok: true, ...result };
}

async function logMessage(
  supabase: SupabaseClient<Database>,
  {
    customerId,
    jobId,
    channel,
    body,
    sent,
  }: {
    customerId: string;
    jobId: string;
    channel: "email" | "sms";
    body: string;
    sent: boolean;
  }
) {
  const { error } = await supabase.from("messages").insert({
    customer_id: customerId,
    job_id: jobId,
    channel,
    direction: "out" as const,
    body,
    status: sent ? "sent" : "failed",
  });

  if (error) {
    console.error("Failed to log receipt message:", error.message);
    Sentry.captureException(error, {
      tags: { source: "job-receipt", path: "message-log" },
      extra: { jobId, customerId, channel },
    });
  }
}
