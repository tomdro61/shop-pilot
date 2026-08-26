import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";
import { sendJobReceiptWith } from "@/lib/receipts/send";

// Receipt sending runs here rather than in a server action so techs can do it.
// RLS gives a tech exactly two SELECT policies on `jobs` — assigned-to-self, and
// status in not_started/waiting_for_parts/in_progress — and record_quick_pay_job
// writes jobs with status='complete' and no assigned_tech. So a tech reading a
// Quick Pay job through their own session gets zero rows, and requireStaff() in
// front of the admin client IS the authorization boundary, the same arrangement
// and for the same reason as /api/quick-pay/charge.
//
// Because RLS is no longer doing the scoping, a tech must prove which payment
// they are sending a receipt for. Job id alone would let any tech session pull
// an arbitrary historical job's itemised receipt to a number they type, and
// /receipt/[token] is unauthenticated and non-expiring, so that disclosure would
// be permanent. Managers keep the unrestricted path via sendJobReceipt.
const TECH_WINDOW_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  let body: {
    jobId?: string;
    paymentIntentId?: string;
    emailTo?: string | null;
    smsTo?: string | null;
    email?: boolean;
    sms?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { jobId, paymentIntentId, emailTo, smsTo, email = false, sms = false } = body;
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (auth.role === "tech") {
    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, stripe_payment_intent_id, paid_at")
      .eq("id", jobId)
      .maybeSingle();

    // One generic refusal for every failure below, so this can't be used to
    // probe which job ids exist.
    const refuse = () =>
      NextResponse.json(
        { ok: false, error: "That payment isn't available to send a receipt for." },
        { status: 403 }
      );

    if (error) {
      Sentry.captureException(error, {
        tags: { source: "receipts-send", path: "tech-scope-check" },
        extra: { jobId },
      });
      return refuse();
    }
    if (!job || !paymentIntentId) return refuse();
    if (job.stripe_payment_intent_id !== paymentIntentId) return refuse();
    if (!job.paid_at || Date.now() - new Date(job.paid_at).getTime() > TECH_WINDOW_MS) {
      return refuse();
    }
  }

  const result = await sendJobReceiptWith(supabase, { jobId, email, sms, emailTo, smsTo });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
