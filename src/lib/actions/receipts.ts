"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/auth";
import { getShopSettings } from "@/lib/actions/settings";
import { sendPaymentReceiptEmail } from "@/lib/actions/email";
import { sendCustomerSMS } from "@/lib/actions/messages";
import { receiptSMS } from "@/lib/messaging/templates";

// Public read for the customer-facing /receipt/[token] page. Admin client to
// bypass RLS for an unauthenticated visitor — same pattern as
// getInspectionByToken / getEstimateByToken.
//
// The paid-only gate lives in the query (.eq("payment_status", "paid")) so an
// unpaid job's line items / customer details are never even fetched for this
// public codepath — a bad token and an unpaid job both return the same friendly
// null. Columns are enumerated (not `*`) so job_line_items.cost — wholesale
// pricing that DATABASE_SCHEMA.md marks "never exposed to customers" — never
// rides along into a public request. PGRST116 (no row) → null; any other error
// throws so a real outage isn't masked as "receipt not found".
export async function getReceiptByToken(token: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, ro_number, payment_method, paid_at, charge_sales_tax, date_finished, customers(first_name, last_name), vehicles(year, make, model), job_line_items(id, type, description, quantity, unit_cost, total, part_number, category)"
    )
    .eq("receipt_token", token)
    .eq("payment_status", "paid")
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to load receipt: ${error.message}`);
  }
  return data;
}

interface SendJobReceiptParams {
  jobId: string;
  email: boolean;
  sms: boolean;
}

type ChannelResult = { sent: true; testMode?: boolean } | { sent: false; error: string };

export type SendJobReceiptResult =
  | { ok: false; error: string }
  | { ok: true; email?: ChannelResult; sms?: ChannelResult };

export async function sendJobReceipt({
  jobId,
  email,
  sms,
}: SendJobReceiptParams): Promise<SendJobReceiptResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!email && !sms) return { ok: false, error: "Select at least one way to send the receipt" };

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, payment_status, receipt_token, customer_id, customers(id, first_name, phone, email), vehicles(year, make, model)"
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

  // Refuse to send if shop settings can't load — the receipt email recomputes
  // totals via calculateTotals, which silently falls back to DEFAULT_SETTINGS
  // (no shop supplies / hazmat) when settings is null. That could show a total
  // that differs from what the customer actually paid.
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
  } | null;

  const result: { email?: ChannelResult; sms?: ChannelResult } = {};

  // Each channel is isolated: a thrown error (e.g. Resend misconfig, network
  // blip) becomes a { sent:false } result instead of aborting the whole send —
  // so a failed email never prevents the text from going out, and the caller
  // always gets a per-channel status back.
  if (email) {
    try {
      const r = await sendPaymentReceiptEmail({ jobId });
      result.email = r.sent
        ? { sent: true, testMode: r.testMode }
        : { sent: false, error: r.error ?? "Couldn't send the email" };
    } catch (e) {
      result.email = { sent: false, error: e instanceof Error ? e.message : "Couldn't send the email" };
    }
  }

  if (sms) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const link = `${appUrl}/receipt/${job.receipt_token}`;
      const body = receiptSMS({
        firstName: customer.first_name,
        year: vehicle?.year,
        make: vehicle?.make,
        model: vehicle?.model,
        link,
      });
      const r = await sendCustomerSMS({ customerId: customer.id, body, jobId, line: "shop" });
      result.sms = "data" in r ? { sent: true, testMode: r.data?.testMode } : { sent: false, error: r.error };
    } catch (e) {
      result.sms = { sent: false, error: e instanceof Error ? e.message : "Couldn't send the text" };
    }
  }

  return { ok: true, ...result };
}
