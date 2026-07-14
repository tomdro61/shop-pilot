-- Quick Pay: defer job creation until the terminal payment actually succeeds.
--
-- Previously /api/quick-pay created a job (status=complete, payment_status=unpaid)
-- up front, then charged the reader. Canceled/abandoned/failed/timed-out payments
-- left the job orphaned as completed-but-unpaid. Now the job is only created on
-- payment success, by record_quick_pay_job() below, called idempotently from both
-- the client status poll and the Stripe webhook.

-- Idempotency arbiter for the ON CONFLICT in record_quick_pay_job. Non-partial on
-- purpose: Postgres treats NULLs as distinct, so the many jobs with no PI id don't
-- collide; and the function's bare `ON CONFLICT (stripe_payment_intent_id)` needs a
-- non-partial unique index on exactly that column — a partial index (WHERE ... IS
-- NOT NULL) would only work as the arbiter if the ON CONFLICT restated that WHERE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_stripe_payment_intent_id
  ON jobs (stripe_payment_intent_id);

-- Atomic job + line-item writer. Job insert and line-item insert MUST share one
-- transaction: if the winner inserted the job but died before the line item, the
-- loser (the other success caller) would skip the line item by design, leaving a
-- permanent paid job with $0 of line items that no retry could heal. Doing both
-- here means a crash rolls back the job too, so a retry cleanly re-creates both.
CREATE OR REPLACE FUNCTION record_quick_pay_job(
  p_pi text,
  p_amount_cents bigint,
  p_note text,
  p_category text
) RETURNS uuid
LANGUAGE plpgsql
-- SECURITY INVOKER (default): if a non-service caller ever reaches this, the
-- INSERTs run under their role and RLS blocks them — this can't mint a paid job
-- for anon/authenticated. EXECUTE is also revoked below as belt-and-suspenders.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
  v_today date := (now() AT TIME ZONE 'America/New_York')::date;
BEGIN
  INSERT INTO jobs (
    customer_id, status, category, date_received, date_finished,
    notes, payment_status, payment_method, charge_sales_tax,
    stripe_payment_intent_id, paid_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',  -- Walk-In sentinel customer
    'complete',
    COALESCE(NULLIF(p_category, ''), 'Quick Pay'),
    v_today,
    v_today,
    NULLIF(p_note, ''),
    'paid',
    'terminal',
    false,  -- Quick Pay is a flat, tax-inclusive counter amount
    p_pi,
    now()
  )
  ON CONFLICT (stripe_payment_intent_id) DO NOTHING
  RETURNING id INTO v_job_id;

  -- Lost the race: the other success caller (poll vs webhook) already recorded
  -- this PI. Return the existing job id; do NOT insert a duplicate line item.
  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id FROM jobs WHERE stripe_payment_intent_id = p_pi;
    RETURN v_job_id;
  END IF;

  -- Won the race: line item in the same transaction as the job above.
  INSERT INTO job_line_items (job_id, type, description, quantity, unit_cost, category)
  VALUES (
    v_job_id,
    'labor',
    COALESCE(NULLIF(p_note, ''), 'Quick Pay'),
    1,
    p_amount_cents::numeric / 100,
    NULLIF(p_category, '')
  );

  RETURN v_job_id;
END;
$$;

-- Only the service role (used by /api/terminal/status and the Stripe webhook) may
-- call this. Without the revoke, PostgREST would expose it to anon/authenticated
-- at /rest/v1/rpc/record_quick_pay_job — a fake-paid-job endpoint.
REVOKE ALL ON FUNCTION record_quick_pay_job(text, bigint, text, text) FROM public;
GRANT EXECUTE ON FUNCTION record_quick_pay_job(text, bigint, text, text) TO service_role;
