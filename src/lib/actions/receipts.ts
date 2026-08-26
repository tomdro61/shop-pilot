"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/auth";
import {
  sendJobReceiptWith,
  type SendJobReceiptParams,
  type SendJobReceiptResult,
} from "@/lib/receipts/send";

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
const RECEIPT_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getReceiptByToken(token: string) {
  // A non-UUID token can't match the uuid column; querying it throws a Postgres
  // cast error (not PGRST116) that would surface as a 500. Treat a malformed
  // token as "not found" so a typo/bot gets the friendly page, not an error.
  if (!RECEIPT_TOKEN_RE.test(token)) return null;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, ro_number, payment_method, paid_at, charge_sales_tax, date_finished, customer_id, customers(first_name, last_name), vehicles(year, make, model), job_line_items(id, type, description, quantity, unit_cost, total, part_number, category)"
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

// Shop settings for the PUBLIC receipt page. getShopSettings() uses the anon
// client, but shop_settings RLS only permits authenticated reads — an
// unauthenticated /receipt visitor gets null there, which makes the page
// (correctly) refuse to render a total. Read via the admin client instead,
// scoped to this public codepath, so real settings (shop supplies, hazmat, tax)
// are used and the receipt total matches what the customer paid.
export async function getReceiptShopSettings() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shop_settings")
    .select("*")
    .limit(1)
    .single();
  if (error) {
    console.error("Failed to load shop settings for receipt:", error.message);
    return null;
  }
  return data;
}

export type { ChannelResult, SendJobReceiptResult } from "@/lib/receipts/send";

/**
 * Manager-facing send. Runs under the caller's RLS session; techs reach the same
 * helper through POST /api/receipts/send, which needs the admin client because
 * RLS gives techs no read on a completed job.
 */
export async function sendJobReceipt(
  params: SendJobReceiptParams
): Promise<SendJobReceiptResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  return sendJobReceiptWith(await createClient(), params);
}
