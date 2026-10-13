"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./_types";
import type { InvoiceDeliveryRow } from "@/lib/invoices/deliveries";

// Read-only page data; RLS scopes `messages` to signed-in staff, the same way
// getInvoiceForJob relies on it. The body filter is the only thing that tells an
// invoice send apart from a receipt or an estimate in this log — see
// classifyInvoiceMessage for the wording it keys on.
export async function getInvoiceDeliveriesForJobs(
  jobIds: string[]
): Promise<ActionResult<InvoiceDeliveryRow[]>> {
  if (jobIds.length === 0) return { ok: true, data: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, job_id, channel, status, body, sent_at")
    .in("job_id", jobIds)
    .eq("direction", "out")
    .ilike("body", "%invoice%")
    .order("sent_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}
