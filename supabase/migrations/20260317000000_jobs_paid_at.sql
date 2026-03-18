-- Add paid_at timestamp to jobs table for accurate tax reporting.
-- Tax is reported when collected (paid), not when work was completed (date_finished).
-- This column is set by recordPayment(), Stripe invoice webhook, and Terminal webhook.
ALTER TABLE jobs ADD COLUMN paid_at timestamptz;

-- Backfill: for jobs already marked as paid, use date_finished as best approximation.
UPDATE jobs
SET paid_at = date_finished::timestamptz
WHERE payment_status = 'paid'
  AND date_finished IS NOT NULL;
