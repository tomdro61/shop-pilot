import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTerminalPaymentIntent,
  processReaderPayment,
} from "@/lib/stripe/terminal";

export async function POST(request: Request) {
  try {
    const { jobId, amountCents } = await request.json();

    if (!jobId || !amountCents || amountCents <= 0) {
      return NextResponse.json(
        { error: "jobId and positive amountCents are required" },
        { status: 400 }
      );
    }

    // Create PaymentIntent with job metadata
    const paymentIntent = await createTerminalPaymentIntent(amountCents, {
      job_id: jobId,
    });

    // Push to reader
    await processReaderPayment(paymentIntent.id);

    // Store PI ID on the job
    const supabase = createAdminClient();
    await supabase
      .from("jobs")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", jobId);

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terminal payment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
