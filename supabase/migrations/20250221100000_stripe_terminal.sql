-- Stripe Terminal support: add terminal payment method, PI tracking, walk-in customer

-- Add "terminal" to payment_method enum
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'terminal';

-- Add stripe_payment_intent_id to jobs for terminal payment tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Create walk-in sentinel customer (well-known UUID)
INSERT INTO customers (id, first_name, last_name, phone, email, notes)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Walk-In', 'Customer', null, null, 'Sentinel record for Quick Pay walk-in transactions'
)
ON CONFLICT (id) DO NOTHING;
