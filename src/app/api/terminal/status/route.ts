import { NextRequest, NextResponse } from "next/server";
import { getPaymentIntentStatus } from "@/lib/stripe/terminal";
import { requireStaff } from "@/lib/auth";
import { recordQuickPayJob } from "@/lib/stripe/quick-pay";
import { recordTerminalPayment } from "@/lib/stripe/terminal-payment";

export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const pi = request.nextUrl.searchParams.get("pi");

  if (!pi) {
    return NextResponse.json(
      { error: "pi query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const status = await getPaymentIntentStatus(pi);

    // On success, record the payment directly (belt-and-suspenders with the
    // webhook). Both recording paths are idempotent with it.
    let jobId: string | null = null;
    let recorded: string | null = null;
    if (status.status === "succeeded" && status.metadata?.quick_pay === "true") {
      jobId = await recordQuickPayJob({
        paymentIntentId: pi,
        amountCents: status.amount,
        note: status.metadata.note ?? null,
        category: status.metadata.category ?? null,
        source: "terminal-status",
      });
    } else if (status.status === "succeeded" && status.metadata?.job_id) {
      const result = await recordTerminalPayment({
        paymentIntentId: pi,
        amountCents: status.amount,
        jobId: status.metadata.job_id,
        source: "terminal-status",
      });
      // A failed record isn't surfaced as a failed payment: the card was
      // charged, and the webhook retries the record. The client shows success.
      recorded = result.ok ? result.outcome : "error";
    } else if (status.status === "succeeded") {
      console.warn("[Terminal] Payment succeeded but no job_id/quick_pay in metadata:", pi);
    }

    return NextResponse.json({ ...status, jobId, recorded });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
