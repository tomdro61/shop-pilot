-- Add stripe_payment_intent_id to jobs for terminal payment tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
