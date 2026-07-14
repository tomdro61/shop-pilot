import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";

interface RecordQuickPayJobParams {
  paymentIntentId: string;
  // The charged amount, in cents, from the succeeded PaymentIntent (pi.amount) —
  // the source of truth for what was collected, never the client-echoed amount.
  amountCents: number;
  note: string | null;
  category: string | null;
  // Route-specific Sentry source tag for the two callers.
  source: "terminal-status" | "stripe-webhook";
}

// Materializes the Quick Pay job + labor line item once the terminal payment has
// succeeded. Idempotent across the two success callers (the client status poll and
// the Stripe webhook) via record_quick_pay_job's ON CONFLICT on
// stripe_payment_intent_id: whichever fires first creates both rows atomically; the
// other gets the same job id back without duplicating anything. Returns the job id,
// or null if the write failed (the other caller is the backstop).
export async function recordQuickPayJob({
  paymentIntentId,
  amountCents,
  note,
  category,
  source,
}: RecordQuickPayJobParams): Promise<string | null> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    // pi.amount is always a positive integer for a succeeded card_present charge;
    // refuse anything else rather than write a $0/negative line item.
    console.error("[quick-pay] refusing non-positive amount:", amountCents, "pi:", paymentIntentId);
    Sentry.captureMessage("quick_pay_bad_amount", {
      level: "error",
      tags: { source, path: "quick-pay-materialize" },
      extra: { paymentIntentId, amountCents },
    });
    return null;
  }

  const supabase = createAdminClient();

  const { data: jobId, error } = await supabase.rpc("record_quick_pay_job", {
    p_pi: paymentIntentId,
    p_amount_cents: amountCents,
    p_note: note,
    p_category: category,
  });

  if (error) {
    console.error("[quick-pay] record_quick_pay_job failed:", error, "pi:", paymentIntentId);
    Sentry.captureException(error, {
      tags: { source, path: "quick-pay-materialize" },
      extra: { paymentIntentId },
    });
    return null;
  }

  if (!jobId) {
    // Should be unreachable — the function always resolves to a row (insert or the
    // ON CONFLICT re-select). Surface it; the caller treats null as "not recorded".
    console.error("[quick-pay] record_quick_pay_job returned no id, pi:", paymentIntentId);
    Sentry.captureMessage("quick_pay_null_job_id", {
      level: "error",
      tags: { source, path: "quick-pay-materialize" },
      extra: { paymentIntentId },
    });
    return null;
  }

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return jobId;
}
