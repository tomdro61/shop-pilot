import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireStaff } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createTerminalPaymentIntent, processReaderPayment } from "@/lib/stripe/terminal";

// Quick Pay charge: create the terminal PaymentIntent (carrying amount/note/category
// as metadata) and arm the reader. The job is intentionally NOT created here — it is
// materialized only on payment success (see record_quick_pay_job), so a canceled or
// abandoned charge leaves nothing behind. requireStaff() is the gate: techs can arm
// the reader but have no RLS INSERT on jobs, so the eventual job write runs under the
// service role in the RPC, never here.
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { amountCents, note, category } = await request.json();

  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "A positive amountCents is required" }, { status: 400 });
  }

  // Stripe metadata values must be strings; omit keys entirely when absent so we
  // never write `undefined` into a Record<string, string>. `quick_pay` is the
  // discriminator the status route + webhook route on to materialize the job.
  const metadata: Record<string, string> = { quick_pay: "true" };
  if (typeof note === "string" && note.trim()) metadata.note = note.trim().slice(0, 480);
  if (typeof category === "string" && category.trim()) metadata.category = category.trim();

  let paymentIntentId: string;
  try {
    const paymentIntent = await createTerminalPaymentIntent(amountCents, metadata);
    paymentIntentId = paymentIntent.id;

    try {
      await processReaderPayment(paymentIntent.id);
    } catch (readerErr) {
      // Reader failed to arm. Cancel the PI so a metadata-carrying intent can't
      // settle later and conjure a job the operator never intended.
      try {
        await getStripe().paymentIntents.cancel(paymentIntent.id);
      } catch (cancelErr) {
        // Cleanup failed — a metadata-carrying PI may be left open. Settlement risk
        // is low (the reader never armed), but log it so a leaked intent is
        // traceable rather than silent. The original reader error still surfaces.
        console.error("[quick-pay] PI cancel after reader-arm failure failed:", cancelErr, "pi:", paymentIntent.id);
        Sentry.captureException(cancelErr, {
          level: "warning",
          tags: { source: "quick-pay-charge", path: "reader-arm-cancel-cleanup" },
          extra: { paymentIntentId: paymentIntent.id },
        });
      }
      throw readerErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start terminal payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ paymentIntentId });
}
