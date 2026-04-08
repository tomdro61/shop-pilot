-- Add "terminal" to payment_method enum (may have been missed in earlier migration)
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'terminal';
