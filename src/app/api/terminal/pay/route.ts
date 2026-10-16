import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";
import { calculateTotals } from "@/lib/utils/totals";
import { getStripe } from "@/lib/stripe";
import {
  cancelReaderAction,
  createTerminalPaymentIntent,
  processReaderPayment,
} from "@/lib/stripe/terminal";

// Techs take counter payments, so this stays requireStaff. The amount is
// computed here from the job, never taken from the client: the button's figure
// is only compared, so a line edited in another tab can't charge a stale total.
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { jobId?: unknown; amountCents?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : null;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }
  const clientCents =
    typeof body.amountCents === "number" && Number.isInteger(body.amountCents)
      ? body.amountCents
      : null;

  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, status, payment_status, charge_sales_tax, job_line_items(type, quantity, unit_cost, total, category)"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    Sentry.captureException(jobError, {
      tags: { source: "terminal-pay", path: "job-lookup" },
      extra: { jobId },
    });
    return NextResponse.json({ error: "Couldn't load the job" }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "complete") {
    return NextResponse.json({ error: "Job must be complete before collecting payment" }, { status: 409 });
  }
  if (job.payment_status === "paid" || job.payment_status === "waived") {
    return NextResponse.json({ error: "This job is already settled" }, { status: 409 });
  }

  const { data: settings, error: settingsError } = await supabase
    .from("shop_settings")
    .select("*")
    .limit(1)
    .single();

  if (settingsError || !settings) {
    Sentry.captureException(settingsError ?? new Error("shop_settings missing"), {
      tags: { source: "terminal-pay", path: "settings-load" },
      extra: { jobId },
    });
    return NextResponse.json(
      { error: "Couldn't load shop settings — nothing was charged. Refresh and try again." },
      { status: 500 }
    );
  }

  const totals = calculateTotals(job.job_line_items ?? [], settings, job.charge_sales_tax);
  const amountCents = Math.round(totals.grandTotal * 100);

  if (amountCents <= 0) {
    return NextResponse.json({ error: "Job total must be greater than zero" }, { status: 400 });
  }
  if (clientCents !== null && clientCents !== amountCents) {
    return NextResponse.json(
      { error: "The job total changed — refresh the page and try again" },
      { status: 409 }
    );
  }

  try {
    const paymentIntent = await createTerminalPaymentIntent(amountCents, {
      job_id: jobId,
    });

    await processReaderPayment(paymentIntent.id);

    // The id on the job is how a later refund, an undo, or the recorder tells
    // this attempt from another. Guarded on still-unpaid: a job settled
    // between the check above and this write must not be re-armed.
    const { data: armed, error: updateError } = await supabase
      .from("jobs")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", jobId)
      .neq("payment_status", "paid")
      .select("id")
      .maybeSingle();
    if (updateError) {
      Sentry.captureException(updateError, {
        tags: { source: "terminal-pay", path: "store-payment-intent" },
        extra: { jobId, paymentIntentId: paymentIntent.id },
      });
    } else if (!armed) {
      try {
        await cancelReaderAction();
        await getStripe().paymentIntents.cancel(paymentIntent.id);
      } catch (cancelErr) {
        Sentry.captureException(cancelErr, {
          level: "error",
          tags: { source: "terminal-pay", path: "cancel-after-settled" },
          extra: { jobId, paymentIntentId: paymentIntent.id },
        });
      }
      return NextResponse.json(
        { error: "This job was just settled — the reader was cleared" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amountCents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terminal payment failed";
    Sentry.captureException(err, {
      tags: { source: "terminal-pay", path: "reader" },
      extra: { jobId, amountCents },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
