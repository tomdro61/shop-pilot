"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import type { ActionResult } from "./_types";
import type { InvoiceDeliveryRow } from "@/lib/invoices/deliveries";

// Read-only. `messages` RLS is managers-only (is_manager()), so a tech gets an
// empty history, not an error. The log has no message-type column; the body
// filter is what separates an invoice send from the receipt, estimate and
// status texts that share a job_id — see classifyInvoiceMessage.
//
// Paged rather than capped: a chronic non-payer is exactly the customer whose
// oldest sends must not fall off the end of a silent LIMIT.
export async function getInvoiceDeliveriesForJobs(
  jobIds: string[]
): Promise<ActionResult<InvoiceDeliveryRow[]>> {
  if (jobIds.length === 0) return { ok: true, data: [] };

  const supabase = await createClient();
  try {
    const rows = await fetchAllRows<InvoiceDeliveryRow>(
      (from, to) =>
        supabase
          .from("messages")
          .select("id, job_id, channel, status, body, sent_at", { count: "exact" })
          .in("job_id", jobIds)
          .eq("direction", "out")
          .ilike("body", "%invoice%")
          .order("sent_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      "invoice send history"
    );
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
